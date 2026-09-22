/**
 * The Claude Code CLI adapter — B-CLI-ADAPTER Task 2, offline.
 *
 * The adapter describes a launch and reads a `stream-json` stdout back to the
 * exact text the model produced. Both directions are proved here with no
 * process, no network and no clock: the request side against literal
 * expectations, the projection side against the two sanitised probe streams
 * the pinned CLI actually emitted (`test/fixtures/claude-code-cli/README.md`)
 * and against a generator that builds a synthetic good stream and applies one
 * mutation per refusal.
 *
 * Four properties carry the weight. The accepted probe projects to the 35
 * bytes the probe harness reconstructed independently, compared as bytes and
 * by digest. The rejected probe — `subtype: "success"` with `is_error: true`
 * — is refused by the `is_error` conjunct, named. Every block ever started is
 * counted, so an index that comes round again in a second message is a second
 * call, not a replacement. And the concatenated deltas come back untouched:
 * an escape, a float's trailing zero and stray whitespace survive, which no
 * re-serialisation would preserve.
 *
 * Each refusal case pairs with an accepted sibling from the same generator,
 * so no refusal is satisfied by a stream that would have been refused anyway,
 * and each "ignored" event is shown both ignored and distinguishable from an
 * unknown one.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MAX_OUTPUT_TOKENS, ProviderOutputTruncatedError, ProviderRefusalError, roleOutputJsonSchema } from '../src/pipeline/anthropic-messages';
import {
  ApiKeySuppliedToSubscriptionRouteError,
  CLAUDE_CODE_CLI_ADAPTER,
  CLAUDE_CODE_CLI_IDENTITY,
  CLI_LAUNCH_URL,
  CliEnvelopeMalformedError,
  CliExitError,
  CliLaunchContextError,
  CliLaunchSpecMalformedError,
  CliModelMismatchError,
  CliMultipleStructuredOutputError,
  CliNoStructuredOutputError,
  CliOutputConflictError,
  CliOverageError,
  CliResultError,
  CliStopReasonError,
  CliStreamLifecycleError,
  CliStreamMalformedError,
  CliToolCallIdError,
  CliUnexpectedToolCallError,
  LAUNCH_CONTROL_ENV,
  PINNED_CLI,
  parseCliEnvelope,
  parseCliLaunchSpec,
  resolvePinnedCliPath,
  type CliEnvelope,
} from '../src/pipeline/claude-code-cli';
import { assertValidProviderAdapterIdentity } from '../src/pipeline/provider-adapter';
import type { RoleRequest } from '../src/pipeline/roles';

const here = dirname(fileURLToPath(import.meta.url));
const MODEL = 'claude-opus-5';
const PROMPT = '# Role: blind reader\n\nYou produce a reading.';
const INPUT = '# Requirement\n\nsomething/S-002 v1\n\n# Entitled closure (abc)\n\n…';

function fixture(name: string): string {
  return readFileSync(join(here, 'fixtures', 'claude-code-cli', name), 'utf8');
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function request(role: RoleRequest['role'] = 'reader', index = 0, model = MODEL): RoleRequest {
  return {
    role,
    index,
    model,
    promptSha256: 'a'.repeat(64),
    ...(role === 'prosecutor' ? { lens: 'missing_criterion' } : {}),
    messages: [
      { from: 'prompt', content: PROMPT },
      { from: 'input', content: INPUT },
    ],
  };
}

/** The transport's envelope around a stdout, exit 0 unless overridden. */
function wrap(stdout: string, over: Partial<CliEnvelope> = {}): string {
  return JSON.stringify({ exitCode: 0, signal: null, stdout, stderrBytes: 0, ...over });
}

// ---------------------------------------------------------------------------
// A synthetic good stream, shaped like the accepted probe
// ---------------------------------------------------------------------------

type Ev = Record<string, unknown>;

const META = { session_id: 'sess', uuid: 'uuid' } as const;

function se(kind: string, extra: Ev = {}): Ev {
  return { type: 'stream_event', event: { type: kind, ...extra }, parent_tool_use_id: null, ...META };
}

function usage(): Ev {
  return { input_tokens: 2, output_tokens: 82, cache_creation_input_tokens: 626, cache_read_input_tokens: 0 };
}

interface SynthOptions {
  /** How the payload is split into `input_json_delta` events; default: three-character chunks. */
  deltas?: string[];
  /** Index of the tool block; blocks in `before` take the indices under it. */
  index?: number;
  /** Blocks emitted before the tool block, in order. */
  before?: ('thinking' | 'text')[];
  ping?: boolean;
  assistantAfterStop?: boolean;
  stopReason?: unknown;
  stopDetails?: unknown;
  /** What the assistant message restates as `tool_use.input`; default: the parsed payload. */
  statedInput?: unknown;
  /** What `result.structured_output` says; default: the parsed payload. */
  structuredOutput?: unknown;
  model?: string;
  rateLimit?: Ev | null;
  toolName?: string;
}

const HAS = (o: SynthOptions, key: keyof SynthOptions): boolean => Object.prototype.hasOwnProperty.call(o, key);

function chunks(text: string, size = 3): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
}

function synth(payload: string, o: SynthOptions = {}): Ev[] {
  const model = o.model ?? MODEL;
  const parsed = JSON.parse(payload) as unknown;
  const stated = HAS(o, 'statedInput') ? o.statedInput : parsed;
  const structured = HAS(o, 'structuredOutput') ? o.structuredOutput : parsed;
  const toolName = o.toolName ?? 'StructuredOutput';
  const before = o.before ?? [];
  const index = o.index ?? before.length;
  const events: Ev[] = [];
  events.push({ type: 'system', subtype: 'init', apiKeySource: 'none', model, tools: ['StructuredOutput'], mcp_servers: [], claude_code_version: '2.1.226', ...META });
  events.push({ type: 'system', subtype: 'status', status: 'requesting', ...META });
  events.push(se('message_start', { message: { id: 'msg_1', type: 'message', role: 'assistant', model, content: [], stop_reason: null, usage: { input_tokens: 2, output_tokens: 25 } } }));
  before.forEach((kind, i) => {
    if (kind === 'thinking') {
      events.push(se('content_block_start', { index: i, content_block: { type: 'thinking', thinking: '', signature: '' } }));
      events.push(se('content_block_delta', { index: i, delta: { type: 'thinking_delta', thinking: 'considering' } }));
      events.push(se('content_block_delta', { index: i, delta: { type: 'signature_delta', signature: 'sig' } }));
    } else {
      events.push(se('content_block_start', { index: i, content_block: { type: 'text', text: '' } }));
      events.push(se('content_block_delta', { index: i, delta: { type: 'text_delta', text: 'Here is the answer.' } }));
    }
    events.push(se('content_block_stop', { index: i }));
  });
  events.push(se('content_block_start', { index, content_block: { type: 'tool_use', id: 'toolu_1', name: toolName, input: {} } }));
  if (o.ping) events.push(se('ping'));
  for (const partial of o.deltas ?? chunks(payload)) {
    events.push(se('content_block_delta', { index, delta: { type: 'input_json_delta', partial_json: partial } }));
  }
  const assistant: Ev = {
    type: 'assistant',
    message: { id: 'msg_1', type: 'message', role: 'assistant', model, content: [{ type: 'tool_use', id: 'toolu_1', name: toolName, input: stated }], stop_reason: null, usage: usage() },
    request_id: 'req_1',
    parent_tool_use_id: null,
    ...META,
  };
  if (!o.assistantAfterStop) events.push(assistant);
  events.push(se('content_block_stop', { index }));
  if (o.assistantAfterStop) events.push(assistant);
  events.push({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'Structured output provided successfully' }] }, parent_tool_use_id: null, ...META });
  events.push(se('message_delta', { delta: { stop_reason: HAS(o, 'stopReason') ? o.stopReason : 'tool_use', stop_sequence: null, stop_details: HAS(o, 'stopDetails') ? o.stopDetails : null }, usage: usage() }));
  events.push(se('message_stop'));
  const rateLimit = HAS(o, 'rateLimit') ? o.rateLimit : { isUsingOverage: false, overageDisabledReason: 'org_level_disabled', overageStatus: 'rejected', rateLimitType: 'five_hour', resetsAt: 1790075400, status: 'allowed' };
  if (rateLimit !== null) events.push({ type: 'rate_limit_event', rate_limit_info: rateLimit, ...META });
  events.push({
    type: 'result',
    subtype: 'success',
    is_error: false,
    num_turns: 2,
    result: JSON.stringify(parsed),
    stop_reason: 'tool_use',
    ...(structured === undefined ? {} : { structured_output: structured }),
    modelUsage: { [model]: { inputTokens: 2, outputTokens: 82 } },
    usage: usage(),
    total_cost_usd: 0.00832,
    ...META,
  });
  return events;
}

function serialise(events: Ev[]): string {
  return `${events.map((e) => JSON.stringify(e)).join('\n')}\n`;
}

function project(events: Ev[], over: Partial<CliEnvelope> = {}, req: RoleRequest = request()): string {
  return CLAUDE_CODE_CLI_ADAPTER.projectResponse(wrap(serialise(events), over), req);
}

function readUsage(events: Ev[], over: Partial<CliEnvelope> = {}) {
  return CLAUDE_CODE_CLI_ADAPTER.readUsage!(wrap(serialise(events), over));
}

const isStream = (kind: string) => (e: Ev): boolean => e['type'] === 'stream_event' && (e['event'] as Ev)['type'] === kind;
const isType = (type: string) => (e: Ev): boolean => e['type'] === type;

/** Position of the n-th event matching, 0-based; throws rather than returning -1 so a mutation cannot miss its target silently. */
function at(events: Ev[], pred: (e: Ev) => boolean, nth = 0): number {
  let seen = 0;
  for (let i = 0; i < events.length; i += 1) {
    if (pred(events[i]!)) {
      if (seen === nth) return i;
      seen += 1;
    }
  }
  throw new Error(`no event #${nth} matching the predicate`);
}

function inner(events: Ev[], i: number): Ev {
  return events[i]!['event'] as Ev;
}

const PAYLOAD = '{"token": "DS-SYNTH-001", "sum": 5}';
/** Escapes, a float's trailing zero and irregular whitespace: everything a re-serialisation would normalise away. */
const ESCAPED = String.raw`{"s": "é\n\"q\"",  "n": 1.50, "arr": [ 1 ,2 ], "z": null}`;

// ---------------------------------------------------------------------------
// Identity, constants, request
// ---------------------------------------------------------------------------

describe('identity and constants', () => {
  it('C1 — is claude-code-cli@1 on the process channel, with the pin exactly as recorded', () => {
    expect(CLAUDE_CODE_CLI_ADAPTER.identity).toEqual(CLAUDE_CODE_CLI_IDENTITY);
    expect(CLAUDE_CODE_CLI_IDENTITY).toEqual({ id: 'claude-code-cli', version: '1' });
    expect(() => assertValidProviderAdapterIdentity(CLAUDE_CODE_CLI_IDENTITY)).not.toThrow();
    expect(CLAUDE_CODE_CLI_ADAPTER.channel).toBe('process');
    expect(PINNED_CLI).toEqual({
      path: '~/.local/share/claude/versions/2.1.226',
      version: '2.1.226',
      sha256: '013a1cf17df5ff1dcc189d5d6fd3fdd5f097ddc3cd41aa9992e99805574febbe',
      sizeBytes: 279661952,
    });
    expect(resolvePinnedCliPath('/Users/someone')).toBe('/Users/someone/.local/share/claude/versions/2.1.226');
    expect(resolvePinnedCliPath('/Users/someone/')).toBe('/Users/someone/.local/share/claude/versions/2.1.226');
    expect(() => resolvePinnedCliPath('relative')).toThrow(/absolute home/);
    expect(() => resolvePinnedCliPath('')).toThrow(/absolute home/);
  });

  it('C2 — the launch control environment is exactly the nine variables the probe ran under', () => {
    expect(LAUNCH_CONTROL_ENV).toEqual({
      CLAUDE_CODE_MAX_RETRIES: '0',
      MAX_STRUCTURED_OUTPUT_RETRIES: '0',
      CLAUDE_CODE_MAX_OUTPUT_TOKENS: '16000',
      CLAUDE_CODE_DISABLE_NONSTREAMING_FALLBACK: '1',
      CLAUDE_CODE_DISABLE_REFUSAL_FALLBACK: '1',
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
      DISABLE_TELEMETRY: '1',
      DISABLE_ERROR_REPORTING: '1',
      DISABLE_AUTOUPDATER: '1',
    });
    expect(Object.keys(LAUNCH_CONTROL_ENV)).toHaveLength(9);
    // The ceiling is the HTTP adapter's, so the two routes cannot drift apart.
    expect(LAUNCH_CONTROL_ENV['CLAUDE_CODE_MAX_OUTPUT_TOKENS']).toBe(String(MAX_OUTPUT_TOKENS));
    expect(Object.isFrozen(LAUNCH_CONTROL_ENV)).toBe(true);
  });
});

describe('buildRequest', () => {
  it('R1 — describes a SPAWN of the pinned CLI with the launch spec as body, keys in order, no headers', () => {
    const built = CLAUDE_CODE_CLI_ADAPTER.buildRequest(request(), { endpoint: '', apiKey: '' });
    const expectedBody = JSON.stringify({ model: MODEL, systemPrompt: PROMPT, userMessage: INPUT, jsonSchema: roleOutputJsonSchema('reader'), effort: 'high', role: 'reader', index: 0 });
    expect(built).toEqual({ url: 'claude-code-cli:pinned', method: 'SPAWN', headers: {}, body: expectedBody });
    expect(built.url).toBe(CLI_LAUNCH_URL);
    expect(Object.keys(JSON.parse(built.body))).toEqual(['model', 'systemPrompt', 'userMessage', 'jsonSchema', 'effort', 'role', 'index']);
    // The transport reads the same spec back.
    expect(parseCliLaunchSpec(built.body)).toEqual({ model: MODEL, systemPrompt: PROMPT, userMessage: INPUT, jsonSchema: roleOutputJsonSchema('reader'), effort: 'high', role: 'reader', index: 0 });
    // Every role sends its own schema, and names itself last.
    const prosecutor = parseCliLaunchSpec(CLAUDE_CODE_CLI_ADAPTER.buildRequest(request('prosecutor', 2), { endpoint: '', apiKey: '' }).body);
    expect(prosecutor.jsonSchema).toEqual(roleOutputJsonSchema('prosecutor'));
    expect(prosecutor.jsonSchema).not.toEqual(roleOutputJsonSchema('reader'));
    expect([prosecutor.role, prosecutor.index]).toEqual(['prosecutor', 2]);
    // The endpoint is deployment configuration for the HTTP route and has no meaning here.
    expect(CLAUDE_CODE_CLI_ADAPTER.buildRequest(request(), { endpoint: 'https://api.example.invalid/v1/messages', apiKey: '' })).toEqual(built);
  });

  it('R2 — refuses a non-empty API key by name, without echoing it', () => {
    const key = 'sk-ant-should-not-appear-0123456789';
    let caught: unknown;
    try {
      CLAUDE_CODE_CLI_ADAPTER.buildRequest(request(), { endpoint: '', apiKey: key });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ApiKeySuppliedToSubscriptionRouteError);
    expect((caught as Error).name).toBe('ApiKeySuppliedToSubscriptionRouteError');
    expect((caught as Error).message).not.toContain(key);
    expect((caught as Error).message).toMatch(/reader\[0\]/);
  });

  it('R3 — refuses a request whose messages are not exactly one prompt and one input, before building anything', () => {
    const extra: RoleRequest = { ...request(), messages: [...request().messages, { from: 'agent', content: '{}' }] };
    expect(() => CLAUDE_CODE_CLI_ADAPTER.buildRequest(extra, { endpoint: '', apiKey: '' })).toThrow(/agent/);
    const missing: RoleRequest = { ...request(), messages: [request().messages[0]!] };
    expect(() => CLAUDE_CODE_CLI_ADAPTER.buildRequest(missing, { endpoint: '', apiKey: '' })).toThrow(/found 1 prompt and 0 input/);
  });

  it('R4 — parseCliLaunchSpec refuses anything that is not exactly a launch spec', () => {
    expect(() => parseCliLaunchSpec('not json')).toThrow(CliLaunchSpecMalformedError);
    const named = { role: 'reader', index: 0 };
    expect(() => parseCliLaunchSpec(JSON.stringify({ model: MODEL, systemPrompt: '', userMessage: '', jsonSchema: {}, effort: 'medium', ...named }))).toThrow(/effort/);
    expect(() => parseCliLaunchSpec(JSON.stringify({ model: MODEL, systemPrompt: '', userMessage: '', jsonSchema: {}, effort: 'high', ...named, extra: 1 }))).toThrow(/extra/);
    expect(() => parseCliLaunchSpec(JSON.stringify({ model: '', systemPrompt: '', userMessage: '', jsonSchema: {}, effort: 'high', ...named }))).toThrow(/model/);
    expect(() => parseCliLaunchSpec(JSON.stringify({ model: MODEL, systemPrompt: '', jsonSchema: {}, effort: 'high', ...named }))).toThrow(/userMessage/);
    expect(() => parseCliLaunchSpec(JSON.stringify({ model: MODEL, systemPrompt: '', userMessage: '', jsonSchema: {}, effort: 'high' }))).toThrow(/role/);
    expect(() => parseCliLaunchSpec(JSON.stringify({ model: MODEL, systemPrompt: '', userMessage: '', jsonSchema: {}, effort: 'high', role: 'reader', index: -1 }))).toThrow(/index/);
  });
});

// ---------------------------------------------------------------------------
// The probe fixtures
// ---------------------------------------------------------------------------

describe('the probe fixtures', () => {
  it('F1 — the accepted probe projects to exactly the 35 bytes the harness reconstructed, and its usage is read', () => {
    const stdout = fixture('probe-accepted.stream.jsonl');
    expect(sha256(Buffer.from(stdout, 'utf8'))).toBe('ce7a3dbae663e63b1468ef73ed4b7d3b5eb08d850a9610c3226e29e0e3f4f0e2');
    const out = CLAUDE_CODE_CLI_ADAPTER.projectResponse(wrap(stdout), request());
    const bytes = Buffer.from(out, 'utf8');
    expect(bytes).toEqual(Buffer.from('{"token": "DS-SYNTH-001", "sum": 5}', 'utf8'));
    expect(bytes.length).toBe(35);
    expect(sha256(bytes)).toBe('ee0644e93174110fd74f29d0a06be362d46181bac5ae998e26abbe5fec27b09c');
    expect(CLAUDE_CODE_CLI_ADAPTER.readUsage!(wrap(stdout))).toEqual({ inputTokens: 2, outputTokens: 82, cacheCreationInputTokens: 626, cacheReadInputTokens: 0 });
    // The projection is against the requested model, so another model's request refuses the same stream.
    expect(() => CLAUDE_CODE_CLI_ADAPTER.projectResponse(wrap(stdout), request('reader', 0, 'claude-sonnet-5'))).toThrow(CliLaunchContextError);
  });

  it('F2 — the auth-failed probe is refused by the is_error conjunct, by name, although its subtype is "success"', () => {
    // The probe's actual exit code was 1 (summary.json), which CliExitError refuses
    // first; F3 shows that. Here the stream is wrapped with exit 0 so that the
    // result check is what decides, and the decision must name is_error.
    const stdout = fixture('probe-auth-failed.stream.jsonl');
    expect(sha256(Buffer.from(stdout, 'utf8'))).toBe('83ab6da2d55ff9bcec07b6578a80c950a71da3b576b185b42573b95abf70334c');
    expect(stdout).toContain('"subtype":"success"');
    expect(stdout).toContain('"is_error":true');
    let caught: unknown;
    try {
      CLAUDE_CODE_CLI_ADAPTER.projectResponse(wrap(stdout), request());
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(CliResultError);
    expect((caught as Error).message).toMatch(/is_error true/);
    expect(CLAUDE_CODE_CLI_ADAPTER.readUsage!(wrap(stdout))).toBeNull();
  });

  it('F3 — the auth-failed probe under its actual exit code is refused by CliExitError before the stream is read', () => {
    const stdout = fixture('probe-auth-failed.stream.jsonl');
    expect(() => CLAUDE_CODE_CLI_ADAPTER.projectResponse(wrap(stdout, { exitCode: 1 }), request())).toThrow(CliExitError);
    expect(() => CLAUDE_CODE_CLI_ADAPTER.projectResponse(wrap(stdout, { exitCode: 1 }), request())).toThrow(/exitCode 1/);
    expect(CLAUDE_CODE_CLI_ADAPTER.readUsage!(wrap(stdout, { exitCode: 1 }))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Accepted variants from the generator
// ---------------------------------------------------------------------------

describe('accepted streams', () => {
  it('G1 — the synthetic good stream projects to its payload, byte for byte', () => {
    expect(project(synth(PAYLOAD))).toBe(PAYLOAD);
  });

  it('G2 — escapes, a trailing zero and irregular whitespace come back untouched: the deltas, not a re-serialisation', () => {
    const out = project(synth(ESCAPED));
    expect(Buffer.from(out, 'utf8')).toEqual(Buffer.from(ESCAPED, 'utf8'));
    expect(out).toBe(ESCAPED);
    // The assistant and the result restate the same value in a different spelling; that is not a conflict.
    expect(JSON.stringify(JSON.parse(ESCAPED))).not.toBe(ESCAPED);
  });

  it('G3 — one-character deltas, an empty first delta and a single delta all concatenate to the payload', () => {
    expect(project(synth(PAYLOAD, { deltas: [...PAYLOAD] }))).toBe(PAYLOAD);
    expect(project(synth(PAYLOAD, { deltas: ['', ...chunks(PAYLOAD, 5)] }))).toBe(PAYLOAD);
    expect(project(synth(PAYLOAD, { deltas: [PAYLOAD] }))).toBe(PAYLOAD);
  });

  it('G4 — thinking-then-tool, text-then-tool and both are accepted; the tool block need not be index 0', () => {
    expect(project(synth(PAYLOAD, { before: ['thinking'] }))).toBe(PAYLOAD);
    expect(project(synth(PAYLOAD, { before: ['text'] }))).toBe(PAYLOAD);
    expect(project(synth(PAYLOAD, { before: ['thinking', 'text'] }))).toBe(PAYLOAD);
    expect(project(synth(PAYLOAD, { index: 3 }))).toBe(PAYLOAD);
  });

  it('G5 — ping, system status and a second system subtype are ignored; assistant may arrive before or after the block stop', () => {
    expect(project(synth(PAYLOAD, { ping: true }))).toBe(PAYLOAD);
    expect(project(synth(PAYLOAD, { assistantAfterStop: true }))).toBe(PAYLOAD);
    const events = synth(PAYLOAD);
    events.splice(2, 0, { type: 'system', subtype: 'compact_boundary', ...META });
    expect(project(events)).toBe(PAYLOAD);
  });

  it('G6 — blank lines, CRLF line ends and a missing final newline do not change the projection', () => {
    const text = serialise(synth(PAYLOAD));
    expect(CLAUDE_CODE_CLI_ADAPTER.projectResponse(wrap(text.trimEnd()), request())).toBe(PAYLOAD);
    expect(CLAUDE_CODE_CLI_ADAPTER.projectResponse(wrap(text.replace(/\n/g, '\r\n')), request())).toBe(PAYLOAD);
    expect(CLAUDE_CODE_CLI_ADAPTER.projectResponse(wrap(`\n\n${text.replace(/\n/g, '\n\n')}`), request())).toBe(PAYLOAD);
  });

  it('G7 — the rate-limit shape the probe reported (overageStatus rejected, status allowed, no overage) is accepted', () => {
    expect(project(synth(PAYLOAD, { rateLimit: { isUsingOverage: false, overageStatus: 'rejected', status: 'allowed' } }))).toBe(PAYLOAD);
    expect(project(synth(PAYLOAD, { rateLimit: null }))).toBe(PAYLOAD);
  });
});

// ---------------------------------------------------------------------------
// Refusals: envelope and exit
// ---------------------------------------------------------------------------

describe('envelope and exit refusals', () => {
  it('E1 — a non-zero exit is refused by CliExitError before the stream is read, even when the stream is perfect', () => {
    expect(() => project(synth(PAYLOAD), { exitCode: 1 })).toThrow(CliExitError);
    expect(() => project(synth(PAYLOAD), { exitCode: 1, stderrBytes: 12 })).toThrow(/exitCode 1, signal null, 12 stderr bytes/);
  });

  it('E2 — a signal is refused by CliExitError, naming it', () => {
    expect(() => project(synth(PAYLOAD), { exitCode: null, signal: 'SIGTERM' })).toThrow(CliExitError);
    expect(() => project(synth(PAYLOAD), { exitCode: null, signal: 'SIGTERM' })).toThrow(/signal SIGTERM/);
    // A signal beside exit 0 is still not a normal exit.
    expect(() => project(synth(PAYLOAD), { exitCode: 0, signal: 'SIGKILL' })).toThrow(CliExitError);
  });

  it('E3 — a body that is not a CliEnvelope is refused by name', () => {
    expect(() => CLAUDE_CODE_CLI_ADAPTER.projectResponse('nope', request())).toThrow(CliEnvelopeMalformedError);
    expect(() => CLAUDE_CODE_CLI_ADAPTER.projectResponse(JSON.stringify({ exitCode: 0, signal: null, stderrBytes: 0 }), request())).toThrow(/stdout/);
    expect(() => CLAUDE_CODE_CLI_ADAPTER.projectResponse(JSON.stringify({ exitCode: 0, signal: null, stdout: '', stderrBytes: 0, extra: 1 }), request())).toThrow(/extra/);
    expect(() => parseCliEnvelope(JSON.stringify({ exitCode: 0.5, signal: null, stdout: '', stderrBytes: 0 }))).toThrow(/exitCode/);
    expect(parseCliEnvelope(wrap('x', { exitCode: 3 }))).toEqual({ exitCode: 3, signal: null, stdout: 'x', stderrBytes: 0 });
  });

  it('E4 — a stdout line that is not one JSON object is refused, naming the line', () => {
    const events = synth(PAYLOAD);
    const text = serialise(events).split('\n');
    text[4] = '{not json';
    expect(() => CLAUDE_CODE_CLI_ADAPTER.projectResponse(wrap(text.join('\n')), request())).toThrow(CliStreamMalformedError);
    expect(() => CLAUDE_CODE_CLI_ADAPTER.projectResponse(wrap(text.join('\n')), request())).toThrow(/stream line 5 is not a JSON object/);
    text[4] = '[1, 2]';
    expect(() => CLAUDE_CODE_CLI_ADAPTER.projectResponse(wrap(text.join('\n')), request())).toThrow(/line 5 .* parses as an array/);
    text[4] = '"string"';
    expect(() => CLAUDE_CODE_CLI_ADAPTER.projectResponse(wrap(text.join('\n')), request())).toThrow(/line 5 .* parses as a string/);
  });
});

// ---------------------------------------------------------------------------
// Refusals: the lifecycle state machine
// ---------------------------------------------------------------------------

interface LifecycleCase {
  id: string;
  mutate(events: Ev[]): void;
  /** The refusal names this position (a line, or end of stream) and this detail. */
  expected: RegExp | ((events: Ev[]) => RegExp);
}

const line = (i: number): number => i + 1;

const LIFECYCLE_CASES: LifecycleCase[] = [
  {
    id: 'L1 message_start while a message is open',
    mutate: (ev) => ev.splice(at(ev, isStream('content_block_start')), 0, se('message_start', { message: { model: MODEL } })),
    expected: (ev) => new RegExp(`line ${line(at(ev, isStream('message_start'), 1))} — message_start while the message from line ${line(at(ev, isStream('message_start')))} is open`),
  },
  {
    id: 'L2 a block event outside an open message',
    mutate: (ev) => { const [start] = ev.splice(at(ev, isStream('content_block_start')), 1); ev.splice(at(ev, isStream('message_start')), 0, start!); },
    expected: (ev) => new RegExp(`line ${line(at(ev, isStream('content_block_start')))} — content_block_start outside an open message`),
  },
  {
    id: 'L3 an index reused within one message',
    mutate: (ev) => ev.splice(at(ev, isStream('message_delta')), 0, se('content_block_start', { index: 0, content_block: { type: 'text', text: '' } })),
    expected: (ev) => new RegExp(`line ${line(at(ev, isStream('content_block_start'), 1))} — content_block_start reuses index 0 within the message from line ${line(at(ev, isStream('message_start')))} \\(first started at line ${line(at(ev, isStream('content_block_start')))}\\)`),
  },
  {
    id: 'L4 a block started while another is open',
    mutate: (ev) => ev.splice(at(ev, isStream('content_block_start')) + 1, 0, se('content_block_start', { index: 1, content_block: { type: 'text', text: '' } })),
    expected: (ev) => new RegExp(`line ${line(at(ev, isStream('content_block_start'), 1))} — content_block_start while block 0 \\(line ${line(at(ev, isStream('content_block_start')))}\\) is open`),
  },
  {
    id: 'L5 a delta after the block stopped',
    mutate: (ev) => ev.splice(at(ev, isStream('content_block_stop')) + 1, 0, se('content_block_delta', { index: 0, delta: { type: 'input_json_delta', partial_json: '' } })),
    expected: (ev) => new RegExp(`line ${line(at(ev, isStream('content_block_stop')) + 1)} — content_block_delta for index 0 after its content_block_stop`),
  },
  {
    id: 'L6 a delta whose type does not match the block',
    mutate: (ev) => { (inner(ev, at(ev, isStream('content_block_delta'), 2))['delta'] as Ev)['type'] = 'text_delta'; },
    expected: (ev) => new RegExp(`line ${line(at(ev, isStream('content_block_delta'), 2))} — delta type "text_delta" does not match block type "tool_use" at index 0`),
  },
  {
    id: 'L7 a duplicate block stop',
    mutate: (ev) => ev.splice(at(ev, isStream('content_block_stop')), 0, se('content_block_stop', { index: 0 })),
    expected: (ev) => new RegExp(`line ${line(at(ev, isStream('content_block_stop'), 1))} — duplicate content_block_stop for index 0`),
  },
  {
    id: 'L8 message_stop without message_delta',
    mutate: (ev) => ev.splice(at(ev, isStream('message_delta')), 1),
    expected: (ev) => new RegExp(`line ${line(at(ev, isStream('message_stop')))} — message_stop without a message_delta`),
  },
  {
    id: 'L9 a non-integer index',
    mutate: (ev) => { inner(ev, at(ev, isStream('content_block_delta'), 1))['index'] = 0.5; },
    expected: (ev) => new RegExp(`line ${line(at(ev, isStream('content_block_delta'), 1))} — content_block_delta carries a non-integer index 0.5`),
  },
  {
    id: 'L10 a string index',
    mutate: (ev) => { inner(ev, at(ev, isStream('content_block_start')))['index'] = '0'; },
    expected: (ev) => new RegExp(`line ${line(at(ev, isStream('content_block_start')))} — content_block_start carries a non-integer index "0"`),
  },
  {
    id: 'L11 an unknown stream event type, including error',
    mutate: (ev) => ev.splice(at(ev, isStream('content_block_delta')), 0, se('error', { error: { type: 'overloaded_error', message: 'Overloaded' } })),
    expected: (ev) => new RegExp(`line ${line(at(ev, isStream('error')))} — unknown stream event type "error"`),
  },
  {
    id: 'L12 an unknown top-level event type',
    mutate: (ev) => ev.splice(at(ev, isType('user')), 0, { type: 'weird', ...META }),
    expected: (ev) => new RegExp(`line ${line(at(ev, isType('weird')))} — unknown top-level event type "weird"`),
  },
  {
    id: 'L13 a second system init',
    mutate: (ev) => ev.splice(2, 0, { ...ev[0]! }),
    expected: /line 3 — a second system init event \(the first was line 1\)/,
  },
  {
    id: 'L14 no system init at all',
    mutate: (ev) => ev.splice(0, 1),
    expected: /end of stream — no system init event arrived/,
  },
  {
    id: 'L15 the stream ended with a message open',
    mutate: (ev) => ev.splice(at(ev, isStream('message_stop')), 1),
    expected: (ev) => new RegExp(`end of stream — the stream ended while the message from line ${line(at(ev, isStream('message_start')))} is open`),
  },
  {
    id: 'L16 message_stop while a block is open',
    mutate: (ev) => ev.splice(at(ev, isStream('content_block_stop')), 1),
    expected: (ev) => new RegExp(`line ${line(at(ev, isStream('message_stop')))} — message_stop while block 0 \\(line ${line(at(ev, isStream('content_block_start')))}\\) is open`),
  },
  {
    id: 'L17 a delta for an index never started',
    mutate: (ev) => { inner(ev, at(ev, isStream('content_block_delta')))['index'] = 7; },
    expected: (ev) => new RegExp(`line ${line(at(ev, isStream('content_block_delta')))} — content_block_delta for index 7, which was never started`),
  },
  {
    id: 'L18 a stop for an index never started',
    mutate: (ev) => { inner(ev, at(ev, isStream('content_block_stop')))['index'] = 7; },
    expected: (ev) => new RegExp(`line ${line(at(ev, isStream('content_block_stop')))} — content_block_stop for index 7, which was never started`),
  },
  {
    id: 'L19 a second message_delta',
    mutate: (ev) => ev.splice(at(ev, isStream('message_delta')), 0, se('message_delta', { delta: { stop_reason: 'tool_use' } })),
    expected: (ev) => new RegExp(`line ${line(at(ev, isStream('message_delta'), 1))} — a second message_delta`),
  },
  {
    id: 'L20 a stream_event without an event object',
    mutate: (ev) => { ev[at(ev, isStream('ping'))]!['event'] = 'ping'; },
    expected: (ev) => new RegExp(`line ${line(at(ev, (e) => e['type'] === 'stream_event' && e['event'] === 'ping'))} — stream_event without an event object`),
  },
  {
    id: 'L21 an input_json_delta whose partial_json is not a string',
    mutate: (ev) => { (inner(ev, at(ev, isStream('content_block_delta')))['delta'] as Ev)['partial_json'] = 5; },
    expected: (ev) => new RegExp(`line ${line(at(ev, isStream('content_block_delta')))} — input_json_delta at index 0 carries a non-string partial_json`),
  },
  {
    id: 'L22 message_delta outside an open message',
    mutate: (ev) => ev.splice(at(ev, isStream('message_start')), 0, se('message_delta', { delta: { stop_reason: 'tool_use' } })),
    expected: (ev) => new RegExp(`line ${line(at(ev, isStream('message_delta')))} — message_delta outside an open message`),
  },
];

describe('lifecycle refusals', () => {
  for (const c of LIFECYCLE_CASES) {
    it(`${c.id} → CliStreamLifecycleError naming the position`, () => {
      const events = synth(PAYLOAD, { ping: true });
      c.mutate(events);
      const expected = typeof c.expected === 'function' ? c.expected(events) : c.expected;
      let caught: unknown;
      try {
        project(events);
      } catch (error) {
        caught = error;
      }
      expect(caught, 'the mutation did not refuse').toBeInstanceOf(CliStreamLifecycleError);
      expect((caught as Error).message).toMatch(expected);
    });
  }

  it('L0 — positive control: the unmutated stream the cases start from is accepted', () => {
    expect(project(synth(PAYLOAD, { ping: true }))).toBe(PAYLOAD);
  });
});

// ---------------------------------------------------------------------------
// Refusals: launch context, result, overage, model
// ---------------------------------------------------------------------------

describe('launch context refusals', () => {
  const cases: [string, Ev, RegExp][] = [
    ['model', { model: 'claude-sonnet-5' }, /model "claude-sonnet-5"/],
    ['apiKeySource', { apiKeySource: 'ANTHROPIC_API_KEY' }, /apiKeySource "ANTHROPIC_API_KEY" \(must be "none"\)/],
    ['tools with an extra tool', { tools: ['StructuredOutput', 'Bash'] }, /tools \["StructuredOutput","Bash"\]/],
    ['tools empty', { tools: [] }, /tools \[\]/],
    ['mcp_servers non-empty', { mcp_servers: [{ name: 'x' }] }, /mcp_servers \[\{"name":"x"\}\] \(must be empty\)/],
  ];
  for (const [name, over, expected] of cases) {
    it(`K — init ${name} → CliLaunchContextError naming the field`, () => {
      const events = synth(PAYLOAD);
      Object.assign(events[0]!, over);
      expect(() => project(events)).toThrow(CliLaunchContextError);
      expect(() => project(events)).toThrow(expected);
      expect(() => project(events)).toThrow(/init at line 1/);
    });
  }
});

describe('result refusals — each conjunct alone', () => {
  it('S1 — is_error true with everything else in order → names is_error', () => {
    const events = synth(PAYLOAD);
    events[at(events, isType('result'))]!['is_error'] = true;
    expect(() => project(events)).toThrow(CliResultError);
    expect(() => project(events)).toThrow(/is_error true \(subtype "success" alone is not success\)/);
  });

  it('S2 — subtype not success with is_error false → names subtype', () => {
    const events = synth(PAYLOAD);
    events[at(events, isType('result'))]!['subtype'] = 'error_during_execution';
    expect(() => project(events)).toThrow(CliResultError);
    expect(() => project(events)).toThrow(/subtype "error_during_execution"/);
  });

  it('S3 — structured_output absent with is_error false → names structured_output', () => {
    const events = synth(PAYLOAD, { structuredOutput: undefined });
    expect(events[at(events, isType('result'))]).not.toHaveProperty('structured_output');
    expect(() => project(events)).toThrow(CliResultError);
    expect(() => project(events)).toThrow(/structured_output is absent/);
  });

  it('S4 — no result, two results, or a result that is not the last event', () => {
    const none = synth(PAYLOAD);
    none.splice(at(none, isType('result')), 1);
    expect(() => project(none)).toThrow(/no result event arrived/);
    const two = synth(PAYLOAD);
    two.push({ ...two[at(two, isType('result'))]! });
    expect(() => project(two)).toThrow(new RegExp(`2 result events \\(lines ${two.length - 1}, ${two.length}\\)`));
    const notLast = synth(PAYLOAD);
    notLast.push({ type: 'user', message: { role: 'user', content: [] }, ...META });
    expect(() => project(notLast)).toThrow(new RegExp(`the result at line ${notLast.length - 1} is not the last event \\(line ${notLast.length}\\)`));
    for (const events of [none, two, notLast]) expect(() => project(events)).toThrow(CliResultError);
  });
});

describe('overage refusals', () => {
  it('O1 — isUsingOverage true → CliOverageError', () => {
    const events = synth(PAYLOAD, { rateLimit: { isUsingOverage: true, status: 'allowed' } });
    expect(() => project(events)).toThrow(CliOverageError);
    expect(() => project(events)).toThrow(new RegExp(`isUsingOverage true at line ${line(at(events, isType('rate_limit_event')))}`));
  });

  it('O2 — status rejected → CliOverageError', () => {
    const events = synth(PAYLOAD, { rateLimit: { isUsingOverage: false, status: 'rejected' } });
    expect(() => project(events)).toThrow(CliOverageError);
    expect(() => project(events)).toThrow(/status "rejected"/);
  });
});

describe('model refusals', () => {
  it('M1 — message_start names another model', () => {
    const events = synth(PAYLOAD);
    ((inner(events, at(events, isStream('message_start')))['message']) as Ev)['model'] = 'claude-sonnet-5';
    expect(() => project(events)).toThrow(CliModelMismatchError);
    expect(() => project(events)).toThrow(new RegExp(`message_start at line ${line(at(events, isStream('message_start')))} names "claude-sonnet-5"`));
  });

  it('M2 — an assistant message names another model', () => {
    const events = synth(PAYLOAD);
    (events[at(events, isType('assistant'))]!['message'] as Ev)['model'] = '<synthetic>';
    expect(() => project(events)).toThrow(CliModelMismatchError);
    expect(() => project(events)).toThrow(/assistant message at line \d+ names "<synthetic>"/);
  });

  it('M3 — result.modelUsage keys are not exactly the requested model', () => {
    const extra = synth(PAYLOAD);
    (extra[at(extra, isType('result'))]!['modelUsage'] as Ev)['claude-haiku-5'] = { inputTokens: 1 };
    expect(() => project(extra)).toThrow(CliModelMismatchError);
    expect(() => project(extra)).toThrow(/result\.modelUsage keys \["claude-opus-5","claude-haiku-5"\] \(must be exactly \["claude-opus-5"\]\)/);
    const empty = synth(PAYLOAD);
    empty[at(empty, isType('result'))]!['modelUsage'] = {};
    expect(() => project(empty)).toThrow(/modelUsage keys \[\]/);
    const missing = synth(PAYLOAD);
    delete missing[at(missing, isType('result'))]!['modelUsage'];
    expect(() => project(missing)).toThrow(/modelUsage keys null/);
  });
});

// ---------------------------------------------------------------------------
// Refusals: the structured output itself
// ---------------------------------------------------------------------------

/** The message portion of a synthetic stream: message_start through message_stop inclusive. */
function messageSlice(events: Ev[]): Ev[] {
  return events.slice(at(events, isStream('message_start')), at(events, isStream('message_stop')) + 1);
}

describe('structured-output count', () => {
  it('N1 — no tool call at all (a text-only message) → CliNoStructuredOutputError', () => {
    // A tool of another name is not "no call": T3 shows it refused by CliUnexpectedToolCallError instead.
    const events = synth(PAYLOAD, { before: ['text'] });
    const start = at(events, isStream('content_block_start'), 1);
    const stop = at(events, isStream('content_block_stop'), 1);
    events.splice(start, stop - start + 1);
    expect(() => project(events)).toThrow(CliNoStructuredOutputError);
  });

  it('N2 — two StructuredOutput calls in one message at distinct indices → CliMultipleStructuredOutputError', () => {
    const events = synth(PAYLOAD);
    const first = at(events, isStream('content_block_start'));
    const stop = at(events, isStream('content_block_stop'));
    const second = events.slice(first, stop + 1).filter((e) => e['type'] === 'stream_event').map((e) => JSON.parse(JSON.stringify(e)) as Ev);
    for (const e of second) (e['event'] as Ev)['index'] = 1;
    events.splice(stop + 1, 0, ...second);
    expect(() => project(events)).toThrow(CliMultipleStructuredOutputError);
    expect(() => project(events)).toThrow(new RegExp(`2 StructuredOutput tool calls \\(started at lines ${line(first)}, ${line(stop + 1)}\\)`));
  });

  it('N3 — a second message reusing index 0 for a second StructuredOutput call is a second call, not a replacement', () => {
    const events = synth(PAYLOAD);
    const again = messageSlice(synth(PAYLOAD));
    events.splice(at(events, isType('rate_limit_event')), 0, ...again);
    // Both blocks are at index 0, in different messages; each message is complete.
    expect(events.filter(isStream('content_block_start')).map((e) => (e['event'] as Ev)['index'])).toEqual([0, 0]);
    let caught: unknown;
    try {
      project(events);
    } catch (error) {
      caught = error;
    }
    expect(caught, 'index reuse across messages was not refused').toBeInstanceOf(CliMultipleStructuredOutputError);
    expect((caught as Error).message).toMatch(/2 StructuredOutput tool calls/);
  });
});

describe('stop reason', () => {
  it('P1 — max_tokens → ProviderOutputTruncatedError, the HTTP adapter\'s class', () => {
    expect(() => project(synth(PAYLOAD, { stopReason: 'max_tokens' }))).toThrow(ProviderOutputTruncatedError);
    expect(() => project(synth(PAYLOAD, { stopReason: 'max_tokens' }))).toThrow(/stopped at max_tokens \(16000\)/);
  });

  it('P2 — refusal → ProviderRefusalError carrying stop_details', () => {
    const events = synth(PAYLOAD, { stopReason: 'refusal', stopDetails: { category: 'safety', explanation: 'declined' } });
    let caught: unknown;
    try {
      project(events);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ProviderRefusalError);
    expect((caught as ProviderRefusalError).category).toBe('safety');
    expect((caught as ProviderRefusalError).explanation).toBe('declined');
    expect(() => project(synth(PAYLOAD, { stopReason: 'refusal' }))).toThrow(/category unstated/);
  });

  it('P3 — any other stop reason → CliStopReasonError naming it', () => {
    expect(() => project(synth(PAYLOAD, { stopReason: 'end_turn' }))).toThrow(CliStopReasonError);
    expect(() => project(synth(PAYLOAD, { stopReason: 'end_turn' }))).toThrow(/stop_reason "end_turn" rather than "tool_use"/);
    expect(() => project(synth(PAYLOAD, { stopReason: null }))).toThrow(/stop_reason null/);
  });
});

describe('output conflicts', () => {
  it('Q1 — the assistant restates a different input → CliOutputConflictError naming the assistant line', () => {
    const events = synth(PAYLOAD, { statedInput: { token: 'DS-SYNTH-001', sum: 6 } });
    expect(() => project(events)).toThrow(CliOutputConflictError);
    expect(() => project(events)).toThrow(new RegExp(`the assistant message at line ${line(at(events, isType('assistant')))} states a tool_use.input that differs`));
  });

  it('Q2 — result.structured_output differs → CliOutputConflictError', () => {
    const events = synth(PAYLOAD, { structuredOutput: { token: 'DS-SYNTH-002', sum: 5 } });
    expect(() => project(events)).toThrow(CliOutputConflictError);
    expect(() => project(events)).toThrow(/result\.structured_output differs from the concatenated deltas/);
  });

  it('Q3 — the deltas do not form one JSON object', () => {
    const truncated = synth(PAYLOAD, { deltas: ['{"token": "DS-'] });
    expect(() => project(truncated)).toThrow(CliOutputConflictError);
    expect(() => project(truncated)).toThrow(/does not parse as JSON/);
    const array = synth('[1, 2]', { statedInput: [1, 2], structuredOutput: [1, 2] });
    expect(() => project(array)).toThrow(/is not a JSON object/);
  });

  it('Q4 — no assistant message restates the call → CliOutputConflictError', () => {
    const events = synth(PAYLOAD);
    events.splice(at(events, isType('assistant')), 1);
    expect(() => project(events)).toThrow(CliOutputConflictError);
    expect(() => project(events)).toThrow(/no assistant message restates the StructuredOutput call/);
    // A restatement under another id is a different refusal, T6: the call was restated, under an id the stream never started.
  });
});

// ---------------------------------------------------------------------------
// Refusals: tool-call discipline — one call, of the one tool, answered once
// ---------------------------------------------------------------------------

/** The three events of one complete tool_use block. */
function toolBlock(index: number, name: string, id: string, json = '{}'): Ev[] {
  return [
    se('content_block_start', { index, content_block: { type: 'tool_use', id, name, input: {} } }),
    se('content_block_delta', { index, delta: { type: 'input_json_delta', partial_json: json } }),
    se('content_block_stop', { index }),
  ];
}

/** A complete second message carrying the given blocks, with no assistant or user event of its own. */
function bareMessage(blocks: Ev[], stopReason = 'tool_use'): Ev[] {
  return [
    se('message_start', { message: { id: 'msg_2', type: 'message', role: 'assistant', model: MODEL, content: [], stop_reason: null, usage: { input_tokens: 2, output_tokens: 25 } } }),
    ...blocks,
    se('message_delta', { delta: { stop_reason: stopReason, stop_sequence: null, stop_details: null }, usage: usage() }),
    se('message_stop'),
  ];
}

function assistantContent(events: Ev[]): Ev[] {
  return (events[at(events, isType('assistant'))]!['message'] as Ev)['content'] as Ev[];
}

function userContent(events: Ev[]): Ev[] {
  return (events[at(events, isType('user'))]!['message'] as Ev)['content'] as Ev[];
}

function caught(events: Ev[]): unknown {
  try {
    project(events);
  } catch (error) {
    return error;
  }
  return undefined;
}

describe('tool-call discipline', () => {
  it('T0 — positive controls: the probe fixture, thinking+text+one call, one call at a non-zero index, and a second text-only message', () => {
    const out = CLAUDE_CODE_CLI_ADAPTER.projectResponse(wrap(fixture('probe-accepted.stream.jsonl')), request());
    expect(out).toBe('{"token": "DS-SYNTH-001", "sum": 5}');
    expect(Buffer.from(out, 'utf8').length).toBe(35);
    expect(project(synth(PAYLOAD, { before: ['thinking', 'text'] }))).toBe(PAYLOAD);
    expect(project(synth(PAYLOAD, { index: 3 }))).toBe(PAYLOAD);
    // T2's sibling: a second message is not itself refused; its tool call is.
    const events = synth(PAYLOAD);
    const text = [
      se('content_block_start', { index: 0, content_block: { type: 'text', text: '' } }),
      se('content_block_delta', { index: 0, delta: { type: 'text_delta', text: 'Done.' } }),
      se('content_block_stop', { index: 0 }),
    ];
    events.splice(at(events, isType('rate_limit_event')), 0, ...bareMessage(text, 'end_turn'));
    expect(project(events)).toBe(PAYLOAD);
  });

  it('T1 — an extra Bash tool_use block in the same message → CliUnexpectedToolCallError listing both calls with their lines', () => {
    const events = synth(PAYLOAD);
    events.splice(at(events, isStream('content_block_stop')) + 1, 0, ...toolBlock(1, 'Bash', 'toolu_2', '{"command": "ls"}'));
    const error = caught(events);
    expect(error, 'the Bash block was not refused').toBeInstanceOf(CliUnexpectedToolCallError);
    expect((error as CliUnexpectedToolCallError).calls.map((c) => c.name)).toEqual(['StructuredOutput', 'Bash']);
    const first = line(at(events, isStream('content_block_start')));
    const second = line(at(events, isStream('content_block_start'), 1));
    expect((error as Error).message).toMatch(new RegExp(`the stream carries a tool call other than StructuredOutput — "StructuredOutput" at line ${first}, "Bash" at line ${second}`));
  });

  it('T2 — a Bash tool_use block in a second message → CliUnexpectedToolCallError naming its line', () => {
    const events = synth(PAYLOAD);
    events.splice(at(events, isType('rate_limit_event')), 0, ...bareMessage(toolBlock(0, 'Bash', 'toolu_2')));
    const error = caught(events);
    expect(error, 'the Bash block in the second message was not refused').toBeInstanceOf(CliUnexpectedToolCallError);
    expect((error as Error).message).toMatch(new RegExp(`"Bash" at line ${line(at(events, isStream('content_block_start'), 1))}`));
  });

  it('T3 — a lone Bash call and no StructuredOutput → CliUnexpectedToolCallError, not CliNoStructuredOutputError', () => {
    const events = synth(PAYLOAD, { toolName: 'Bash' });
    const error = caught(events);
    expect(error, 'the lone Bash call was not refused by name').toBeInstanceOf(CliUnexpectedToolCallError);
    expect((error as Error).message).toMatch(new RegExp(`— "Bash" at line ${line(at(events, isStream('content_block_start')))};`));
    expect((error as Error).message).not.toMatch(/"StructuredOutput" at line/);
  });

  it('T4 — two StructuredOutput calls stay CliMultipleStructuredOutputError; with a Bash call beside them the refusal lists all three', () => {
    const two = synth(PAYLOAD);
    two.splice(at(two, isStream('content_block_stop')) + 1, 0, ...toolBlock(1, 'StructuredOutput', 'toolu_3', PAYLOAD));
    expect(caught(two)).toBeInstanceOf(CliMultipleStructuredOutputError);
    const three = two.slice();
    three.splice(at(three, isStream('content_block_stop'), 1) + 1, 0, ...toolBlock(2, 'Bash', 'toolu_2'));
    const error = caught(three);
    expect(error).toBeInstanceOf(CliUnexpectedToolCallError);
    expect((error as CliUnexpectedToolCallError).calls.map((c) => c.name)).toEqual(['StructuredOutput', 'StructuredOutput', 'Bash']);
    const lines = [0, 1, 2].map((n) => line(at(three, isStream('content_block_start'), n)));
    expect((error as Error).message).toMatch(new RegExp(`"StructuredOutput" at line ${lines[0]}, "StructuredOutput" at line ${lines[1]}, "Bash" at line ${lines[2]}`));
  });

  it('T5 — the assistant restates an extra tool_use of another name while the stream started one block → CliUnexpectedToolCallError naming the assistant line', () => {
    const events = synth(PAYLOAD);
    assistantContent(events).push({ type: 'tool_use', id: 'toolu_2', name: 'Bash', input: { command: 'ls' } });
    expect(events.filter(isStream('content_block_start'))).toHaveLength(1);
    const error = caught(events);
    expect(error, 'the assistant\'s extra Bash item was not refused').toBeInstanceOf(CliUnexpectedToolCallError);
    const assistant = line(at(events, isType('assistant')));
    expect((error as Error).message).toMatch(new RegExp(`an assistant message carries a tool call other than StructuredOutput — "StructuredOutput" at line ${assistant}, "Bash" at line ${assistant}`));
  });

  it('T6 — the assistant restates the StructuredOutput call under a different id → CliOutputConflictError naming both ids', () => {
    const events = synth(PAYLOAD);
    assistantContent(events)[0]!['id'] = 'toolu_9';
    const error = caught(events);
    expect(error, 'the foreign id was not refused').toBeInstanceOf(CliOutputConflictError);
    expect((error as Error).message).toMatch(new RegExp(`the assistant message at line ${line(at(events, isType('assistant')))} restates a StructuredOutput call with id "toolu_9"; the stream started "toolu_1"`));
  });

  it('T7 — an assistant message carrying two tool_use items, both StructuredOutput under the block id → CliOutputConflictError', () => {
    const events = synth(PAYLOAD);
    const content = assistantContent(events);
    content.push({ ...content[0]! });
    const error = caught(events);
    expect(error, 'the second tool_use item was not refused').toBeInstanceOf(CliOutputConflictError);
    expect((error as Error).message).toMatch(new RegExp(`the assistant message at line ${line(at(events, isType('assistant')))} carries 2 tool_use items`));
  });

  it('T8 — a user tool_result whose tool_use_id is not the block id → CliOutputConflictError naming both ids', () => {
    const events = synth(PAYLOAD);
    userContent(events)[0]!['tool_use_id'] = 'toolu_9';
    const error = caught(events);
    expect(error, 'the wrong tool_use_id was not refused').toBeInstanceOf(CliOutputConflictError);
    expect((error as Error).message).toMatch(new RegExp(`the tool_result at line ${line(at(events, isType('user')))} answers "toolu_9"; the StructuredOutput call started at line ${line(at(events, isStream('content_block_start')))} is "toolu_1"`));
  });

  it('T9 — two tool_result items (in one user event or in two), or none → CliOutputConflictError', () => {
    const one = synth(PAYLOAD);
    userContent(one).push({ ...userContent(one)[0]! });
    const inOne = caught(one);
    expect(inOne, 'two tool_results in one user event were not refused').toBeInstanceOf(CliOutputConflictError);
    const u = line(at(one, isType('user')));
    expect((inOne as Error).message).toMatch(new RegExp(`2 tool_result items \\(lines ${u}, ${u}\\)`));
    const two = synth(PAYLOAD);
    two.splice(at(two, isType('user')) + 1, 0, JSON.parse(JSON.stringify(two[at(two, isType('user'))])) as Ev);
    const inTwo = caught(two);
    expect(inTwo, 'two user events were not refused').toBeInstanceOf(CliOutputConflictError);
    expect((inTwo as Error).message).toMatch(new RegExp(`2 tool_result items \\(lines ${u}, ${u + 1}\\)`));
    const none = synth(PAYLOAD);
    none.splice(at(none, isType('user')), 1);
    const inNone = caught(none);
    expect(inNone, 'a missing tool_result was not refused').toBeInstanceOf(CliOutputConflictError);
    expect((inNone as Error).message).toMatch(/no user event carries a tool_result for the StructuredOutput call/);
  });
});

// ---------------------------------------------------------------------------
// Refusals: tool-call id discipline — the one call is matched by id, never by name
// ---------------------------------------------------------------------------

/** The `content_block` the one tool_use block started with; its `id` is set, replaced or removed here. */
function toolBlockStart(events: Ev[]): Ev {
  return inner(events, at(events, isStream('content_block_start')))['content_block'] as Ev;
}

describe('tool-call id discipline', () => {
  // T6 (restatement under another id) and T8 (tool_result for another id) are
  // the mismatch cases with a valid block id; they stay in the block above.

  it('I0 — positive control: the probe fixture starts its call under a string id and projects to the 35 bytes; the generator default is accepted', () => {
    const stdout = fixture('probe-accepted.stream.jsonl');
    expect(stdout).toMatch(/"id":"toolu_[A-Za-z0-9]+","input":\{\},"name":"StructuredOutput","type":"tool_use"\},"index":0,"type":"content_block_start"/);
    const out = CLAUDE_CODE_CLI_ADAPTER.projectResponse(wrap(stdout), request());
    expect(Buffer.from(out, 'utf8').length).toBe(35);
    expect(out).toBe('{"token": "DS-SYNTH-001", "sum": 5}');
    const events = synth(PAYLOAD);
    expect(toolBlockStart(events)['id']).toBe('toolu_1');
    expect(project(events)).toBe(PAYLOAD);
  });

  it('I1 — the block starts with no id while the assistant and the tool_result name different calls → CliToolCallIdError naming the line, not acceptance', () => {
    const events = synth(PAYLOAD);
    delete toolBlockStart(events)['id'];
    assistantContent(events)[0]!['id'] = 'toolu_A';
    userContent(events)[0]!['tool_use_id'] = 'toolu_B';
    const error = caught(events);
    expect((error as Error | undefined)?.name, 'conflicting ids under an absent block id were accepted').toBe('CliToolCallIdError');
    expect(error).toBeInstanceOf(CliToolCallIdError);
    expect((error as CliToolCallIdError).line).toBe(line(at(events, isStream('content_block_start'))));
    expect((error as Error).message).toMatch(new RegExp(`the StructuredOutput call started at line ${line(at(events, isStream('content_block_start')))} carries no usable id — the content_block has no id;`));
  });

  it.each([
    ['null', null, 'id is null'],
    ['the empty string', '', 'id is the empty string'],
    ['a number', 42, 'id is a number (42)'],
    ['an object', {}, 'id is an object ({})'],
  ])('I2 — the block starts with an id that is %s → CliToolCallIdError naming what was found', (_, id, detail) => {
    const events = synth(PAYLOAD);
    toolBlockStart(events)['id'] = id;
    const error = caught(events);
    expect((error as Error | undefined)?.name, `an id of ${JSON.stringify(id)} was not refused as an id`).toBe('CliToolCallIdError');
    expect(error).toBeInstanceOf(CliToolCallIdError);
    expect((error as Error).message).toContain(`carries no usable id — ${detail};`);
  });

  it('I3 — the assistant restates the call with no id → CliOutputConflictError; the name alone does not match it', () => {
    const events = synth(PAYLOAD);
    delete assistantContent(events)[0]!['id'];
    expect(assistantContent(events)[0]!['name']).toBe('StructuredOutput');
    const error = caught(events);
    expect((error as Error | undefined)?.name, 'a restatement without an id was matched by name').toBe('CliOutputConflictError');
    expect((error as Error).message).toMatch(new RegExp(`the assistant message at line ${line(at(events, isType('assistant')))} restates a StructuredOutput call with id undefined; the stream started "toolu_1"`));
  });

  it('I4 — the tool_result carries no tool_use_id → CliOutputConflictError naming undefined and the block id', () => {
    const events = synth(PAYLOAD);
    delete userContent(events)[0]!['tool_use_id'];
    const error = caught(events);
    expect((error as Error | undefined)?.name, 'a tool_result without a tool_use_id was accepted').toBe('CliOutputConflictError');
    expect((error as Error).message).toMatch(new RegExp(`the tool_result at line ${line(at(events, isType('user')))} answers undefined; the StructuredOutput call started at line ${line(at(events, isStream('content_block_start')))} is "toolu_1"`));
  });
});

// ---------------------------------------------------------------------------
// readUsage
// ---------------------------------------------------------------------------

describe('readUsage', () => {
  it('U1 — reads the result usage on a clean success, integer fields only', () => {
    expect(readUsage(synth(PAYLOAD))).toEqual({ inputTokens: 2, outputTokens: 82, cacheCreationInputTokens: 626, cacheReadInputTokens: 0 });
    const partial = synth(PAYLOAD);
    partial[at(partial, isType('result'))]!['usage'] = { input_tokens: 2, output_tokens: 82, cache_creation_input_tokens: 'many' };
    expect(readUsage(partial)).toEqual({ inputTokens: 2, outputTokens: 82, cacheCreationInputTokens: null, cacheReadInputTokens: null });
    const noOutput = synth(PAYLOAD);
    noOutput[at(noOutput, isType('result'))]!['usage'] = { input_tokens: 2, output_tokens: 8.5 };
    expect(readUsage(noOutput)).toBeNull();
  });

  it('U2 — null unless the result is success with is_error false, and null when the stream cannot be read', () => {
    const errored = synth(PAYLOAD);
    errored[at(errored, isType('result'))]!['is_error'] = true;
    expect(readUsage(errored)).toBeNull();
    const subtype = synth(PAYLOAD);
    subtype[at(subtype, isType('result'))]!['subtype'] = 'error_max_turns';
    expect(readUsage(subtype)).toBeNull();
    const none = synth(PAYLOAD);
    none.splice(at(none, isType('result')), 1);
    expect(readUsage(none)).toBeNull();
    const two = synth(PAYLOAD);
    two.push({ ...two[at(two, isType('result'))]! });
    expect(readUsage(two)).toBeNull();
    expect(CLAUDE_CODE_CLI_ADAPTER.readUsage!('not an envelope')).toBeNull();
    expect(CLAUDE_CODE_CLI_ADAPTER.readUsage!(wrap('{broken\n'))).toBeNull();
    // Usage reads regardless of the exit code: it reports what the CLI said, and the runner decides what that is worth.
    expect(readUsage(synth(PAYLOAD), { exitCode: 1 })).toEqual({ inputTokens: 2, outputTokens: 82, cacheCreationInputTokens: 626, cacheReadInputTokens: 0 });
  });
});
