/**
 * `claude-code-cli@2`'s projection, offline — Opus 5.5 migration, Task 2.
 *
 * Why a file of its own: `@2` reads a different executable's stream by
 * different rules, and every expectation about it has to be a literal written
 * here. `@1`'s file builds its streams from `@1`'s generator, whose version,
 * model and fields are `@1`'s, so a `@2` expectation built on it would agree
 * with whatever that generator happens to emit; and a stream built from the
 * `@2` profile would agree with any change made to the profile. The builder
 * below therefore writes 2.1.280, `claude-opus-5-5`, one compliant rate-limit
 * event and `fast_mode_state` "off" by hand, and imports the adapter only as
 * the subject under test.
 *
 * What carries the weight:
 * - Classification runs before the exit check and the malformed line, by rule
 *   priority and not by line order. Every rule is shown at exit 0 and at
 *   exit 1, and every adjacent pair of rules is shown with the
 *   higher-priority fact on the later line.
 * - Classification is the only authority for the facts it names, so each
 *   rule's case names that rule's class, not a later check's.
 * - The committed 2.1.226 probes, transformed in memory to 2.1.280 and
 *   `claude-opus-5-5`, answer as real shapes must: the accepted probe
 *   projects to its 35 bytes, and the auth-failed probe's `<synthetic>`
 *   API-error item is an error, never a substitution.
 * - Every accepted control has a refused sibling from the same builder, and
 *   every "is not X" sits beside a case where X is thrown.
 *
 * The fixtures are read, never written; the transform is made in memory.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ProviderOutputTruncatedError, ProviderRefusalError } from '../src/pipeline/anthropic-messages';
import {
  CLAUDE_CODE_CLI_V2_ADAPTER,
  CliCreditsRequiredError,
  CliEffortRefusedError,
  CliExitError,
  CliFastModeError,
  CliIncludedUsageExhaustedError,
  CliLaunchContextError,
  CliLongContextRouteError,
  CliModelSubstitutionError,
  CliNoStructuredOutputError,
  CliOutputConflictError,
  CliOutputTruncatedError,
  CliOverageError,
  CliPinObsoleteError,
  CliResultError,
  CliStopReasonError,
  CliStreamLifecycleError,
  CliStreamMalformedError,
  CliUnexpectedToolCallError,
  CliUsageUnobservedError,
  type CliEnvelope,
} from '../src/pipeline/claude-code-cli';
import type { RoleRequest } from '../src/pipeline/roles';

const here = dirname(fileURLToPath(import.meta.url));
const PAYLOAD = '{"token": "DS-SYNTH-001", "sum": 5}';

function request(model = 'claude-opus-5-5'): RoleRequest {
  return {
    role: 'reader',
    index: 0,
    model,
    promptSha256: 'a'.repeat(64),
    messages: [
      { from: 'prompt', content: '# Role: blind reader' },
      { from: 'input', content: '# Requirement' },
    ],
  };
}

// ---------------------------------------------------------------------------
// The builder: literals only
// ---------------------------------------------------------------------------

type Ev = Record<string, unknown>;

const META = { session_id: 'sess', uuid: 'uuid' } as const;

function se(kind: string, extra: Ev = {}): Ev {
  return { type: 'stream_event', event: { type: kind, ...extra }, parent_tool_use_id: null, ...META };
}

function usage(extra: Ev = {}): Ev {
  return { input_tokens: 2, output_tokens: 82, cache_creation_input_tokens: 626, cache_read_input_tokens: 0, ...extra };
}

type BlockKind = 'thinking' | 'empty_thinking' | 'redacted_thinking' | 'text';

function blockEvents(kind: BlockKind, index: number): Ev[] {
  switch (kind) {
    case 'thinking':
      return [
        se('content_block_start', { index, content_block: { type: 'thinking', thinking: '', signature: '' } }),
        se('content_block_delta', { index, delta: { type: 'thinking_delta', thinking: 'considering' } }),
        se('content_block_delta', { index, delta: { type: 'signature_delta', signature: 'sig' } }),
        se('content_block_stop', { index }),
      ];
    case 'empty_thinking':
      // A progress update: the block opens and closes with no delta at all.
      return [se('content_block_start', { index, content_block: { type: 'thinking', thinking: '', signature: '' } }), se('content_block_stop', { index })];
    case 'redacted_thinking':
      return [se('content_block_start', { index, content_block: { type: 'redacted_thinking', data: 'opaque' } }), se('content_block_stop', { index })];
    case 'text':
      return [
        se('content_block_start', { index, content_block: { type: 'text', text: '' } }),
        se('content_block_delta', { index, delta: { type: 'text_delta', text: 'Here is the answer.' } }),
        se('content_block_stop', { index }),
      ];
  }
}

/**
 * A good 2.1.280 stream, one mutation away from every case: init (with the
 * version, model, permission mode and fast-mode state), a status note, one
 * message whose one tool block carries the payload in three-character
 * deltas, the CLI's restatement and tool_result, a thinking_tokens note, one
 * compliant rate-limit event, and a result that completed with one
 * modelUsage entry.
 */
function build(before: BlockKind[] = []): Ev[] {
  const parsed = JSON.parse(PAYLOAD) as unknown;
  const index = before.length;
  const events: Ev[] = [];
  events.push({ type: 'system', subtype: 'init', apiKeySource: 'none', claude_code_version: '2.1.280', model: 'claude-opus-5-5', permissionMode: 'default', fast_mode_state: 'off', tools: ['StructuredOutput'], mcp_servers: [], ...META });
  events.push({ type: 'system', subtype: 'status', status: 'requesting', ...META });
  events.push(se('message_start', { message: { id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null, usage: { input_tokens: 2, output_tokens: 25 } } }));
  before.forEach((kind, i) => events.push(...blockEvents(kind, i)));
  events.push(se('content_block_start', { index, content_block: { type: 'tool_use', id: 'toolu_1', name: 'StructuredOutput', input: {} } }));
  for (let i = 0; i < PAYLOAD.length; i += 3) events.push(se('content_block_delta', { index, delta: { type: 'input_json_delta', partial_json: PAYLOAD.slice(i, i + 3) } }));
  events.push({
    type: 'assistant',
    message: { id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [{ type: 'tool_use', id: 'toolu_1', name: 'StructuredOutput', input: parsed }], stop_reason: null, usage: usage() },
    request_id: 'req_1',
    parent_tool_use_id: null,
    ...META,
  });
  events.push(se('content_block_stop', { index }));
  events.push({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'Structured output provided successfully' }] }, parent_tool_use_id: null, ...META });
  events.push(se('message_delta', { delta: { stop_reason: 'tool_use', stop_sequence: null, stop_details: null }, usage: usage() }));
  events.push(se('message_stop'));
  events.push({ type: 'system', subtype: 'thinking_tokens', tokens: 0, ...META });
  events.push({ type: 'rate_limit_event', rate_limit_info: { status: 'allowed', rateLimitType: 'five_hour', isUsingOverage: false, overageStatus: 'rejected', overageDisabledReason: 'org_level_disabled', resetsAt: 1790075400 }, ...META });
  events.push({
    type: 'result',
    subtype: 'success',
    is_error: false,
    num_turns: 2,
    result: JSON.stringify(parsed),
    stop_reason: 'tool_use',
    terminal_reason: 'completed',
    fast_mode_state: 'off',
    structured_output: parsed,
    modelUsage: { 'claude-opus-5-5': { inputTokens: 2, outputTokens: 82, canonicalModel: 'claude-opus-5-5' } },
    usage: usage({ speed: 'standard' }),
    total_cost_usd: 0.00832,
    ...META,
  });
  return events;
}

// ---------------------------------------------------------------------------
// Finding, mutating and projecting
// ---------------------------------------------------------------------------

const isStream = (kind: string) => (e: Ev): boolean => e['type'] === 'stream_event' && (e['event'] as Ev)['type'] === kind;
const isType = (type: string) => (e: Ev): boolean => e['type'] === type;
const isSystem = (subtype: string) => (e: Ev): boolean => e['type'] === 'system' && e['subtype'] === subtype;
const isBlockStart = (type: string) => (e: Ev): boolean => isStream('content_block_start')(e) && ((e['event'] as Ev)['content_block'] as Ev)['type'] === type;

/** Position of the n-th event matching, 0-based; throws rather than returning -1, so a mutation cannot miss its target silently. */
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

/** The 1-based stdout line of the n-th event matching: the builder writes one event per line and no blank line. */
const lineOf = (events: Ev[], pred: (e: Ev) => boolean, nth = 0): number => at(events, pred, nth) + 1;

const inner = (events: Ev[], i: number): Ev => events[i]!['event'] as Ev;
const initOf = (events: Ev[]): Ev => events[at(events, isSystem('init'))]!;
const resultOf = (events: Ev[]): Ev => events[at(events, isType('result'))]!;
const rateInfo = (events: Ev[], nth = 0): Ev => events[at(events, isType('rate_limit_event'), nth)]!['rate_limit_info'] as Ev;
const messageDelta = (events: Ev[]): Ev => inner(events, at(events, isStream('message_delta')))['delta'] as Ev;
const assistantMessage = (events: Ev[]): Ev => events[at(events, isType('assistant'))]!['message'] as Ev;
const modelUsageOf = (events: Ev[]): Ev => resultOf(events)['modelUsage'] as Ev;

/** Inserts events as new lines after init and the status note (from line 3). */
function afterStatus(events: Ev[], ...inserted: Ev[]): void {
  events.splice(2, 0, ...inserted);
}

/** Inserts events as new lines just before the first rate_limit_event, after the message has closed. */
function beforeRateLimit(events: Ev[], ...inserted: Ev[]): void {
  events.splice(at(events, isType('rate_limit_event')), 0, ...inserted);
}

/** An assistant API-error item shaped like the auth-failed probe's line 3; the kind's fields are the caller's. */
function apiErrorItem(fields: Ev, flagged = true): Ev {
  return {
    type: 'assistant',
    ...fields,
    ...(flagged ? { is_api_error_message: true } : {}),
    message: { id: 'err_1', type: 'message', role: 'assistant', model: '<synthetic>', content: [{ type: 'text', text: 'API Error' }], stop_reason: 'stop_sequence', stop_sequence: '', usage: { input_tokens: 0, output_tokens: 0, speed: null } },
    parent_tool_use_id: null,
    ...META,
  };
}

const systemEvent = (subtype: string, fields: Ev = {}): Ev => ({ type: 'system', subtype, ...fields, ...META });

function rateLimitEvent(info: Ev): Ev {
  return { type: 'rate_limit_event', rate_limit_info: info, ...META };
}

/** The builder's compliant rate_limit_info, as a fresh literal. */
function compliantInfo(over: Ev = {}): Ev {
  return { status: 'allowed', rateLimitType: 'five_hour', isUsingOverage: false, overageStatus: 'rejected', overageDisabledReason: 'org_level_disabled', resetsAt: 1790075400, ...over };
}

/** A complete second message with one text block and the given stop reason. */
function textMessage(stopReason: string): Ev[] {
  return [
    se('message_start', { message: { id: 'msg_2', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null, usage: { input_tokens: 2, output_tokens: 25 } } }),
    se('content_block_start', { index: 0, content_block: { type: 'text', text: '' } }),
    se('content_block_delta', { index: 0, delta: { type: 'text_delta', text: 'Done.' } }),
    se('content_block_stop', { index: 0 }),
    se('message_delta', { delta: { stop_reason: stopReason, stop_sequence: null, stop_details: null }, usage: usage() }),
    se('message_stop'),
  ];
}

function serialise(events: Ev[]): string {
  return `${events.map((e) => JSON.stringify(e)).join('\n')}\n`;
}

function wrap(stdout: string, over: Partial<CliEnvelope> = {}): string {
  return JSON.stringify({ exitCode: 0, signal: null, stdout, stderrBytes: 0, ...over });
}

function projectText(stdout: string, over: Partial<CliEnvelope> = {}, req: RoleRequest = request()): string {
  return CLAUDE_CODE_CLI_V2_ADAPTER.projectResponse(wrap(stdout, over), req);
}

function project(events: Ev[], over: Partial<CliEnvelope> = {}): string {
  return projectText(serialise(events), over);
}

/** What `fn` threw, or `undefined` when it returned: an acceptance where a refusal was expected is a named red, not a crash. */
function thrownBy(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return undefined;
}

const refusalOf = (events: Ev[], over: Partial<CliEnvelope> = {}): unknown => thrownBy(() => project(events, over));

type ErrorClass = new (...args: never[]) => Error;

/** The refusal's name (a literal), its class, and a fragment of its message naming the signal and its line. Name first, so a wrong class reds legibly. */
function expectRefused(error: unknown, cls: ErrorClass, name: string, fragment: string): void {
  expect((error as Error | undefined)?.name, `expected a ${name}`).toBe(name);
  expect(error).toBeInstanceOf(cls);
  expect((error as Error).message).toContain(fragment);
}

function fixture(name: string): string {
  return readFileSync(join(here, 'fixtures', 'claude-code-cli', name), 'utf8');
}

const sha256 = (text: string | Buffer): string => createHash('sha256').update(text).digest('hex');
const occurrences = (text: string, needle: string): number => text.split(needle).length - 1;

/** The literal transform: 2.1.226's model and version become 2.1.280's. Refuses to run where it would double a replacement. */
function toV2(stdout: string): string {
  expect(stdout, 'the fixture already names claude-opus-5-5, so the replacement would double it').not.toContain('claude-opus-5-5');
  return stdout.replaceAll('claude-opus-5', 'claude-opus-5-5').replaceAll('2.1.226', '2.1.280');
}

// ---------------------------------------------------------------------------
// The builder and its accepted controls
// ---------------------------------------------------------------------------

describe('claude-code-cli@2 — the builder and its accepted controls', () => {
  it('V-A0 — the builder carries the 2.1.280 shape as literals and projects to its payload, byte for byte', () => {
    const events = build();
    expect(initOf(events)).toMatchObject({ claude_code_version: '2.1.280', model: 'claude-opus-5-5', permissionMode: 'default', fast_mode_state: 'off' });
    expect(resultOf(events)).toMatchObject({ terminal_reason: 'completed', fast_mode_state: 'off', usage: { speed: 'standard' } });
    expect(events.filter(isType('rate_limit_event'))).toHaveLength(1);
    expect(events.filter(isSystem('status'))).toHaveLength(1);
    expect(events.filter(isSystem('thinking_tokens'))).toHaveLength(1);
    const out = project(events);
    expect(out).toBe(PAYLOAD);
    expect(Buffer.from(out, 'utf8').length).toBe(35);
  });

  it('V-A1 — an empty progress-update thinking block is accepted; the same kind of block with an unknown delta is refused', () => {
    expect(project(build(['empty_thinking']))).toBe(PAYLOAD);
    expect(project(build(['thinking', 'text']))).toBe(PAYLOAD);
    const sibling = build(['thinking']);
    const i = at(sibling, isStream('content_block_delta'));
    (inner(sibling, i)['delta'] as Ev)['type'] = 'thinking_summary_delta';
    expectRefused(refusalOf(sibling), CliStreamLifecycleError, 'CliStreamLifecycleError', `line ${i + 1} — delta type "thinking_summary_delta" does not match block type "thinking" at index 0`);
  });

  it('V-A2 — a redacted_thinking block is accepted; the same block carrying a delta is refused', () => {
    expect(project(build(['redacted_thinking']))).toBe(PAYLOAD);
    const sibling = build(['redacted_thinking']);
    const start = at(sibling, isStream('content_block_start'));
    sibling.splice(start + 1, 0, se('content_block_delta', { index: 0, delta: { type: 'thinking_delta', thinking: 'x' } }));
    expectRefused(refusalOf(sibling), CliStreamLifecycleError, 'CliStreamLifecycleError', `line ${start + 2} — delta type "thinking_delta" does not match block type "redacted_thinking" at index 0`);
  });

  it('V-A3 — rate-limit status "allowed_warning" is accepted; "rejected" is exhaustion and an unknown status is unobserved', () => {
    const warning = build();
    rateInfo(warning)['status'] = 'allowed_warning';
    expect(project(warning)).toBe(PAYLOAD);
    const rejected = build();
    rateInfo(rejected)['status'] = 'rejected';
    expectRefused(refusalOf(rejected), CliIncludedUsageExhaustedError, 'CliIncludedUsageExhaustedError', `the rate_limit_event at line ${lineOf(rejected, isType('rate_limit_event'))} reports status "rejected"`);
    const unknown = build();
    rateInfo(unknown)['status'] = 'allowed_soon';
    expectRefused(refusalOf(unknown), CliUsageUnobservedError, 'CliUsageUnobservedError', `the rate_limit_event at line ${lineOf(unknown, isType('rate_limit_event'))}: status "allowed_soon"`);
  });

  it('V-A4 — usage.speed and canonicalModel absent are accepted; speed "fast" and another canonicalModel are refused', () => {
    const absent = build();
    delete (resultOf(absent)['usage'] as Ev)['speed'];
    delete (modelUsageOf(absent)['claude-opus-5-5'] as Ev)['canonicalModel'];
    expect(project(absent)).toBe(PAYLOAD);
    const fast = build();
    (resultOf(fast)['usage'] as Ev)['speed'] = 'fast';
    expectRefused(refusalOf(fast), CliFastModeError, 'CliFastModeError', `result usage.speed "fast" at line ${lineOf(fast, isType('result'))}`);
    const canonical = build();
    (modelUsageOf(canonical)['claude-opus-5-5'] as Ev)['canonicalModel'] = 'claude-opus-5';
    expectRefused(refusalOf(canonical), CliModelSubstitutionError, 'CliModelSubstitutionError', `result.modelUsage["claude-opus-5-5"].canonicalModel "claude-opus-5" at line ${lineOf(canonical, isType('result'))}`);
  });

  it('V-A5 — usage.speed null on the result is fast mode, like any speed but standard; null is read as unreported only on an API-error item\'s usage, the auth-failed probe\'s placeholder', () => {
    const nullSpeed = build();
    (resultOf(nullSpeed)['usage'] as Ev)['speed'] = null;
    expectRefused(refusalOf(nullSpeed), CliFastModeError, 'CliFastModeError', `result usage.speed null at line ${lineOf(nullSpeed, isType('result'))}`);
    // Sibling: null on a flagged API-error item's usage is not fast mode. No stream carrying an API-error item is
    // accepted, so the observable is the class it falls through to: CliExitError at exit 1, and at exit 0 the result
    // step's refusal of an API-error item beside a success.
    const onApiError = build();
    beforeRateLimit(onApiError, apiErrorItem({ error: 'authentication_failed' }));
    const itemUsage = (): Ev => (onApiError[at(onApiError, isType('assistant'), 1)]!['message'] as Ev)['usage'] as Ev;
    expect(itemUsage()['speed']).toBeNull();
    expectRefused(refusalOf(onApiError, { exitCode: 1 }), CliExitError, 'CliExitError', 'exitCode 1, signal null, 0 stderr bytes');
    expectRefused(refusalOf(onApiError), CliResultError, 'CliResultError', `the assistant item at line ${lineOf(onApiError, isType('assistant'), 1)} is an API error`);
    // Positive control: fast mode does read that item's usage — "fast" on the same item is refused as fast mode.
    itemUsage()['speed'] = 'fast';
    expectRefused(refusalOf(onApiError, { exitCode: 1 }), CliFastModeError, 'CliFastModeError', `assistant message.usage.speed "fast" at line ${lineOf(onApiError, isType('assistant'), 1)}`);
    const other = build();
    (resultOf(other)['usage'] as Ev)['speed'] = 'priority';
    expectRefused(refusalOf(other), CliFastModeError, 'CliFastModeError', `result usage.speed "priority" at line ${lineOf(other, isType('result'))}`);
  });

  it('V-A6 — several compliant rate-limit events, and the fields the allowlist does not name, are accepted', () => {
    const events = build();
    beforeRateLimit(events, rateLimitEvent(compliantInfo({ rateLimitType: 'seven_day', surpassedThreshold: 0.5 })));
    expect(project(events)).toBe(PAYLOAD);
    // Sibling: the same second event with one field outside the allowlist is named by its own line.
    const sibling = build();
    beforeRateLimit(sibling, rateLimitEvent(compliantInfo({ rateLimitType: 'seven_day', errorCode: 'x' })));
    expectRefused(refusalOf(sibling), CliUsageUnobservedError, 'CliUsageUnobservedError', `the rate_limit_event at line ${lineOf(sibling, isType('rate_limit_event'))}: errorCode "x" (must be absent)`);
  });
});

// ---------------------------------------------------------------------------
// Real shapes: the committed probes, transformed in memory
// ---------------------------------------------------------------------------

describe('claude-code-cli@2 — the committed probes, transformed to 2.1.280 in memory', () => {
  const accepted = (): string => fixture('probe-accepted.stream.jsonl');
  const authFailed = (): string => fixture('probe-auth-failed.stream.jsonl');

  it('V-F0 — the fixtures are the committed bytes, and the transform replaces exactly the model and version they carry', () => {
    expect(sha256(accepted())).toBe('ce7a3dbae663e63b1468ef73ed4b7d3b5eb08d850a9610c3226e29e0e3f4f0e2');
    expect(sha256(authFailed())).toBe('83ab6da2d55ff9bcec07b6578a80c950a71da3b576b185b42573b95abf70334c');
    expect([occurrences(accepted(), 'claude-opus-5'), occurrences(accepted(), '2.1.226')]).toEqual([5, 1]);
    expect([occurrences(authFailed(), 'claude-opus-5'), occurrences(authFailed(), '2.1.226')]).toEqual([1, 1]);
    const v2 = toV2(accepted());
    expect([occurrences(v2, 'claude-opus-5-5'), occurrences(v2, '"claude-opus-5"'), occurrences(v2, '2.1.280'), occurrences(v2, '2.1.226')]).toEqual([5, 0, 1, 0]);
    // The accepted probe already carries every @2 field the builder writes by hand; nothing is added to it.
    expect(v2).toContain('"fast_mode_state":"off"');
    expect(v2).toContain('"permissionMode":"default"');
    expect(v2).toContain('"terminal_reason":"completed"');
    expect(v2).toContain('"speed":"standard"');
  });

  it('V-F1 — F1-v2 is accepted and projects to exactly the 35 bytes the probe harness reconstructed', () => {
    const out = projectText(toV2(accepted()));
    const bytes = Buffer.from(out, 'utf8');
    expect(bytes).toEqual(Buffer.from('{"token": "DS-SYNTH-001", "sum": 5}', 'utf8'));
    expect(bytes.length).toBe(35);
    expect(sha256(bytes)).toBe('ee0644e93174110fd74f29d0a06be362d46181bac5ae998e26abbe5fec27b09c');
  });

  it('V-F1-refused — the transform matters: F1 with only the model replaced is refused by its version, and the raw fixture by its model', () => {
    const modelOnly = accepted().replaceAll('claude-opus-5', 'claude-opus-5-5');
    expect([occurrences(modelOnly, '2.1.226'), occurrences(modelOnly, '2.1.280')]).toEqual([1, 0]);
    expectRefused(thrownBy(() => projectText(modelOnly)), CliLaunchContextError, 'CliLaunchContextError', 'claude_code_version "2.1.226" (must be "2.1.280", the pin\'s) (init at line 1)');
    expectRefused(thrownBy(() => projectText(accepted())), CliModelSubstitutionError, 'CliModelSubstitutionError', 'init.model "claude-opus-5" at line 1');
  });

  it('V-F3 — F3-v2 at its actual exit 1 is CliExitError: its <synthetic> API-error item is not a substitution', () => {
    expectRefused(thrownBy(() => projectText(toV2(authFailed()), { exitCode: 1 })), CliExitError, 'CliExitError', 'exitCode 1, signal null, 0 stderr bytes');
    // Positive control for the exemption: the same item without is_api_error_message is a model that answered, and it is not the requested one.
    const unflagged = toV2(authFailed()).replace('"is_api_error_message":true,', '');
    expect(unflagged).not.toContain('is_api_error_message');
    expectRefused(thrownBy(() => projectText(unflagged, { exitCode: 1 })), CliModelSubstitutionError, 'CliModelSubstitutionError', 'assistant message.model "<synthetic>" at line 3');
  });

  it('V-F2 — F2-v2 at exit 0 is CliResultError naming is_error and the result line', () => {
    expectRefused(thrownBy(() => projectText(toV2(authFailed()))), CliResultError, 'CliResultError', 'is_error true at line 4 (subtype "success" alone is not success)');
  });

  it('V-F4 — F3-v2 plus one rejected rate-limit event is exhaustion, at exit 1 and at exit 0', () => {
    const lines = toV2(authFailed()).split('\n');
    lines.splice(3, 0, '{"rate_limit_info":{"isUsingOverage":false,"overageStatus":"rejected","rateLimitType":"five_hour","resetsAt":1790089800,"status":"rejected"},"session_id":"[REDACTED:session_id]","type":"rate_limit_event","uuid":"[REDACTED:uuid]"}');
    for (const exitCode of [1, 0]) {
      const error = thrownBy(() => projectText(lines.join('\n'), { exitCode }));
      expectRefused(error, CliIncludedUsageExhaustedError, 'CliIncludedUsageExhaustedError', 'the rate_limit_event at line 4 reports status "rejected" (rateLimitType "five_hour", resetsAt 1790089800)');
      expect((error as CliIncludedUsageExhaustedError).resetsAt).toBe(1790089800);
      expect((error as CliIncludedUsageExhaustedError).rateLimitType).toBe('five_hour');
      expect((error as CliIncludedUsageExhaustedError).line).toBe(4);
    }
  });
});

// ---------------------------------------------------------------------------
// D-6: every allowlist value
// ---------------------------------------------------------------------------

interface InfoCase {
  name: string;
  mutate(info: Ev): void;
  /** `accepted`, or the class, its name, and the message fragment after the event's line. */
  expected: 'accepted' | readonly [ErrorClass, string, (line: number) => string];
}

const exhausted = (detail: string) => [CliIncludedUsageExhaustedError, 'CliIncludedUsageExhaustedError', (l: number) => `the rate_limit_event at line ${l} reports status "rejected"${detail}`] as const;
const overage = (detail: string) => [CliOverageError, 'CliOverageError', (l: number) => `the rate_limit_event at line ${l} reports overage: ${detail}`] as const;
const unobserved = (detail: string) => [CliUsageUnobservedError, 'CliUsageUnobservedError', (l: number) => `the rate_limit_event at line ${l}: ${detail}`] as const;

const INFO_CASES: InfoCase[] = [
  // status
  { name: 'status "allowed" (the builder)', mutate: () => {}, expected: 'accepted' },
  { name: 'status "allowed_warning"', mutate: (i) => { i['status'] = 'allowed_warning'; }, expected: 'accepted' },
  { name: 'status "rejected"', mutate: (i) => { i['status'] = 'rejected'; }, expected: exhausted(' (rateLimitType "five_hour", resetsAt 1790075400)') },
  { name: 'status "blocked"', mutate: (i) => { i['status'] = 'blocked'; }, expected: unobserved('status "blocked" (must be "allowed" or "allowed_warning")') },
  { name: 'status absent', mutate: (i) => { delete i['status']; }, expected: unobserved('status undefined (must be "allowed" or "allowed_warning")') },
  // rateLimitType
  { name: 'rateLimitType "five_hour" (the builder)', mutate: () => {}, expected: 'accepted' },
  { name: 'rateLimitType "seven_day"', mutate: (i) => { i['rateLimitType'] = 'seven_day'; }, expected: 'accepted' },
  { name: 'rateLimitType "seven_day_opus"', mutate: (i) => { i['rateLimitType'] = 'seven_day_opus'; }, expected: 'accepted' },
  { name: 'rateLimitType "seven_day_sonnet"', mutate: (i) => { i['rateLimitType'] = 'seven_day_sonnet'; }, expected: 'accepted' },
  { name: 'rateLimitType "overage"', mutate: (i) => { i['rateLimitType'] = 'overage'; }, expected: overage('rateLimitType "overage"') },
  { name: 'rateLimitType "seven_day_overage_included"', mutate: (i) => { i['rateLimitType'] = 'seven_day_overage_included'; }, expected: unobserved('rateLimitType "seven_day_overage_included" (must be "five_hour", "seven_day", "seven_day_opus" or "seven_day_sonnet")') },
  { name: 'rateLimitType "ten_hour"', mutate: (i) => { i['rateLimitType'] = 'ten_hour'; }, expected: unobserved('rateLimitType "ten_hour"') },
  // isUsingOverage
  { name: 'isUsingOverage false (the builder)', mutate: () => {}, expected: 'accepted' },
  { name: 'isUsingOverage true', mutate: (i) => { i['isUsingOverage'] = true; }, expected: overage('isUsingOverage true') },
  { name: 'isUsingOverage absent', mutate: (i) => { delete i['isUsingOverage']; }, expected: unobserved('isUsingOverage absent (must be present and false)') },
  { name: 'isUsingOverage "false", a string', mutate: (i) => { i['isUsingOverage'] = 'false'; }, expected: unobserved('isUsingOverage "false" (must be false)') },
  // overageInUse
  { name: 'overageInUse absent (the builder)', mutate: () => {}, expected: 'accepted' },
  { name: 'overageInUse false', mutate: (i) => { i['overageInUse'] = false; }, expected: 'accepted' },
  { name: 'overageInUse true', mutate: (i) => { i['overageInUse'] = true; }, expected: overage('overageInUse true') },
  { name: 'overageInUse "no"', mutate: (i) => { i['overageInUse'] = 'no'; }, expected: unobserved('overageInUse "no" (must be absent or false)') },
  // overageStatus
  { name: 'overageStatus "rejected" (the builder)', mutate: () => {}, expected: 'accepted' },
  { name: 'overageStatus "allowed"', mutate: (i) => { i['overageStatus'] = 'allowed'; }, expected: overage('overageStatus "allowed"') },
  { name: 'overageStatus "allowed_warning"', mutate: (i) => { i['overageStatus'] = 'allowed_warning'; }, expected: overage('overageStatus "allowed_warning"') },
  { name: 'overageStatus absent', mutate: (i) => { delete i['overageStatus']; }, expected: unobserved('overageStatus absent (must be "rejected"') },
  { name: 'overageStatus "disabled"', mutate: (i) => { i['overageStatus'] = 'disabled'; }, expected: unobserved('overageStatus "disabled" (must be "rejected")') },
  // several overage facts at once are all named
  { name: 'isUsingOverage true and overageStatus "allowed" together', mutate: (i) => { i['isUsingOverage'] = true; i['overageStatus'] = 'allowed'; }, expected: overage('isUsingOverage true, overageStatus "allowed"') },
  // rateLimitGraceActive and errorCode: absent only
  { name: 'rateLimitGraceActive false', mutate: (i) => { i['rateLimitGraceActive'] = false; }, expected: unobserved('rateLimitGraceActive false (must be absent)') },
  { name: 'rateLimitGraceActive true', mutate: (i) => { i['rateLimitGraceActive'] = true; }, expected: unobserved('rateLimitGraceActive true (must be absent)') },
  { name: 'errorCode present', mutate: (i) => { i['errorCode'] = 'rate_limited'; }, expected: unobserved('errorCode "rate_limited" (must be absent)') },
  // utilization, top-level and in unifiedWindows
  { name: 'utilization 1', mutate: (i) => { i['utilization'] = 1; }, expected: 'accepted' },
  { name: 'utilization 0.5', mutate: (i) => { i['utilization'] = 0.5; }, expected: 'accepted' },
  { name: 'utilization 1.01', mutate: (i) => { i['utilization'] = 1.01; }, expected: unobserved('utilization 1.01 (must be a number no greater than 1)') },
  { name: 'utilization "0.5", a string', mutate: (i) => { i['utilization'] = '0.5'; }, expected: unobserved('utilization "0.5" (must be a number no greater than 1)') },
  { name: 'unifiedWindows as an array at or under 1, one entry without a utilization', mutate: (i) => { i['unifiedWindows'] = [{ window: 'five_hour', utilization: 1 }, { window: 'seven_day' }]; }, expected: 'accepted' },
  { name: 'unifiedWindows as an object at or under 1', mutate: (i) => { i['unifiedWindows'] = { five_hour: { utilization: 0.9 }, seven_day: { utilization: 1 } }; }, expected: 'accepted' },
  { name: 'unifiedWindows array entry above 1', mutate: (i) => { i['unifiedWindows'] = [{ window: 'five_hour', utilization: 0.4 }, { window: 'seven_day', utilization: 1.2 }]; }, expected: unobserved('unifiedWindows[1].utilization 1.2 (must be a number no greater than 1)') },
  { name: 'unifiedWindows object entry above 1', mutate: (i) => { i['unifiedWindows'] = { five_hour: { utilization: 2 } }; }, expected: unobserved('unifiedWindows["five_hour"].utilization 2 (must be a number no greater than 1)') },
  { name: 'unifiedWindows neither an array nor an object', mutate: (i) => { i['unifiedWindows'] = 'x'; }, expected: unobserved('unifiedWindows "x" (must be an array or an object)') },
  // unifiedWindows entries: an entry that is not an object is refused by its shape, whatever its value; a utilization is read at any depth.
  { name: 'unifiedWindows object entry that is a bare number above 1', mutate: (i) => { i['unifiedWindows'] = { five_hour: 1.4 }; }, expected: unobserved('unifiedWindows["five_hour"] 1.4 (must be an object)') },
  { name: 'unifiedWindows object entry that is a bare number at or under 1', mutate: (i) => { i['unifiedWindows'] = { five_hour: 0.4 }; }, expected: unobserved('unifiedWindows["five_hour"] 0.4 (must be an object)') },
  { name: 'unifiedWindows array entry that is a bare number above 1', mutate: (i) => { i['unifiedWindows'] = [1.5]; }, expected: unobserved('unifiedWindows[0] 1.5 (must be an object)') },
  { name: 'unifiedWindows object entry with a nested utilization above 1', mutate: (i) => { i['unifiedWindows'] = { five_hour: { current: { utilization: 1.4 } } }; }, expected: unobserved('unifiedWindows["five_hour"].current.utilization 1.4 (must be a number no greater than 1)') },
  { name: 'unifiedWindows object entry with a utilization above 1 inside a nested array', mutate: (i) => { i['unifiedWindows'] = { five_hour: { history: [{ utilization: 0.2 }, { utilization: 1.3 }] } }; }, expected: unobserved('unifiedWindows["five_hour"].history[1].utilization 1.3 (must be a number no greater than 1)') },
  { name: 'unifiedWindows object entry with a nested utilization at or under 1', mutate: (i) => { i['unifiedWindows'] = { five_hour: { current: { utilization: 0.4 } }, seven_day: { history: [{ utilization: 1 }] } }; }, expected: 'accepted' },
  // Review repair S4, a parent decision: an entry is an object or it is refused, whatever else it is; a utilization is
  // read at any depth.
  { name: 'unifiedWindows object entry that is an array', mutate: (i) => { i['unifiedWindows'] = { five_hour: [1.5] }; }, expected: unobserved('unifiedWindows["five_hour"] [1.5] (must be an object)') },
  { name: 'unifiedWindows object entry that is a string', mutate: (i) => { i['unifiedWindows'] = { five_hour: '1.4' }; }, expected: unobserved('unifiedWindows["five_hour"] "1.4" (must be an object)') },
  { name: 'unifiedWindows object entry that is null', mutate: (i) => { i['unifiedWindows'] = { five_hour: null }; }, expected: unobserved('unifiedWindows["five_hour"] null (must be an object)') },
  { name: 'unifiedWindows utilization above 1 four levels down', mutate: (i) => { i['unifiedWindows'] = { five_hour: { a: { b: { c: { utilization: 1.4 } } } } }; }, expected: unobserved('unifiedWindows["five_hour"].a.b.c.utilization 1.4 (must be a number no greater than 1)') },
  { name: 'unifiedWindows utilization at or under 1 four levels down', mutate: (i) => { i['unifiedWindows'] = { five_hour: { a: { b: { c: { utilization: 0.4 } } } } }; }, expected: 'accepted' },
  // Review repair S2, a parent decision: D-6's per-field rules apply to every object at any depth inside
  // unifiedWindows, each field allowed to be absent there. No probe has shown a window's shape, so each of these is a
  // probe question.
  { name: 'utilization 0', mutate: (i) => { i['utilization'] = 0; }, expected: 'accepted' },
  { name: 'utilization -0.1, negative', mutate: (i) => { i['utilization'] = -0.1; }, expected: unobserved('utilization -0.1 (must be a number no less than 0)') },
  { name: 'unifiedWindows window with a negative utilization', mutate: (i) => { i['unifiedWindows'] = { five_hour: { utilization: -5 } }; }, expected: unobserved('unifiedWindows["five_hour"].utilization -5 (must be a number no less than 0)') },
  // Review repair U2, a parent decision: a rejected window that reports no rateLimitType or resetsAt carries the event's
  // own (the builder's "five_hour" and 1790075400), so whatever holds the next launch back has a time to hold it to.
  { name: 'unifiedWindows window reporting status "rejected"', mutate: (i) => { i['unifiedWindows'] = { seven_day: { status: 'rejected', utilization: 1 } }; }, expected: exhausted(' at unifiedWindows["seven_day"].status (rateLimitType "five_hour", resetsAt 1790075400)') },
  { name: 'unifiedWindows window reporting status "rejected" two levels down', mutate: (i) => { i['unifiedWindows'] = { five_hour: { current: { status: 'rejected' } } }; }, expected: exhausted(' at unifiedWindows["five_hour"].current.status') },
  { name: 'unifiedWindows array window reporting status "rejected"', mutate: (i) => { i['unifiedWindows'] = [{ window: 'five_hour', status: 'allowed' }, { window: 'seven_day', status: 'rejected' }]; }, expected: exhausted(' at unifiedWindows[1].status') },
  { name: 'unifiedWindows window reporting status "allowed_warning"', mutate: (i) => { i['unifiedWindows'] = { five_hour: { status: 'allowed_warning', utilization: 0.9 } }; }, expected: 'accepted' },
  { name: 'unifiedWindows window reporting status "blocked"', mutate: (i) => { i['unifiedWindows'] = { five_hour: { status: 'blocked' } }; }, expected: unobserved('unifiedWindows["five_hour"].status "blocked" (must be "allowed" or "allowed_warning")') },
  { name: 'unifiedWindows window with isUsingOverage true', mutate: (i) => { i['unifiedWindows'] = { five_hour: { utilization: 0.1, isUsingOverage: true } }; }, expected: overage('unifiedWindows["five_hour"].isUsingOverage true') },
  { name: 'unifiedWindows window with overageInUse true', mutate: (i) => { i['unifiedWindows'] = { five_hour: { overageInUse: true } }; }, expected: overage('unifiedWindows["five_hour"].overageInUse true') },
  { name: 'unifiedWindows window with overageStatus "allowed_warning"', mutate: (i) => { i['unifiedWindows'] = { five_hour: { overageStatus: 'allowed_warning' } }; }, expected: overage('unifiedWindows["five_hour"].overageStatus "allowed_warning"') },
  { name: 'unifiedWindows window with rateLimitType "overage", two levels down', mutate: (i) => { i['unifiedWindows'] = { five_hour: { current: { rateLimitType: 'overage' } } }; }, expected: overage('unifiedWindows["five_hour"].current.rateLimitType "overage"') },
  { name: 'unifiedWindows window carrying every overage field at its allowed value', mutate: (i) => { i['unifiedWindows'] = { five_hour: { rateLimitType: 'seven_day_opus', isUsingOverage: false, overageInUse: false, overageStatus: 'rejected', status: 'allowed' } }; }, expected: 'accepted' },
  { name: 'unifiedWindows window with isUsingOverage "false", a string', mutate: (i) => { i['unifiedWindows'] = { five_hour: { isUsingOverage: 'false' } }; }, expected: unobserved('unifiedWindows["five_hour"].isUsingOverage "false" (must be false)') },
  { name: 'unifiedWindows window with overageInUse "no"', mutate: (i) => { i['unifiedWindows'] = { five_hour: { overageInUse: 'no' } }; }, expected: unobserved('unifiedWindows["five_hour"].overageInUse "no" (must be absent or false)') },
  { name: 'unifiedWindows window with overageStatus "disabled"', mutate: (i) => { i['unifiedWindows'] = { five_hour: { overageStatus: 'disabled' } }; }, expected: unobserved('unifiedWindows["five_hour"].overageStatus "disabled" (must be "rejected")') },
  { name: 'unifiedWindows window with rateLimitType "ten_hour"', mutate: (i) => { i['unifiedWindows'] = { five_hour: { rateLimitType: 'ten_hour' } }; }, expected: unobserved('unifiedWindows["five_hour"].rateLimitType "ten_hour" (must be "five_hour", "seven_day", "seven_day_opus" or "seven_day_sonnet")') },
  { name: 'unifiedWindows window with rateLimitGraceActive false', mutate: (i) => { i['unifiedWindows'] = { five_hour: { rateLimitGraceActive: false } }; }, expected: unobserved('unifiedWindows["five_hour"].rateLimitGraceActive false (must be absent)') },
  { name: 'unifiedWindows window with an errorCode', mutate: (i) => { i['unifiedWindows'] = [{ window: 'five_hour', errorCode: 'rate_limited' }]; }, expected: unobserved('unifiedWindows[0].errorCode "rate_limited" (must be absent)') },
  { name: 'unifiedWindows window keyed seven_day_overage_included', mutate: (i) => { i['unifiedWindows'] = { seven_day_overage_included: { utilization: 0.2 } }; }, expected: unobserved('unifiedWindows key "seven_day_overage_included" (a window named for overage is refused until a probe explains it)') },
  { name: 'unifiedWindows window keyed with OVERAGE in capitals', mutate: (i) => { i['unifiedWindows'] = { FIVE_HOUR_OVERAGE: { utilization: 0.2 } }; }, expected: unobserved('unifiedWindows key "FIVE_HOUR_OVERAGE"') },
  // Review repair U1, a parent decision under D-8's "Unknown means refused": a key or a string value naming overage
  // anywhere inside unifiedWindows is refused by its path, not only a key of the object form. D-6's own overage fields
  // (isUsingOverage, overageInUse, overageStatus) are held to their values instead, and rule 1 classifies their overage
  // values first. What a window carries is unobserved, so each of these is a probe question.
  { name: 'unifiedWindows array window named seven_day_overage_included in its window field', mutate: (i) => { i['unifiedWindows'] = [{ window: 'seven_day_overage_included', utilization: 0.2 }]; }, expected: unobserved('unifiedWindows[0].window "seven_day_overage_included" (a window named for overage is refused until a probe explains it)') },
  { name: 'unifiedWindows window with a nested key seven_day_overage_included', mutate: (i) => { i['unifiedWindows'] = { five_hour: { seven_day_overage_included: { utilization: 0.1 } } }; }, expected: unobserved('unifiedWindows["five_hour"] key "seven_day_overage_included" (a window named for overage is refused until a probe explains it)') },
  { name: 'unifiedWindows string value naming OVERAGE in capitals, two levels down', mutate: (i) => { i['unifiedWindows'] = { five_hour: { current: { label: 'FIVE_HOUR_OVERAGE' } } }; }, expected: unobserved('unifiedWindows["five_hour"].current.label "FIVE_HOUR_OVERAGE" (a window named for overage is refused until a probe explains it)') },
  { name: 'unifiedWindows window carrying overageDisabledReason, a key D-6 does not name', mutate: (i) => { i['unifiedWindows'] = { five_hour: { overageDisabledReason: 'org_level_disabled' } }; }, expected: unobserved('unifiedWindows["five_hour"] key "overageDisabledReason" (a window named for overage is refused until a probe explains it)') },
  { name: 'unifiedWindows array window named seven_day in its window field (the U1 control)', mutate: (i) => { i['unifiedWindows'] = [{ window: 'seven_day', utilization: 0.2 }]; }, expected: 'accepted' },
  { name: 'unifiedWindows window carrying D-6\'s overage fields at their allowed values two levels down', mutate: (i) => { i['unifiedWindows'] = { five_hour: { current: { isUsingOverage: false, overageInUse: false, overageStatus: 'rejected' } } }; }, expected: 'accepted' },
  { name: 'unifiedWindows array window with rateLimitType "overage" (rule 1 first, by priority)', mutate: (i) => { i['unifiedWindows'] = [{ window: 'five_hour', rateLimitType: 'overage' }]; }, expected: overage('unifiedWindows[0].rateLimitType "overage"') },
  // U1's walk, branch by branch (review repair U1, a parent decision). An array inside a window is walked, not only the
  // array form of unifiedWindows itself, whose entries the loop in rateLimitProblems hands over one by one; and a key
  // below the top level is matched without regard to case, as the top-level key loop matches its own. Each refusal has
  // an accepted sibling of the same shape that names no overage.
  { name: 'unifiedWindows window with an overage name reached through a nested array', mutate: (i) => { i['unifiedWindows'] = { five_hour: { history: [{ name: 'seven_day_overage_included' }] } }; }, expected: unobserved('unifiedWindows["five_hour"].history[0].name "seven_day_overage_included" (a window named for overage is refused until a probe explains it)') },
  { name: 'unifiedWindows window with a name reached through a nested array that names no overage (the array control)', mutate: (i) => { i['unifiedWindows'] = { five_hour: { history: [{ name: 'seven_day' }] } }; }, expected: 'accepted' },
  { name: 'unifiedWindows window with a nested key naming overage in mixed case', mutate: (i) => { i['unifiedWindows'] = { five_hour: { Seven_Day_OVERAGE_Included: { utilization: 0.1 } } }; }, expected: unobserved('unifiedWindows["five_hour"] key "Seven_Day_OVERAGE_Included" (a window named for overage is refused until a probe explains it)') },
  { name: 'unifiedWindows window with a nested mixed-case key that names no overage (the case control)', mutate: (i) => { i['unifiedWindows'] = { five_hour: { Seven_Day_Included: { utilization: 0.1 } } }; }, expected: 'accepted' },
  // fields the allowlist does not name
  { name: 'unknown extra fields (overageDisabledReason, resetsAt, surpassedThreshold)', mutate: (i) => { i['surpassedThreshold'] = 0.75; }, expected: 'accepted' },
];

describe('claude-code-cli@2 — D-6: every rate-limit allowlist value', () => {
  for (const c of INFO_CASES) {
    const verdict = c.expected === 'accepted' ? 'accepted' : c.expected[1];
    it(`V-U — ${c.name} → ${verdict}`, () => {
      const events = build();
      c.mutate(rateInfo(events));
      if (c.expected === 'accepted') {
        expect(project(events)).toBe(PAYLOAD);
        return;
      }
      const [cls, name, fragment] = c.expected;
      expectRefused(refusalOf(events), cls, name, fragment(lineOf(events, isType('rate_limit_event'))));
    });
  }

  it('V-U-event — rate_limit_info null or absent, or no rate-limit event at all, is unobserved; the builder\'s one event is the positive control', () => {
    expect(project(build())).toBe(PAYLOAD);
    const nulled = build();
    nulled[at(nulled, isType('rate_limit_event'))]!['rate_limit_info'] = null;
    expectRefused(refusalOf(nulled), CliUsageUnobservedError, 'CliUsageUnobservedError', `the rate_limit_event at line ${lineOf(nulled, isType('rate_limit_event'))}: rate_limit_info null (must be an object)`);
    const absent = build();
    delete absent[at(absent, isType('rate_limit_event'))]!['rate_limit_info'];
    expectRefused(refusalOf(absent), CliUsageUnobservedError, 'CliUsageUnobservedError', `the rate_limit_event at line ${lineOf(absent, isType('rate_limit_event'))}: rate_limit_info undefined (must be an object)`);
    const none = build();
    none.splice(at(none, isType('rate_limit_event')), 1);
    expect(none.filter(isType('rate_limit_event'))).toHaveLength(0);
    expectRefused(refusalOf(none), CliUsageUnobservedError, 'CliUsageUnobservedError', 'no rate_limit_event arrived');
  });

  it('V-U-window — a rejected window is exhaustion at exit 0 and at exit 1, carrying the window\'s own rateLimitType and resetsAt as reported; overage inside a window outranks it', () => {
    for (const exitCode of [0, 1]) {
      const events = build();
      rateInfo(events)['unifiedWindows'] = { five_hour: { utilization: 0.2 }, seven_day: { status: 'rejected', utilization: 1, rateLimitType: 'seven_day', resetsAt: 1790500000 } };
      const error = refusalOf(events, { exitCode });
      expectRefused(error, CliIncludedUsageExhaustedError, 'CliIncludedUsageExhaustedError', `the rate_limit_event at line ${lineOf(events, isType('rate_limit_event'))} reports status "rejected" at unifiedWindows["seven_day"].status (rateLimitType "seven_day", resetsAt 1790500000)`);
      expect((error as CliIncludedUsageExhaustedError).rateLimitType).toBe('seven_day');
      expect((error as CliIncludedUsageExhaustedError).resetsAt).toBe(1790500000);
    }
    const both = build();
    rateInfo(both)['unifiedWindows'] = { seven_day: { status: 'rejected' }, five_hour: { isUsingOverage: true } };
    expectRefused(refusalOf(both), CliOverageError, 'CliOverageError', `the rate_limit_event at line ${lineOf(both, isType('rate_limit_event'))} reports overage: unifiedWindows["five_hour"].isUsingOverage true`);
  });

  // Review repair U2, a parent decision: each of the two facts is the window's own when it reports one, and otherwise
  // the event's, so a reset-pending hold has a time whenever the event reports one. A null is no report. Where a window
  // reports its reset, if it does, is a probe question.
  const windowExhaustion = (window: Ev, over: Ev = {}, exitCode = 0): CliIncludedUsageExhaustedError => {
    const events = build();
    Object.assign(rateInfo(events), over, { unifiedWindows: { seven_day: { status: 'rejected', ...window } } });
    for (const [key, value] of Object.entries(over)) if (value === undefined) delete rateInfo(events)[key];
    const error = refusalOf(events, { exitCode });
    expectRefused(error, CliIncludedUsageExhaustedError, 'CliIncludedUsageExhaustedError', `the rate_limit_event at line ${lineOf(events, isType('rate_limit_event'))} reports status "rejected" at unifiedWindows["seven_day"].status`);
    return error as CliIncludedUsageExhaustedError;
  };

  for (const exitCode of [0, 1]) {
    it(`V-U-window-fallback — a rejected window reporting neither fact carries the event's rateLimitType and resetsAt, at exit ${exitCode}`, () => {
      const error = windowExhaustion({}, {}, exitCode);
      expect([error.rateLimitType, error.resetsAt]).toEqual(['five_hour', 1790075400]);
      expect(error.message).toContain('(rateLimitType "five_hour", resetsAt 1790075400)');
    });
  }

  it('V-U-window-fallback-each — each fact falls back alone: the window\'s own resetsAt with the event\'s rateLimitType, and the other way round; a null is no report', () => {
    const ownReset = windowExhaustion({ resetsAt: 1790500000 });
    expect([ownReset.rateLimitType, ownReset.resetsAt]).toEqual(['five_hour', 1790500000]);
    const ownType = windowExhaustion({ rateLimitType: 'seven_day' });
    expect([ownType.rateLimitType, ownType.resetsAt]).toEqual(['seven_day', 1790075400]);
    const nulls = windowExhaustion({ rateLimitType: null, resetsAt: null });
    expect([nulls.rateLimitType, nulls.resetsAt]).toEqual(['five_hour', 1790075400]);
  });

  it('V-U-window-fallback-control — the fallback reads the event\'s own values, not a constant: another event resetsAt is carried, and an event reporting none leaves none', () => {
    const other = windowExhaustion({}, { rateLimitType: 'seven_day_opus', resetsAt: 1790999999 });
    expect([other.rateLimitType, other.resetsAt]).toEqual(['seven_day_opus', 1790999999]);
    const none = windowExhaustion({}, { resetsAt: undefined });
    expect([none.rateLimitType, none.resetsAt]).toEqual(['five_hour', undefined]);
    expect(none.message).toContain('(rateLimitType "five_hour", resetsAt undefined)');
  });
});

// ---------------------------------------------------------------------------
// D-7: every rule alone, at exit 0 and at exit 1
// ---------------------------------------------------------------------------

interface RuleCase {
  rule: string;
  mutate(events: Ev[]): void;
  check(error: unknown, events: Ev[]): void;
}

const RULE_CASES: RuleCase[] = [
  {
    rule: '1 overage (overageStatus "allowed")',
    mutate: (ev) => { rateInfo(ev)['overageStatus'] = 'allowed'; },
    check: (error, ev) => expectRefused(error, CliOverageError, 'CliOverageError', `the rate_limit_event at line ${lineOf(ev, isType('rate_limit_event'))} reports overage: overageStatus "allowed"`),
  },
  {
    rule: '2 exhaustion (status "rejected")',
    mutate: (ev) => { rateInfo(ev)['status'] = 'rejected'; },
    check: (error, ev) => expectRefused(error, CliIncludedUsageExhaustedError, 'CliIncludedUsageExhaustedError', `the rate_limit_event at line ${lineOf(ev, isType('rate_limit_event'))} reports status "rejected"`),
  },
  {
    rule: '3 credits (model_requires_usage_credits)',
    mutate: (ev) => beforeRateLimit(ev, apiErrorItem({ error: 'model_requires_usage_credits' })),
    check: (error, ev) => {
      expectRefused(error, CliCreditsRequiredError, 'CliCreditsRequiredError', `API error "model_requires_usage_credits" on an assistant API-error item at line ${lineOf(ev, isType('assistant'), 1)}`);
      expect((error as CliCreditsRequiredError).kind).toBe('model_requires_usage_credits');
    },
  },
  {
    rule: '4 long-context route (init.model with [1m])',
    mutate: (ev) => { initOf(ev)['model'] = 'claude-opus-5-5[1m]'; },
    check: (error) => expectRefused(error, CliLongContextRouteError, 'CliLongContextRouteError', 'the 1M-context route — init.model "claude-opus-5-5[1m]" at line 1'),
  },
  {
    rule: '5 substitution (system model_fallback)',
    mutate: (ev) => afterStatus(ev, systemEvent('model_fallback')),
    check: (error) => expectRefused(error, CliModelSubstitutionError, 'CliModelSubstitutionError', 'a system event of subtype "model_fallback" at line 3'),
  },
  {
    rule: '6 refusal (message_delta stop_reason "refusal")',
    mutate: (ev) => { Object.assign(messageDelta(ev), { stop_reason: 'refusal', stop_details: { category: 'frontier_llm', explanation: 'declined' } }); },
    check: (error) => {
      expectRefused(error, ProviderRefusalError, 'ProviderRefusalError', 'the model refused (category frontier_llm) — declined');
      expect((error as ProviderRefusalError).category).toBe('frontier_llm');
    },
  },
  {
    rule: '7 truncation (message_delta stop_reason "max_tokens")',
    mutate: (ev) => { messageDelta(ev)['stop_reason'] = 'max_tokens'; },
    check: (error) => {
      expectRefused(error, CliOutputTruncatedError, 'CliOutputTruncatedError', 'stopped at max_tokens (64000)');
      expect(error).toBeInstanceOf(ProviderOutputTruncatedError);
    },
  },
  {
    rule: '8 fast mode (init fast_mode_state "on")',
    mutate: (ev) => { initOf(ev)['fast_mode_state'] = 'on'; },
    check: (error) => expectRefused(error, CliFastModeError, 'CliFastModeError', 'the stream reports fast mode — init fast_mode_state "on" at line 1'),
  },
  {
    rule: '9 effort refused (effort_requires_thinking)',
    mutate: (ev) => beforeRateLimit(ev, apiErrorItem({ error: 'effort_requires_thinking' })),
    check: (error, ev) => expectRefused(error, CliEffortRefusedError, 'CliEffortRefusedError', `API error "effort_requires_thinking" on an assistant API-error item at line ${lineOf(ev, isType('assistant'), 1)}`),
  },
  {
    rule: '9 pin obsolete (claude_code_version_too_old)',
    mutate: (ev) => beforeRateLimit(ev, apiErrorItem({ error: 'claude_code_version_too_old' })),
    check: (error, ev) => expectRefused(error, CliPinObsoleteError, 'CliPinObsoleteError', `API error "claude_code_version_too_old" on an assistant API-error item at line ${lineOf(ev, isType('assistant'), 1)}`),
  },
];

describe('claude-code-cli@2 — D-7: each rule alone, before the exit check', () => {
  for (const c of RULE_CASES) {
    for (const exitCode of [0, 1]) {
      it(`V-R — rule ${c.rule} at exit ${exitCode} → the rule's class, not CliExitError`, () => {
        const events = build();
        c.mutate(events);
        c.check(refusalOf(events, { exitCode }), events);
      });
    }
  }

  it('V-R-control — the builder at exit 0 is accepted and at exit 1 is CliExitError: without a classified fact, the exit decides', () => {
    expect(project(build())).toBe(PAYLOAD);
    expectRefused(refusalOf(build(), { exitCode: 1 }), CliExitError, 'CliExitError', 'exitCode 1, signal null, 0 stderr bytes');
  });
});

// ---------------------------------------------------------------------------
// D-7 rule 5: every substitution position
// ---------------------------------------------------------------------------

const SUBSTITUTION_POSITIONS: readonly [string, (ev: Ev[]) => void, (ev: Ev[]) => string][] = [
  [
    'a fallback content block',
    (ev) => ev.splice(at(ev, isStream('content_block_stop')) + 1, 0, se('content_block_start', { index: 1, content_block: { type: 'fallback', model: 'claude-sonnet-5' } }), se('content_block_stop', { index: 1 })),
    (ev) => `a content_block_start of type "fallback" at line ${lineOf(ev, isBlockStart('fallback'))}`,
  ],
  ['a fallback assistant item', (ev) => { (assistantMessage(ev)['content'] as Ev[]).push({ type: 'fallback', model: 'claude-sonnet-5' }); }, (ev) => `an assistant content item of type "fallback" at line ${lineOf(ev, isType('assistant'))}`],
  ['a system model_fallback event', (ev) => afterStatus(ev, systemEvent('model_fallback')), () => 'a system event of subtype "model_fallback" at line 3'],
  ['a system model_refusal_fallback event', (ev) => afterStatus(ev, systemEvent('model_refusal_fallback')), () => 'a system event of subtype "model_refusal_fallback" at line 3'],
  ['a system model_consent_fallback event', (ev) => afterStatus(ev, systemEvent('model_consent_fallback')), () => 'a system event of subtype "model_consent_fallback" at line 3'],
  ['API error model_substitution_disabled on an assistant item', (ev) => beforeRateLimit(ev, apiErrorItem({ error: 'model_substitution_disabled' })), (ev) => `API error "model_substitution_disabled" on an assistant API-error item at line ${lineOf(ev, isType('assistant'), 1)}`],
  ['API error no_allowed_fallback on a system api_error event', (ev) => afterStatus(ev, systemEvent('api_error', { error: 'no_allowed_fallback' })), () => 'API error "no_allowed_fallback" on a system api_error event at line 3'],
  ['another init model', (ev) => { initOf(ev)['model'] = 'claude-opus-5'; }, () => 'init.model "claude-opus-5" at line 1'],
  ['no init model at all', (ev) => { delete initOf(ev)['model']; }, () => 'init.model undefined at line 1'],
  ['another message_start model', (ev) => { (inner(ev, at(ev, isStream('message_start')))['message'] as Ev)['model'] = 'claude-opus-5'; }, () => 'message_start message.model "claude-opus-5" at line 3'],
  ['another assistant model', (ev) => { assistantMessage(ev)['model'] = 'claude-sonnet-5'; }, (ev) => `assistant message.model "claude-sonnet-5" at line ${lineOf(ev, isType('assistant'))}`],
  ['<synthetic> on an assistant item that is not flagged as an API error', (ev) => beforeRateLimit(ev, apiErrorItem({ error: 'authentication_failed' }, false)), (ev) => `assistant message.model "<synthetic>" at line ${lineOf(ev, isType('assistant'), 1)}`],
  [
    'the only modelUsage key naming another model',
    (ev) => { const mu = modelUsageOf(ev); mu['claude-opus-5'] = mu['claude-opus-5-5']; delete mu['claude-opus-5-5']; },
    (ev) => `result.modelUsage key "claude-opus-5" at line ${lineOf(ev, isType('result'))}`,
  ],
  ['two modelUsage entries', (ev) => { modelUsageOf(ev)['claude-haiku-4-5'] = { inputTokens: 1, outputTokens: 1 }; }, (ev) => `result.modelUsage key "claude-haiku-4-5" at line ${lineOf(ev, isType('result'))}`],
  ['a canonicalModel naming another model', (ev) => { (modelUsageOf(ev)['claude-opus-5-5'] as Ev)['canonicalModel'] = 'claude-opus-5'; }, (ev) => `result.modelUsage["claude-opus-5-5"].canonicalModel "claude-opus-5" at line ${lineOf(ev, isType('result'))}`],
  ['a canonicalModel present as null', (ev) => { (modelUsageOf(ev)['claude-opus-5-5'] as Ev)['canonicalModel'] = null; }, (ev) => `result.modelUsage["claude-opus-5-5"].canonicalModel null at line ${lineOf(ev, isType('result'))}`],
];

describe('claude-code-cli@2 — D-7 rule 5: every substitution position', () => {
  for (const [position, mutate, fragment] of SUBSTITUTION_POSITIONS) {
    it(`V-S — ${position} → CliModelSubstitutionError naming it and its line`, () => {
      const events = build();
      mutate(events);
      const error = refusalOf(events);
      expectRefused(error, CliModelSubstitutionError, 'CliModelSubstitutionError', fragment(events));
      expect((error as CliModelSubstitutionError).line).toBe(Number(/at line (\d+)$/.exec(fragment(events))![1]));
    });
  }

  it('V-S-api-error — an API-error item and an empty modelUsage are not a substitution: with is_error they fall through to CliResultError (exit 0) and CliExitError (exit 1)', () => {
    const events = build();
    beforeRateLimit(events, apiErrorItem({ error: 'authentication_failed' }));
    Object.assign(resultOf(events), { is_error: true, modelUsage: {} });
    expectRefused(refusalOf(events), CliResultError, 'CliResultError', `is_error true at line ${lineOf(events, isType('result'))}`);
    expectRefused(refusalOf(events, { exitCode: 1 }), CliExitError, 'CliExitError', 'exitCode 1');
  });

  it('V-S-flagged — D-7 skips every flagged API-error item in the model check, whatever model it names: at exit 1 CliExitError, at exit 0 the result step\'s API-error refusal', () => {
    // The result step's refusal of an API-error item beside a success is what makes the broad exemption safe: without
    // it, a flagged item naming another model in a clean exit-0 stream would be accepted.
    const flagged = build();
    const item = apiErrorItem({ error: 'authentication_failed' });
    (item['message'] as Ev)['model'] = 'claude-sonnet-5';
    beforeRateLimit(flagged, item);
    expectRefused(refusalOf(flagged, { exitCode: 1 }), CliExitError, 'CliExitError', 'exitCode 1, signal null, 0 stderr bytes');
    expectRefused(refusalOf(flagged), CliResultError, 'CliResultError', `the assistant item at line ${lineOf(flagged, isType('assistant'), 1)} is an API error (error "authentication_failed", apiError undefined, api_error undefined) although the result at line ${lineOf(flagged, isType('result'))} reports success`);
    // Positive control: the same item without the flag is a model that answered, and it is not the requested one.
    const unflagged = build();
    const plain = apiErrorItem({ error: 'authentication_failed' }, false);
    (plain['message'] as Ev)['model'] = 'claude-sonnet-5';
    beforeRateLimit(unflagged, plain);
    expectRefused(refusalOf(unflagged, { exitCode: 1 }), CliModelSubstitutionError, 'CliModelSubstitutionError', `assistant message.model "claude-sonnet-5" at line ${lineOf(unflagged, isType('assistant'), 1)}`);
  });

  it('V-S-empty — an empty or missing modelUsage on an otherwise clean result is CliResultError naming the count, not a substitution', () => {
    const empty = build();
    resultOf(empty)['modelUsage'] = {};
    expectRefused(refusalOf(empty), CliResultError, 'CliResultError', `modelUsage has 0 entries at line ${lineOf(empty, isType('result'))} (must have exactly one)`);
    const missing = build();
    delete resultOf(missing)['modelUsage'];
    expectRefused(refusalOf(missing), CliResultError, 'CliResultError', `modelUsage undefined at line ${lineOf(missing, isType('result'))} (must be an object with exactly one entry)`);
  });
});

// ---------------------------------------------------------------------------
// D-7 rule 4: every long-context position
// ---------------------------------------------------------------------------

const LONG_CONTEXT_POSITIONS: readonly [string, (ev: Ev[]) => void, (ev: Ev[]) => string][] = [
  ['the init model', (ev) => { initOf(ev)['model'] = 'claude-opus-5-5[1m]'; }, () => 'init.model "claude-opus-5-5[1m]" at line 1'],
  ['the init model, suffix in capitals', (ev) => { initOf(ev)['model'] = 'claude-opus-5-5[1M]'; }, () => 'init.model "claude-opus-5-5[1M]" at line 1'],
  ['the message_start model', (ev) => { (inner(ev, at(ev, isStream('message_start')))['message'] as Ev)['model'] = 'claude-opus-5-5[1m]'; }, () => 'message_start message.model "claude-opus-5-5[1m]" at line 3'],
  ['the assistant model', (ev) => { assistantMessage(ev)['model'] = 'claude-opus-5-5[1m]'; }, (ev) => `assistant message.model "claude-opus-5-5[1m]" at line ${lineOf(ev, isType('assistant'))}`],
  ['the modelUsage key', (ev) => { const mu = modelUsageOf(ev); mu['claude-opus-5-5[1m]'] = mu['claude-opus-5-5']; delete mu['claude-opus-5-5']; }, (ev) => `result.modelUsage key "claude-opus-5-5[1m]" at line ${lineOf(ev, isType('result'))}`],
  ['the canonicalModel', (ev) => { (modelUsageOf(ev)['claude-opus-5-5'] as Ev)['canonicalModel'] = 'claude-opus-5-5[1m]'; }, (ev) => `result.modelUsage["claude-opus-5-5"].canonicalModel "claude-opus-5-5[1m]" at line ${lineOf(ev, isType('result'))}`],
  ['a context-1m beta in init.betas, the model unchanged', (ev) => { initOf(ev)['betas'] = ['interleaved-thinking-2025-05-14', 'context-1m-2025-08-07']; }, () => 'init.betas entry "context-1m-2025-08-07" at line 1'],
];

describe('claude-code-cli@2 — D-7 rule 4: every long-context position', () => {
  for (const [position, mutate, fragment] of LONG_CONTEXT_POSITIONS) {
    it(`V-L — [1m] or a context-1m beta at ${position} → CliLongContextRouteError naming it and its line`, () => {
      const events = build();
      mutate(events);
      const error = refusalOf(events);
      expectRefused(error, CliLongContextRouteError, 'CliLongContextRouteError', `the 1M-context route — ${fragment(events)}`);
      expect((error as CliLongContextRouteError).line).toBe(Number(/at line (\d+)$/.exec(fragment(events))![1]));
    });
  }

  it('V-L-control — betas that name no 1M context are read as nothing: the same init with another beta is accepted', () => {
    const events = build();
    initOf(events)['betas'] = ['interleaved-thinking-2025-05-14'];
    expect(project(events)).toBe(PAYLOAD);
  });
});

// ---------------------------------------------------------------------------
// D-7: every API-error kind, wherever the kind is carried
// ---------------------------------------------------------------------------

const KINDS: readonly [string, ErrorClass, string][] = [
  ['model_requires_usage_credits', CliCreditsRequiredError, 'CliCreditsRequiredError'],
  ['long_context_credits_required', CliCreditsRequiredError, 'CliCreditsRequiredError'],
  ['consent_unanswered', CliCreditsRequiredError, 'CliCreditsRequiredError'],
  ['model_substitution_disabled', CliModelSubstitutionError, 'CliModelSubstitutionError'],
  ['no_allowed_fallback', CliModelSubstitutionError, 'CliModelSubstitutionError'],
  ['safety_monitor_blocked', ProviderRefusalError, 'ProviderRefusalError'],
  ['effort_requires_thinking', CliEffortRefusedError, 'CliEffortRefusedError'],
  ['claude_code_version_too_old', CliPinObsoleteError, 'CliPinObsoleteError'],
];

const CARRIERS: readonly [string, (kind: string) => Ev, string][] = [
  ['an assistant item\'s error field', (kind) => apiErrorItem({ error: kind }), 'an assistant API-error item'],
  ['an assistant item\'s apiError field', (kind) => apiErrorItem({ apiError: kind }), 'an assistant API-error item'],
  ['a system api_error event', (kind) => systemEvent('api_error', { error: kind }), 'a system api_error event'],
  // Review repair S7, a parent decision: api_error, snake_case as the stream serialises is_api_error_message, is a third
  // candidate field. Which spelling 2.1.280 uses for the kind, on either carrier, is a probe question.
  ['an assistant item\'s api_error field', (kind) => apiErrorItem({ api_error: kind }), 'an assistant API-error item'],
  ['a system api_error event\'s api_error field', (kind) => systemEvent('api_error', { api_error: kind }), 'a system api_error event'],
];

describe('claude-code-cli@2 — D-7: every API-error kind', () => {
  for (const [kind, cls, name] of KINDS) {
    for (const [carrier, make, where] of CARRIERS) {
      it(`V-K — ${kind} in ${carrier} → ${name}`, () => {
        const events = build();
        beforeRateLimit(events, make(kind));
        const line = at(events, isType('rate_limit_event'));
        // The refusal carries no line of its own (anthropic-messages is not edited); its category is the one reported, here none.
        expectRefused(refusalOf(events), cls, name, name === 'ProviderRefusalError' ? 'the model refused (category unstated)' : `API error "${kind}" on ${where} at line ${line}`);
      });
    }
  }

  // The likeliest 2.1.280 shape: a coarse category in `error` (the auth-failed probe's "authentication_failed") and the
  // kind in `apiError`. The coarse value must not hide the kind, at either exit.
  const BOTH_FIELD_CARRIERS: readonly [string, (kind: string) => Ev, string][] = [
    ['an assistant item\'s apiError field beside a coarse error', (kind) => apiErrorItem({ error: 'authentication_failed', apiError: kind }), 'an assistant API-error item'],
    ['a system api_error event\'s apiError field beside a coarse error', (kind) => systemEvent('api_error', { error: 'authentication_failed', apiError: kind }), 'a system api_error event'],
  ];
  for (const [kind, cls, name] of KINDS) {
    for (const [carrier, make, where] of BOTH_FIELD_CARRIERS) {
      for (const exitCode of [0, 1]) {
        it(`V-K-both — ${kind} in ${carrier}, at exit ${exitCode} → ${name}`, () => {
          const events = build();
          beforeRateLimit(events, make(kind));
          const line = at(events, isType('rate_limit_event'));
          expectRefused(refusalOf(events, { exitCode }), cls, name, name === 'ProviderRefusalError' ? 'the model refused (category unstated)' : `API error "${kind}" on ${where} at line ${line}`);
        });
      }
    }
  }

  it('V-K-unknown — an unknown kind is no kind: on an assistant item it falls through (CliExitError at exit 1, CliResultError naming the item and both fields at exit 0); on a system api_error event the walk refuses the subtype', () => {
    const item = build();
    beforeRateLimit(item, apiErrorItem({ error: 'authentication_failed' }));
    const itemLine = lineOf(item, isType('assistant'), 1);
    expectRefused(refusalOf(item, { exitCode: 1 }), CliExitError, 'CliExitError', 'exitCode 1');
    expectRefused(refusalOf(item), CliResultError, 'CliResultError', `the assistant item at line ${itemLine} is an API error (error "authentication_failed", apiError undefined, api_error undefined) although the result at line ${lineOf(item, isType('result'))} reports success`);
    const bothUnknown = build();
    beforeRateLimit(bothUnknown, apiErrorItem({ error: 'authentication_failed', apiError: 'a_kind_nobody_has_named' }));
    expectRefused(refusalOf(bothUnknown), CliResultError, 'CliResultError', `the assistant item at line ${lineOf(bothUnknown, isType('assistant'), 1)} is an API error (error "authentication_failed", apiError "a_kind_nobody_has_named", api_error undefined)`);
    const snakeUnknown = build();
    beforeRateLimit(snakeUnknown, apiErrorItem({ api_error: 'a_kind_nobody_has_named' }));
    expectRefused(refusalOf(snakeUnknown), CliResultError, 'CliResultError', `the assistant item at line ${lineOf(snakeUnknown, isType('assistant'), 1)} is an API error (error undefined, apiError undefined, api_error "a_kind_nobody_has_named")`);
    const system = build();
    afterStatus(system, systemEvent('api_error', { error: 'overloaded_error' }));
    expectRefused(refusalOf(system, { exitCode: 1 }), CliExitError, 'CliExitError', 'exitCode 1');
    expectRefused(refusalOf(system), CliStreamLifecycleError, 'CliStreamLifecycleError', 'line 3 — system subtype "api_error" is not one this adapter reads');
  });

  it('V-K-fields — a kind is read from error and from apiError alike, whichever holds it, and only on a flagged item or an api_error event', () => {
    const inApiError = build();
    beforeRateLimit(inApiError, apiErrorItem({ error: 'authentication_failed', apiError: 'model_requires_usage_credits' }));
    expectRefused(refusalOf(inApiError), CliCreditsRequiredError, 'CliCreditsRequiredError', `API error "model_requires_usage_credits" on an assistant API-error item at line ${lineOf(inApiError, isType('assistant'), 1)}`);
    const inError = build();
    beforeRateLimit(inError, apiErrorItem({ error: 'model_requires_usage_credits', apiError: 'authentication_failed' }));
    expectRefused(refusalOf(inError), CliCreditsRequiredError, 'CliCreditsRequiredError', `API error "model_requires_usage_credits" on an assistant API-error item at line ${lineOf(inError, isType('assistant'), 1)}`);
    const apiErrorWhenErrorIsNotAString = build();
    beforeRateLimit(apiErrorWhenErrorIsNotAString, apiErrorItem({ error: { type: 'invalid_request_error' }, apiError: 'model_requires_usage_credits' }));
    expectRefused(refusalOf(apiErrorWhenErrorIsNotAString), CliCreditsRequiredError, 'CliCreditsRequiredError', 'API error "model_requires_usage_credits" on an assistant API-error item');
    // A kind on an assistant item that is not flagged is not an API error; its <synthetic> model is then a substitution (V-S).
    const unflagged = build();
    beforeRateLimit(unflagged, apiErrorItem({ error: 'model_requires_usage_credits' }, false));
    expectRefused(refusalOf(unflagged), CliModelSubstitutionError, 'CliModelSubstitutionError', 'assistant message.model "<synthetic>"');
  });

  for (const exitCode of [0, 1]) {
    it(`V-K-snake — model_requires_usage_credits in a flagged item's api_error alone, at exit ${exitCode} → CliCreditsRequiredError`, () => {
      const events = build();
      beforeRateLimit(events, apiErrorItem({ api_error: 'model_requires_usage_credits' }));
      const item = events[at(events, isType('assistant'), 1)]!;
      expect([Object.hasOwn(item, 'error'), Object.hasOwn(item, 'apiError'), item['api_error']]).toEqual([false, false, 'model_requires_usage_credits']);
      const error = refusalOf(events, { exitCode });
      expectRefused(error, CliCreditsRequiredError, 'CliCreditsRequiredError', `API error "model_requires_usage_credits" on an assistant API-error item at line ${lineOf(events, isType('assistant'), 1)}`);
      expect((error as CliCreditsRequiredError).kind).toBe('model_requires_usage_credits');
    });
  }
});

// ---------------------------------------------------------------------------
// D-7 rules 6 and 7: refusal and truncation
// ---------------------------------------------------------------------------

describe('claude-code-cli@2 — refusal, carried as reported', () => {
  it('V-P1 — model_refusal_no_fallback → ProviderRefusalError carrying apiRefusalCategory and apiRefusalExplanation', () => {
    const events = build();
    afterStatus(events, systemEvent('model_refusal_no_fallback', { apiRefusalCategory: 'frontier_llm', apiRefusalExplanation: 'The request was declined' }));
    const error = refusalOf(events);
    expectRefused(error, ProviderRefusalError, 'ProviderRefusalError', 'the model refused (category frontier_llm) — The request was declined');
    expect((error as ProviderRefusalError).category).toBe('frontier_llm');
    expect((error as ProviderRefusalError).explanation).toBe('The request was declined');
  });

  it('V-P2 — a refusal on the result only, while the message ended tool_use', () => {
    const events = build();
    Object.assign(resultOf(events), { stop_reason: 'refusal', stop_details: { category: 'cyber', explanation: 'no' } });
    expect(messageDelta(events)['stop_reason']).toBe('tool_use');
    const error = refusalOf(events);
    expectRefused(error, ProviderRefusalError, 'ProviderRefusalError', 'the model refused (category cyber) — no');
    expect((error as ProviderRefusalError).category).toBe('cyber');
  });

  it('V-P3 — a refusal whose message never completes, at exit 1, is still the refusal', () => {
    const events = build();
    Object.assign(messageDelta(events), { stop_reason: 'refusal', stop_details: { category: 'frontier_llm', explanation: null } });
    events.splice(at(events, isStream('message_stop')), 1);
    expect(events.filter(isStream('message_stop'))).toHaveLength(0);
    const error = refusalOf(events, { exitCode: 1 });
    expectRefused(error, ProviderRefusalError, 'ProviderRefusalError', 'the model refused (category frontier_llm)');
    expect((error as ProviderRefusalError).explanation).toBeNull();
  });

  it('V-P4 — the category is never validated: frontier_llm and an unheard-of one are carried unchanged; none is "unstated"', () => {
    for (const category of ['frontier_llm', 'a_category_nobody_has_named']) {
      const events = build();
      Object.assign(messageDelta(events), { stop_reason: 'refusal', stop_details: { category, explanation: 'x' } });
      const error = refusalOf(events);
      expectRefused(error, ProviderRefusalError, 'ProviderRefusalError', `(category ${category})`);
      expect((error as ProviderRefusalError).category).toBe(category);
    }
    const none = build();
    messageDelta(none)['stop_reason'] = 'refusal';
    expectRefused(refusalOf(none), ProviderRefusalError, 'ProviderRefusalError', '(category unstated)');
  });

  it('V-P5 — a refusal stated on an assistant item\'s message is read too', () => {
    const events = build();
    Object.assign(assistantMessage(events), { stop_reason: 'refusal', stop_details: { category: 'frontier_llm' } });
    expectRefused(refusalOf(events), ProviderRefusalError, 'ProviderRefusalError', '(category frontier_llm)');
  });

  // apiRefusalCategory and apiRefusalExplanation are taken from 2.1.280's strings; no stream has shown them beside
  // safety_monitor_blocked, so where the CLI really puts them is a probe question.
  const SAFETY_CARRIERS: readonly [string, (fields: Ev) => Ev][] = [
    ['an assistant API-error item', (fields) => apiErrorItem(fields)],
    ['a system api_error event', (fields) => systemEvent('api_error', fields)],
  ];
  for (const [carrier, make] of SAFETY_CARRIERS) {
    it(`V-P6 — safety_monitor_blocked on ${carrier} carries apiRefusalCategory and apiRefusalExplanation as reported`, () => {
      const events = build();
      beforeRateLimit(events, make({ error: 'safety_monitor_blocked', apiRefusalCategory: 'cyber', apiRefusalExplanation: 'blocked' }));
      const error = refusalOf(events);
      expectRefused(error, ProviderRefusalError, 'ProviderRefusalError', 'the model refused (category cyber) — blocked');
      expect((error as ProviderRefusalError).category).toBe('cyber');
      expect((error as ProviderRefusalError).explanation).toBe('blocked');
    });
  }
});

describe('claude-code-cli@2 — truncation under the 64000 ceiling', () => {
  const truncated = (error: unknown): void => {
    expectRefused(error, CliOutputTruncatedError, 'CliOutputTruncatedError', "the model's output stopped at max_tokens (64000)");
    expect(error).toBeInstanceOf(ProviderOutputTruncatedError);
    expect((error as Error).message).toMatch(/64000/);
    expect((error as Error).message).not.toMatch(/16000/);
  };

  it('V-T1 — max_tokens in the tool-carrying message', () => {
    const events = build();
    messageDelta(events)['stop_reason'] = 'max_tokens';
    truncated(refusalOf(events));
  });

  it('V-T2 — max_tokens in another message, while the tool-carrying one ended tool_use', () => {
    const events = build();
    beforeRateLimit(events, ...textMessage('max_tokens'));
    expect(messageDelta(events)['stop_reason']).toBe('tool_use');
    truncated(refusalOf(events));
  });

  it('V-T3 — max_tokens on the result only', () => {
    const events = build();
    resultOf(events)['stop_reason'] = 'max_tokens';
    truncated(refusalOf(events));
  });

  it('V-T0 — positive control for the /16000/ negative: the HTTP adapter\'s class, from the same request, names 16000', () => {
    expect(new ProviderOutputTruncatedError(request()).message).toMatch(/16000/);
  });
});

// ---------------------------------------------------------------------------
// D-7 rule 8: fast mode
// ---------------------------------------------------------------------------

describe('claude-code-cli@2 — fast mode', () => {
  const cases: readonly [string, (ev: Ev[]) => void, (ev: Ev[]) => string][] = [
    ['init fast_mode_state "on" only', (ev) => { initOf(ev)['fast_mode_state'] = 'on'; }, () => 'init fast_mode_state "on" at line 1'],
    ['init fast_mode_state "cooldown" only', (ev) => { initOf(ev)['fast_mode_state'] = 'cooldown'; }, () => 'init fast_mode_state "cooldown" at line 1'],
    ['result fast_mode_state "on" only', (ev) => { resultOf(ev)['fast_mode_state'] = 'on'; }, (ev) => `result fast_mode_state "on" at line ${lineOf(ev, isType('result'))}`],
    ['result fast_mode_state "cooldown" only', (ev) => { resultOf(ev)['fast_mode_state'] = 'cooldown'; }, (ev) => `result fast_mode_state "cooldown" at line ${lineOf(ev, isType('result'))}`],
    ['speed "fast" on the result usage', (ev) => { (resultOf(ev)['usage'] as Ev)['speed'] = 'fast'; }, (ev) => `result usage.speed "fast" at line ${lineOf(ev, isType('result'))}`],
    ['speed "fast" on an assistant item\'s usage', (ev) => { (assistantMessage(ev)['usage'] as Ev)['speed'] = 'fast'; }, (ev) => `assistant message.usage.speed "fast" at line ${lineOf(ev, isType('assistant'))}`],
    ['speed "fast" on message_start\'s usage', (ev) => { ((inner(ev, at(ev, isStream('message_start')))['message'] as Ev)['usage'] as Ev)['speed'] = 'fast'; }, () => 'message_start message.usage.speed "fast" at line 3'],
    ['speed "fast" on message_delta\'s usage', (ev) => { (inner(ev, at(ev, isStream('message_delta')))['usage'] as Ev)['speed'] = 'fast'; }, (ev) => `message_delta usage.speed "fast" at line ${lineOf(ev, isStream('message_delta'))}`],
    // null is unreported only on an API-error item's usage (V-A5); on the result (V-A5) and everywhere else it is refused.
    ['speed null on an assistant item that is not an API error', (ev) => { (assistantMessage(ev)['usage'] as Ev)['speed'] = null; }, (ev) => `assistant message.usage.speed null at line ${lineOf(ev, isType('assistant'))}`],
    ['speed null on message_start\'s usage', (ev) => { ((inner(ev, at(ev, isStream('message_start')))['message'] as Ev)['usage'] as Ev)['speed'] = null; }, () => 'message_start message.usage.speed null at line 3'],
    ['speed null on message_delta\'s usage', (ev) => { (inner(ev, at(ev, isStream('message_delta')))['usage'] as Ev)['speed'] = null; }, (ev) => `message_delta usage.speed null at line ${lineOf(ev, isStream('message_delta'))}`],
  ];
  for (const [name, mutate, fragment] of cases) {
    it(`V-M — ${name} → CliFastModeError naming it and its line`, () => {
      const events = build();
      mutate(events);
      expectRefused(refusalOf(events), CliFastModeError, 'CliFastModeError', `the stream reports fast mode — ${fragment(events)}`);
    });
  }

  it('V-M-control — "off" at init and result and speed "standard" everywhere are accepted', () => {
    const events = build();
    (assistantMessage(events)['usage'] as Ev)['speed'] = 'standard';
    (inner(events, at(events, isStream('message_delta')))['usage'] as Ev)['speed'] = 'standard';
    expect(project(events)).toBe(PAYLOAD);
  });

  it('V-M-absent — fast_mode_state absent at init is CliLaunchContextError, and at the result CliResultError: presence is required, its value classified', () => {
    const atInit = build();
    delete initOf(atInit)['fast_mode_state'];
    expectRefused(refusalOf(atInit), CliLaunchContextError, 'CliLaunchContextError', 'fast_mode_state undefined (must be present) (init at line 1)');
    const atResult = build();
    delete resultOf(atResult)['fast_mode_state'];
    expectRefused(refusalOf(atResult), CliResultError, 'CliResultError', `fast_mode_state undefined at line ${lineOf(atResult, isType('result'))} (must be present)`);
  });

  it('V-M-unknown-control — "off" at init and at the result (the builder) is accepted', () => {
    const control = build();
    expect([initOf(control)['fast_mode_state'], resultOf(control)['fast_mode_state']]).toEqual(['off', 'off']);
    expect(project(control)).toBe(PAYLOAD);
  });

  it('V-M-unknown-init — fast_mode_state "enabled", which no rule classifies, at init only → CliLaunchContextError naming it', () => {
    const atInit = build();
    initOf(atInit)['fast_mode_state'] = 'enabled';
    expect(resultOf(atInit)['fast_mode_state']).toBe('off');
    expectRefused(refusalOf(atInit), CliLaunchContextError, 'CliLaunchContextError', 'fast_mode_state "enabled" (must be "off") (init at line 1)');
  });

  it('V-M-unknown-result — fast_mode_state "enabled", which no rule classifies, at the result only → CliResultError naming it and its line', () => {
    const atResult = build();
    resultOf(atResult)['fast_mode_state'] = 'enabled';
    expect(initOf(atResult)['fast_mode_state']).toBe('off');
    expectRefused(refusalOf(atResult), CliResultError, 'CliResultError', `fast_mode_state "enabled" at line ${lineOf(atResult, isType('result'))} (must be "off")`);
  });

  // Review repair S4, a parent decision: "off" is an allowlist of one exact value, not a denylist of the unknown ones.
  it('V-M-unknown-init-case — fast_mode_state "OFF" at init only → CliLaunchContextError naming it', () => {
    const atInit = build();
    initOf(atInit)['fast_mode_state'] = 'OFF';
    expect(resultOf(atInit)['fast_mode_state']).toBe('off');
    expectRefused(refusalOf(atInit), CliLaunchContextError, 'CliLaunchContextError', 'fast_mode_state "OFF" (must be "off") (init at line 1)');
  });

  it('V-M-unknown-result-case — fast_mode_state "OFF" at the result only → CliResultError naming it and its line', () => {
    const atResult = build();
    resultOf(atResult)['fast_mode_state'] = 'OFF';
    expect(initOf(atResult)['fast_mode_state']).toBe('off');
    expectRefused(refusalOf(atResult), CliResultError, 'CliResultError', `fast_mode_state "OFF" at line ${lineOf(atResult, isType('result'))} (must be "off")`);
  });
});

// ---------------------------------------------------------------------------
// D-8: launch context, result, walk allowlists, stop reasons
// ---------------------------------------------------------------------------

describe('claude-code-cli@2 — D-8 launch context', () => {
  const cases: readonly [string, Ev, string][] = [
    ['permissionMode "acceptEdits"', { permissionMode: 'acceptEdits' }, 'permissionMode "acceptEdits" (must be "default") (init at line 1)'],
    ['permissionMode absent', { permissionMode: undefined }, 'permissionMode undefined (must be "default") (init at line 1)'],
    ['another CLI version (2.1.226, @1\'s pin)', { claude_code_version: '2.1.226' }, 'claude_code_version "2.1.226" (must be "2.1.280", the pin\'s) (init at line 1)'],
    ['another CLI version (2.1.281)', { claude_code_version: '2.1.281' }, 'claude_code_version "2.1.281" (must be "2.1.280", the pin\'s) (init at line 1)'],
    ['apiKeySource other than none', { apiKeySource: 'ANTHROPIC_API_KEY' }, 'apiKeySource "ANTHROPIC_API_KEY" (must be "none") (init at line 1)'],
    ['an extra tool', { tools: ['StructuredOutput', 'Bash'] }, 'tools ["StructuredOutput","Bash"] (must be exactly ["StructuredOutput"]) (init at line 1)'],
    ['an MCP server', { mcp_servers: [{ name: 'x' }] }, 'mcp_servers [{"name":"x"}] (must be empty) (init at line 1)'],
  ];
  for (const [name, over, fragment] of cases) {
    it(`V-C — ${name} → CliLaunchContextError naming it`, () => {
      const events = build();
      Object.assign(initOf(events), over);
      for (const [key, value] of Object.entries(over)) if (value === undefined) delete initOf(events)[key];
      expectRefused(refusalOf(events), CliLaunchContextError, 'CliLaunchContextError', fragment);
    });
  }
});

describe('claude-code-cli@2 — D-8 result', () => {
  const cases: readonly [string, (ev: Ev[]) => void, (ev: Ev[]) => string][] = [
    ['terminal_reason "max_turns"', (ev) => { resultOf(ev)['terminal_reason'] = 'max_turns'; }, (ev) => `terminal_reason "max_turns" at line ${lineOf(ev, isType('result'))} (must be "completed")`],
    ['terminal_reason absent', (ev) => { delete resultOf(ev)['terminal_reason']; }, (ev) => `terminal_reason undefined at line ${lineOf(ev, isType('result'))} (must be "completed")`],
    ['is_error true', (ev) => { resultOf(ev)['is_error'] = true; }, (ev) => `is_error true at line ${lineOf(ev, isType('result'))} (subtype "success" alone is not success)`],
    ['subtype not success', (ev) => { resultOf(ev)['subtype'] = 'error_during_execution'; }, (ev) => `subtype "error_during_execution" at line ${lineOf(ev, isType('result'))}`],
    ['structured_output absent', (ev) => { delete resultOf(ev)['structured_output']; }, (ev) => `structured_output is absent at line ${lineOf(ev, isType('result'))}`],
    ['no result', (ev) => { ev.splice(at(ev, isType('result')), 1); }, () => 'no result event arrived'],
    // The trailing event is one the walk reads on its own terms (V-W-subtype-control), so only the result's position is
    // wrong (review repair S3, a parent decision, re-pointed this case: an empty user event, its old trailer, is now
    // refused by the walk).
    ['a result that is not the last event', (ev) => { ev.push(systemEvent('thinking_tokens', { tokens: 0 })); }, (ev) => `the result at line ${lineOf(ev, isType('result'))} is not the last event (line ${ev.length})`],
  ];
  for (const [name, mutate, fragment] of cases) {
    it(`V-Z — ${name} → CliResultError naming it`, () => {
      const events = build();
      mutate(events);
      expectRefused(refusalOf(events), CliResultError, 'CliResultError', fragment(events));
    });
  }

  // Review repair S1, a parent decision: the result's stop reason is read by an allowlist. "refusal" and "max_tokens"
  // are classified before this step; anything else but "tool_use" or "end_turn", including absence, is refused.
  const STOPS: readonly [string, unknown][] = [['"pause_turn"', 'pause_turn'], ['"model_context_window_exceeded"', 'model_context_window_exceeded'], ['"stop_sequence"', 'stop_sequence'], ['null', null], ['absent', undefined]];
  for (const [name, value] of STOPS) {
    it(`V-Z-stop — result stop_reason ${name} → CliResultError naming it and the result line`, () => {
      const events = build();
      if (value === undefined) delete resultOf(events)['stop_reason'];
      else resultOf(events)['stop_reason'] = value;
      expectRefused(refusalOf(events), CliResultError, 'CliResultError', `stop_reason ${name === 'absent' ? 'undefined' : name} at line ${lineOf(events, isType('result'))} (must be "tool_use" or "end_turn")`);
    });
  }

  // Re-pointed by review repair U5, a parent decision: "end_turn" on the result is accepted only where the last message
  // ended "end_turn", so the control carries a second message ending so (the builder's one message ends "tool_use",
  // V-Z-stop-tied).
  it('V-Z-stop-control — result stop_reason "tool_use" (the builder) is accepted, and so is "end_turn" after a last message ending "end_turn"', () => {
    const events = build();
    expect(resultOf(events)['stop_reason']).toBe('tool_use');
    expect(project(events)).toBe(PAYLOAD);
    const endTurn = build();
    beforeRateLimit(endTurn, ...textMessage('end_turn'));
    resultOf(endTurn)['stop_reason'] = 'end_turn';
    expect(project(endTurn)).toBe(PAYLOAD);
  });

  // Review repair U5, a parent decision under D-8's "Unknown means refused": the result's stop reason is the last
  // completed message's. A result stating a turn end no streamed message shows points to a request the stream did not
  // carry. Whether 2.1.280's result always restates the last message's stop reason is a probe question.
  it('V-Z-stop-tied — result stop_reason "end_turn" while the only message ended "tool_use" → CliResultError naming both values and lines', () => {
    const events = build();
    resultOf(events)['stop_reason'] = 'end_turn';
    expect(messageDelta(events)['stop_reason']).toBe('tool_use');
    expectRefused(refusalOf(events), CliResultError, 'CliResultError', `stop_reason "end_turn" at line ${lineOf(events, isType('result'))} differs from the last completed message's, which started at line 3 and ended with stop_reason "tool_use"`);
  });

  it('V-Z-stop-tied-last — two messages, the last ending "end_turn", with result "tool_use" → CliResultError naming the last message\'s line', () => {
    const events = build();
    beforeRateLimit(events, ...textMessage('end_turn'));
    expectRefused(refusalOf(events), CliResultError, 'CliResultError', `stop_reason "tool_use" at line ${lineOf(events, isType('result'))} differs from the last completed message's, which started at line ${lineOf(events, isStream('message_start'), 1)} and ended with stop_reason "end_turn"`);
  });

  it('V-Z-stop-tied-none — a result claiming success where no message completed at all → CliResultError naming the absence', () => {
    const events = build().filter((e) => e['type'] !== 'stream_event' && e['type'] !== 'assistant' && e['type'] !== 'user');
    expect(events.map((e) => e['type'])).toEqual(['system', 'system', 'system', 'rate_limit_event', 'result']);
    expectRefused(refusalOf(events), CliResultError, 'CliResultError', `stop_reason "tool_use" at line ${lineOf(events, isType('result'))}, but no message completed in the stream`);
  });

  it('V-Z-stop-tied-control — result "tool_use" with the builder, and a two-message stream whose last message ends "end_turn" with result "end_turn", are accepted', () => {
    expect(project(build())).toBe(PAYLOAD);
    const events = build();
    beforeRateLimit(events, ...textMessage('end_turn'));
    resultOf(events)['stop_reason'] = 'end_turn';
    expect(events.filter(isStream('message_start'))).toHaveLength(2);
    expect(events.filter(isType('user'))).toHaveLength(1);
    expect(project(events)).toBe(PAYLOAD);
  });

  // Review repair U4, a parent decision under D-8's "Unknown means refused": both probes' results carry
  // api_error_status null. A success result reporting an API error status is the success-after-an-API-error shape the
  // result step already refuses on a flagged item. Which values 2.1.280 writes here is a probe question.
  it('V-Z-api-error-status — api_error_status 429 on an otherwise clean success → CliResultError naming the value and the result line', () => {
    const events = build();
    resultOf(events)['api_error_status'] = 429;
    expectRefused(refusalOf(events), CliResultError, 'CliResultError', `api_error_status 429 at line ${lineOf(events, isType('result'))} (must be absent or null)`);
  });

  it('V-Z-api-error-status-control — api_error_status null (both probes\' value) and absent (the builder) are accepted', () => {
    const absent = build();
    expect(Object.hasOwn(resultOf(absent), 'api_error_status')).toBe(false);
    expect(project(absent)).toBe(PAYLOAD);
    const nulled = build();
    resultOf(nulled)['api_error_status'] = null;
    expect(project(nulled)).toBe(PAYLOAD);
  });
});

describe('claude-code-cli@2 — D-8 walk allowlists', () => {
  const SUBTYPES = ['api_retry', 'compact_boundary', 'cloud_session_delta', 'cloud_session_status', 'dev_intent', 'peer_message_hold', 'tool_host_result', 'turn_handoff_available', 'turn_preempted', 'a_subtype_from_the_future'];
  for (const subtype of SUBTYPES) {
    it(`V-W — system subtype ${subtype} → CliStreamLifecycleError naming it and its line`, () => {
      const events = build();
      afterStatus(events, systemEvent(subtype));
      expectRefused(refusalOf(events), CliStreamLifecycleError, 'CliStreamLifecycleError', `line 3 — system subtype "${subtype}" is not one this adapter reads (init, status, thinking_tokens)`);
    });
  }

  it('V-W-subtype-control — init, status and thinking_tokens are read (the builder carries all three); a system event with no subtype is refused', () => {
    const events = build();
    expect(['init', 'status', 'thinking_tokens'].map((s) => events.filter(isSystem(s)).length)).toEqual([1, 1, 1]);
    afterStatus(events, systemEvent('status', { status: 'requesting' }), systemEvent('thinking_tokens', { tokens: 7 }));
    expect(project(events)).toBe(PAYLOAD);
    const none = build();
    afterStatus(none, { type: 'system', ...META });
    expectRefused(refusalOf(none), CliStreamLifecycleError, 'CliStreamLifecycleError', 'line 3 — system subtype undefined is not one this adapter reads');
  });

  it('V-W-status-control — a status event reads "requesting", the one value either probe showed (the builder carries it)', () => {
    const events = build();
    expect(events.filter(isSystem('status')).map((e) => e['status'])).toEqual(['requesting']);
    expect(project(events)).toBe(PAYLOAD);
  });

  it('V-W-status-compacting — a status event with status "compacting" → CliStreamLifecycleError naming the value and the line', () => {
    const compacting = build();
    afterStatus(compacting, systemEvent('status', { status: 'compacting' }));
    expectRefused(refusalOf(compacting), CliStreamLifecycleError, 'CliStreamLifecycleError', 'line 3 — a system status event with status "compacting", which this adapter does not read ("requesting")');
  });

  it('V-W-status-missing — a status event with no status → CliStreamLifecycleError naming its absence and the line', () => {
    const missing = build();
    afterStatus(missing, systemEvent('status'));
    expectRefused(refusalOf(missing), CliStreamLifecycleError, 'CliStreamLifecycleError', 'line 3 — a system status event with status undefined, which this adapter does not read ("requesting")');
  });

  const userContent = (ev: Ev[]): unknown => (ev[at(ev, isType('user'))]!['message'] as Ev)['content'];

  it('V-W-user-control — a user event carrying the one tool_result (the builder) is read', () => {
    const events = build();
    expect(userContent(events)).toEqual([{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'Structured output provided successfully' }]);
    expect(project(events)).toBe(PAYLOAD);
  });

  it('V-W-user-text — the builder\'s user event plus an injected text item → CliStreamLifecycleError naming the item type and the line', () => {
    const injected = build();
    (userContent(injected) as Ev[]).push({ type: 'text', text: 'continue' });
    expectRefused(refusalOf(injected), CliStreamLifecycleError, 'CliStreamLifecycleError', `line ${lineOf(injected, isType('user'))} — a user content item of type "text", which this adapter does not read (tool_result)`);
  });

  it('V-W-user-string — a user event whose content is a string, not an item list → CliStreamLifecycleError naming it and the line', () => {
    const text = build();
    (text[at(text, isType('user'))]!['message'] as Ev)['content'] = 'continue';
    expectRefused(refusalOf(text), CliStreamLifecycleError, 'CliStreamLifecycleError', `line ${lineOf(text, isType('user'))} — a user event whose message.content is a string, not an array of tool_result items`);
  });

  // Review repair S3, a parent decision: an item list with no item carries no tool_result, so it is not read as allowed.
  it('V-W-user-empty — a second user event whose content is an empty array → CliStreamLifecycleError naming the line', () => {
    const empty = build();
    empty.splice(at(empty, isType('user')) + 1, 0, { type: 'user', message: { role: 'user', content: [] }, parent_tool_use_id: null, ...META });
    expect(empty.filter(isType('user'))).toHaveLength(2);
    expectRefused(refusalOf(empty), CliStreamLifecycleError, 'CliStreamLifecycleError', `line ${lineOf(empty, isType('user'), 1)} — a user event whose message.content is an empty array, which carries no tool_result item`);
  });

  // Review repair S4, a parent decision: the user allowlist is tool_result only, not a denylist of text.
  it('V-W-user-image — an image item beside the tool_result → CliStreamLifecycleError naming its type and the line', () => {
    const image = build();
    (userContent(image) as unknown[]).push({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'x' } });
    expectRefused(refusalOf(image), CliStreamLifecycleError, 'CliStreamLifecycleError', `line ${lineOf(image, isType('user'))} — a user content item of type "image", which this adapter does not read (tool_result)`);
  });

  it('V-W-user-bare-string — a bare string item "continue" inside the content array → CliStreamLifecycleError naming type undefined and the line', () => {
    const bare = build();
    (userContent(bare) as unknown[]).push('continue');
    expectRefused(refusalOf(bare), CliStreamLifecycleError, 'CliStreamLifecycleError', `line ${lineOf(bare, isType('user'))} — a user content item of type undefined, which this adapter does not read (tool_result)`);
  });

  it('V-W-block — a server_tool_use block → CliStreamLifecycleError naming it; text, thinking, redacted_thinking and tool_use blocks are read', () => {
    const events = build();
    events.splice(at(events, isStream('content_block_stop')) + 1, 0, se('content_block_start', { index: 1, content_block: { type: 'server_tool_use', id: 'srvtoolu_1', name: 'web_search', input: {} } }), se('content_block_stop', { index: 1 }));
    expectRefused(refusalOf(events), CliStreamLifecycleError, 'CliStreamLifecycleError', `line ${lineOf(events, isBlockStart('server_tool_use'))} — a content_block_start of type "server_tool_use", which this adapter does not read`);
    expect(project(build(['thinking', 'redacted_thinking', 'text']))).toBe(PAYLOAD);
  });

  it('V-W-item — an unknown assistant item → CliStreamLifecycleError naming it; text, thinking and redacted_thinking items are read', () => {
    const events = build();
    (assistantMessage(events)['content'] as Ev[]).push({ type: 'server_tool_use', id: 'srvtoolu_1', name: 'web_search', input: {} });
    expectRefused(refusalOf(events), CliStreamLifecycleError, 'CliStreamLifecycleError', `line ${lineOf(events, isType('assistant'))} — an assistant content item of type "server_tool_use", which this adapter does not read`);
    const control = build();
    (assistantMessage(control)['content'] as Ev[]).unshift({ type: 'thinking', thinking: 'x', signature: 's' }, { type: 'redacted_thinking', data: 'opaque' }, { type: 'text', text: 'Here.' });
    expect(project(control)).toBe(PAYLOAD);
    const noContent = build();
    delete assistantMessage(noContent)['content'];
    expectRefused(refusalOf(noContent), CliStreamLifecycleError, 'CliStreamLifecycleError', `line ${lineOf(noContent, isType('assistant'))} — an assistant event without a content array`);
  });

  /** A second assistant item answering as the requested model, with one text item: the S6 shape when `fields` names an error. */
  const plainItem = (fields: Ev = {}): Ev => ({
    type: 'assistant',
    ...fields,
    message: { id: 'msg_x', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [{ type: 'text', text: 'x' }], stop_reason: null, usage: usage() },
    parent_tool_use_id: null,
    ...META,
  });

  // Review repair S6, a parent decision: an error kind on an item not flagged as an API error is read neither as an API
  // error (only flagged items are) nor as a model's answer; it is refused by the walk.
  for (const field of ['error', 'apiError', 'api_error']) {
    it(`V-W-item-error — an assistant item carrying ${field} "model_requires_usage_credits" without is_api_error_message → CliStreamLifecycleError naming the field and the line`, () => {
      const events = build();
      beforeRateLimit(events, plainItem({ [field]: 'model_requires_usage_credits' }));
      expectRefused(refusalOf(events), CliStreamLifecycleError, 'CliStreamLifecycleError', `line ${lineOf(events, isType('assistant'), 1)} — an assistant event carrying ${field} "model_requires_usage_credits" without is_api_error_message true`);
    });
  }

  it('V-W-item-error-control — the builder\'s assistant item carries no error field and is read; so is the same second item without one', () => {
    const events = build();
    expect(['error', 'apiError', 'api_error'].filter((key) => Object.hasOwn(events[at(events, isType('assistant'))]!, key))).toEqual([]);
    expect(project(events)).toBe(PAYLOAD);
    const second = build();
    beforeRateLimit(second, plainItem());
    expect(second.filter(isType('assistant'))).toHaveLength(2);
    expect(project(second)).toBe(PAYLOAD);
  });

  // Review repair S1, a parent decision: an assistant item's stop reason is read by an allowlist too. A flagged
  // API-error item is exempt (its "stop_sequence" is the auth-failed probe's own), and is refused by the result step.
  // One case per `it` (review repair U7, a parent decision), so that each is seen failing on its own.
  it('V-W-item-stop — an assistant item whose message.stop_reason is "pause_turn" → CliStreamLifecycleError naming the value and the line', () => {
    const events = build();
    assistantMessage(events)['stop_reason'] = 'pause_turn';
    expectRefused(refusalOf(events), CliStreamLifecycleError, 'CliStreamLifecycleError', `line ${lineOf(events, isType('assistant'))} — an assistant event whose message.stop_reason is "pause_turn", which this adapter does not read (null, "tool_use", "end_turn")`);
  });

  it('V-W-item-stop-absent — an assistant item with no message.stop_reason at all → CliStreamLifecycleError naming its absence and the line: absent is not null', () => {
    const absent = build();
    delete assistantMessage(absent)['stop_reason'];
    expect(Object.hasOwn(assistantMessage(absent), 'stop_reason')).toBe(false);
    expectRefused(refusalOf(absent), CliStreamLifecycleError, 'CliStreamLifecycleError', `line ${lineOf(absent, isType('assistant'))} — an assistant event whose message.stop_reason is undefined`);
  });

  it('V-W-item-stop-sequence — an unflagged second item whose message.stop_reason is "stop_sequence" → CliStreamLifecycleError naming the value and the line', () => {
    const sequence = build();
    beforeRateLimit(sequence, plainItem());
    (sequence[at(sequence, isType('assistant'), 1)]!['message'] as Ev)['stop_reason'] = 'stop_sequence';
    expect(sequence[at(sequence, isType('assistant'), 1)]!['is_api_error_message']).toBeUndefined();
    expectRefused(refusalOf(sequence), CliStreamLifecycleError, 'CliStreamLifecycleError', `line ${lineOf(sequence, isType('assistant'), 1)} — an assistant event whose message.stop_reason is "stop_sequence"`);
  });

  // Review repair U6, a parent decision under D-8's "Unknown means refused", as S3 decided for user events: an item
  // list with no item at all carries nothing this adapter reads. Whether 2.1.280 writes one is a probe question.
  it('V-W-item-empty — a second assistant item whose message.content is an empty array → CliStreamLifecycleError naming the line', () => {
    const events = build();
    const item = plainItem();
    (item['message'] as Ev)['content'] = [];
    beforeRateLimit(events, item);
    expectRefused(refusalOf(events), CliStreamLifecycleError, 'CliStreamLifecycleError', `line ${lineOf(events, isType('assistant'), 1)} — an assistant event whose message.content is an empty array, which carries no item`);
  });

  it('V-W-item-empty-control — the same second item carrying one text item is read', () => {
    const events = build();
    beforeRateLimit(events, plainItem());
    expect((events[at(events, isType('assistant'), 1)]!['message'] as Ev)['content']).toEqual([{ type: 'text', text: 'x' }]);
    expect(project(events)).toBe(PAYLOAD);
  });

  // Review repair U3, a parent decision under D-8's "Unknown means refused": an error, apiError or api_error key, of any
  // value, is read only on a flagged assistant API-error item and on a system api_error event. On any other event it is
  // read neither as an API error nor as a success, so the walk refuses it. Whether 2.1.280 writes one is a probe question.
  const U3_CASES: readonly [string, (ev: Ev[]) => number, string][] = [
    ['a result event carrying apiError "model_requires_usage_credits"', (ev) => { resultOf(ev)['apiError'] = 'model_requires_usage_credits'; return lineOf(ev, isType('result')); }, 'a result event carrying apiError "model_requires_usage_credits"'],
    ['a user event carrying error "x"', (ev) => { ev[at(ev, isType('user'))]!['error'] = 'x'; return lineOf(ev, isType('user')); }, 'a user event carrying error "x"'],
    ['a stream_event carrying api_error {}', (ev) => { ev[at(ev, isStream('message_delta'))]!['api_error'] = {}; return lineOf(ev, isStream('message_delta')); }, 'a stream_event carrying api_error {}'],
    ['an unflagged assistant item carrying error {"kind":"x"}', (ev) => { beforeRateLimit(ev, plainItem({ error: { kind: 'x' } })); return lineOf(ev, isType('assistant'), 1); }, 'an assistant event carrying error {"kind":"x"} without is_api_error_message true'],
    // The exemption's other direction: it is for a system event of subtype api_error, not for every system event, and
    // not for a rate-limit event. The builder's own status event ("requesting", a subtype the walk reads) and its own
    // rate-limit event (compliant) each carry the key here and nothing else.
    [
      'a system status event ("requesting") carrying error "x"',
      (ev) => { const i = at(ev, isSystem('status')); expect(ev[i]!['status']).toBe('requesting'); ev[i]!['error'] = 'x'; return i + 1; },
      'a system event carrying error "x", which only a flagged assistant API-error item or a system api_error event may carry',
    ],
    [
      'a rate_limit_event carrying apiError "x"',
      (ev) => { ev[at(ev, isType('rate_limit_event'))]!['apiError'] = 'x'; return lineOf(ev, isType('rate_limit_event')); },
      'a rate_limit_event carrying apiError "x", which only a flagged assistant API-error item or a system api_error event may carry',
    ],
  ];
  for (const [name, mutate, fragment] of U3_CASES) {
    it(`V-W-error-key — ${name}, at exit 0 → CliStreamLifecycleError naming the key and the line`, () => {
      const events = build();
      const line = mutate(events);
      expectRefused(refusalOf(events), CliStreamLifecycleError, 'CliStreamLifecycleError', `line ${line} — ${fragment}`);
    });
  }

  it('V-W-error-key-control — the builder carries none of the three keys and is read; the walk still lets a flagged item and a system api_error event carry one', () => {
    const events = build();
    expect(events.filter((e) => ['error', 'apiError', 'api_error'].some((key) => Object.hasOwn(e, key)))).toEqual([]);
    expect(project(events)).toBe(PAYLOAD);
    // A flagged item with a kind no rule names passes the walk and is refused by the result step, not by the key.
    const flagged = build();
    beforeRateLimit(flagged, apiErrorItem({ error: 'authentication_failed', apiError: { detail: 'x' } }));
    expectRefused(refusalOf(flagged), CliResultError, 'CliResultError', `the assistant item at line ${lineOf(flagged, isType('assistant'), 1)} is an API error (error "authentication_failed", apiError {"detail":"x"}, api_error undefined)`);
    // A system api_error event with an unknown kind is refused by its subtype, not by the key.
    const system = build();
    afterStatus(system, systemEvent('api_error', { error: 'overloaded_error' }));
    expectRefused(refusalOf(system), CliStreamLifecycleError, 'CliStreamLifecycleError', 'line 3 — system subtype "api_error" is not one this adapter reads');
  });

  // The positive side of the two cases above that carry the key on the builder's status and rate-limit events. A known
  // kind on a system api_error event is classified before the walk runs, so this shows the key is still read there as
  // a kind; that the walk itself exempts such an event is shown above, where an unknown kind is refused by its subtype
  // and not by the key.
  it('V-W-error-key-exempt-control — a system api_error event carrying a known kind in error is classified as before (CliCreditsRequiredError naming the carrier and line); the builder\'s status and rate-limit events, without the key, are read', () => {
    const events = build();
    expect([events[at(events, isSystem('status'))]!, events[at(events, isType('rate_limit_event'))]!].map((e) => ['error', 'apiError', 'api_error'].filter((key) => Object.hasOwn(e, key)))).toEqual([[], []]);
    expect(project(events)).toBe(PAYLOAD);
    const known = build();
    afterStatus(known, systemEvent('api_error', { error: 'model_requires_usage_credits' }));
    expectRefused(refusalOf(known), CliCreditsRequiredError, 'CliCreditsRequiredError', 'API error "model_requires_usage_credits" on a system api_error event at line 3');
  });

  it('V-W-item-stop-control — null (the builder), "tool_use" and "end_turn" are read; a flagged API-error item\'s "stop_sequence" is not read here', () => {
    const events = build();
    expect(assistantMessage(events)['stop_reason']).toBeNull();
    expect(project(events)).toBe(PAYLOAD);
    for (const stop of ['tool_use', 'end_turn']) {
      const read = build();
      assistantMessage(read)['stop_reason'] = stop;
      expect(project(read)).toBe(PAYLOAD);
    }
    const flagged = build();
    beforeRateLimit(flagged, apiErrorItem({ error: 'authentication_failed' }));
    expect((flagged[at(flagged, isType('assistant'), 1)]!['message'] as Ev)['stop_reason']).toBe('stop_sequence');
    expectRefused(refusalOf(flagged), CliResultError, 'CliResultError', `the assistant item at line ${lineOf(flagged, isType('assistant'), 1)} is an API error`);
  });

  it('V-W-delta — an unknown thinking delta → CliStreamLifecycleError naming it; thinking_delta and signature_delta are read', () => {
    const events = build(['thinking']);
    const i = at(events, isStream('content_block_delta'), 1);
    (inner(events, i)['delta'] as Ev)['type'] = 'thinking_summary_delta';
    expectRefused(refusalOf(events), CliStreamLifecycleError, 'CliStreamLifecycleError', `line ${i + 1} — delta type "thinking_summary_delta" does not match block type "thinking" at index 0`);
    expect(project(build(['thinking']))).toBe(PAYLOAD);
  });

  it('V-W-lifecycle — @1\'s lifecycle rules still hold: a message left open, and a message_start inside an open message', () => {
    const open = build();
    open.splice(at(open, isStream('message_stop')), 1);
    expectRefused(refusalOf(open), CliStreamLifecycleError, 'CliStreamLifecycleError', 'end of stream — the stream ended while the message from line 3 is open');
    const nested = build();
    nested.splice(at(nested, isStream('content_block_start')), 0, se('message_start', { message: { model: 'claude-opus-5-5' } }));
    expectRefused(refusalOf(nested), CliStreamLifecycleError, 'CliStreamLifecycleError', 'line 4 — message_start while the message from line 3 is open');
  });
});

describe('claude-code-cli@2 — D-8 stop reasons', () => {
  // Re-pointed by review repair U5, a parent decision: the result's stop reason must be the last completed message's,
  // and the result's allowlist admits only "tool_use" and "end_turn", so a last message ending anything else is refused
  // at the result step first (V-O5). The message under test is therefore not the last one: it comes before the call's
  // message (V-O1, V-O2), or after it with a later message ending the stream (V-O4), or, for the call's own message,
  // the result or a later message agrees (V-O3).
  it('V-O1 — a non-tool message ending pause_turn, before the call\'s message → CliStopReasonError naming the message\'s line', () => {
    const events = build();
    afterStatus(events, ...textMessage('pause_turn'));
    expect(lineOf(events, isStream('message_start'))).toBe(3);
    expectRefused(refusalOf(events), CliStopReasonError, 'CliStopReasonError', 'the message started at line 3, which carries no StructuredOutput call, ended with stop_reason "pause_turn" rather than "tool_use" or "end_turn"');
  });

  it('V-O2 — a non-tool message ending end_turn or tool_use is accepted; one ending stop_sequence is refused', () => {
    for (const stop of ['end_turn', 'tool_use']) {
      const events = build();
      beforeRateLimit(events, ...textMessage(stop));
      resultOf(events)['stop_reason'] = stop;
      expect(project(events)).toBe(PAYLOAD);
    }
    const sequence = build();
    afterStatus(sequence, ...textMessage('stop_sequence'));
    expectRefused(refusalOf(sequence), CliStopReasonError, 'CliStopReasonError', 'the message started at line 3, which carries no StructuredOutput call, ended with stop_reason "stop_sequence"');
  });

  it('V-O3 — the tool-carrying message ending end_turn → CliStopReasonError naming it as the call\'s message', () => {
    const events = build();
    messageDelta(events)['stop_reason'] = 'end_turn';
    resultOf(events)['stop_reason'] = 'end_turn';
    expectRefused(refusalOf(events), CliStopReasonError, 'CliStopReasonError', 'the message started at line 3, which carries the StructuredOutput call, ended with stop_reason "end_turn" rather than "tool_use"');
    // null is outside the result's allowlist, so the call's message ending null is followed by a message that ends
    // "end_turn", which the result restates.
    const nulled = build();
    messageDelta(nulled)['stop_reason'] = null;
    beforeRateLimit(nulled, ...textMessage('end_turn'));
    resultOf(nulled)['stop_reason'] = 'end_turn';
    expectRefused(refusalOf(nulled), CliStopReasonError, 'CliStopReasonError', 'the message started at line 3, which carries the StructuredOutput call, ended with stop_reason null rather than "tool_use"');
  });

  // Every message is read, not only those up to the call's: a message after the call's that is not the last one reaches
  // this step, where only the stop-reason check can refuse it (the result's tie reads only the last message). Three
  // completed messages: the call's (tool_use), a non-call message, and a last non-call message ending end_turn, which
  // the result restates; the tool loop is the builder's own.
  const threeMessages = (middle: string): Ev[] => {
    const events = build();
    beforeRateLimit(events, ...textMessage(middle), ...textMessage('end_turn'));
    resultOf(events)['stop_reason'] = 'end_turn';
    expect(events.filter(isStream('message_start'))).toHaveLength(3);
    expect(events.filter(isStream('message_delta')).map((e) => ((e['event'] as Ev)['delta'] as Ev)['stop_reason'])).toEqual(['tool_use', middle, 'end_turn']);
    expect(events.filter(isType('user'))).toHaveLength(1);
    return events;
  };

  it('V-O4 — a non-call message ending pause_turn after the call\'s message, followed by a last message ending end_turn → CliStopReasonError naming the middle message\'s line', () => {
    const events = threeMessages('pause_turn');
    const middle = lineOf(events, isStream('message_start'), 1);
    expect(middle).toBeGreaterThan(lineOf(events, isBlockStart('tool_use')));
    expectRefused(refusalOf(events), CliStopReasonError, 'CliStopReasonError', `the message started at line ${middle}, which carries no StructuredOutput call, ended with stop_reason "pause_turn" rather than "tool_use" or "end_turn"`);
  });

  it('V-O4-control — the same three messages with the middle one ending end_turn are accepted', () => {
    expect(project(threeMessages('end_turn'))).toBe(PAYLOAD);
  });

  // What @2 answers on the G8 shape 'stop_reason "pause_turn" in a second, non-tool message': that message is the last,
  // so the result's tie to the last message's stop reason refuses it (review repair U5, a parent decision), before the
  // stop-reason check would.
  it('V-O5 — a second, non-call message ending pause_turn as the last message, the result saying tool_use → CliResultError naming both values and the message\'s line', () => {
    const events = build();
    beforeRateLimit(events, ...textMessage('pause_turn'));
    expect(resultOf(events)['stop_reason']).toBe('tool_use');
    expectRefused(refusalOf(events), CliResultError, 'CliResultError', `stop_reason "tool_use" at line ${lineOf(events, isType('result'))} differs from the last completed message's, which started at line ${lineOf(events, isStream('message_start'), 1)} and ended with stop_reason "pause_turn"`);
  });
});

describe('claude-code-cli@2 — the one call, the tool loop and the output, as @1 reads them', () => {
  it('V-N — no tool call, a Bash call, and a result that restates another answer are refused by @1\'s classes', () => {
    const none = build(['text']);
    const start = at(none, isBlockStart('tool_use'));
    none.splice(start, at(none, isStream('content_block_stop'), 1) - start + 1);
    expectRefused(refusalOf(none), CliNoStructuredOutputError, 'CliNoStructuredOutputError', 'carries no completed StructuredOutput tool call');
    const bash = build();
    ((inner(bash, at(bash, isBlockStart('tool_use')))['content_block']) as Ev)['name'] = 'Bash';
    expectRefused(refusalOf(bash), CliUnexpectedToolCallError, 'CliUnexpectedToolCallError', `"Bash" at line ${lineOf(bash, isBlockStart('tool_use'))}`);
    // @1's checkOutput, which @2 shares and which stays byte-identical, names no line for the result's restatement, so @2
    // compares the result's restatement itself first and names the result's line (review repair S8, a parent decision);
    // the assistant's restatement is named by its line in @1's words.
    const conflict = build();
    resultOf(conflict)['structured_output'] = { token: 'DS-SYNTH-002', sum: 5 };
    expectRefused(refusalOf(conflict), CliOutputConflictError, 'CliOutputConflictError', `result.structured_output at line ${lineOf(conflict, isType('result'))} differs from the concatenated deltas`);
    const restated = build();
    ((assistantMessage(restated)['content'] as Ev[])[0]!)['input'] = { token: 'DS-SYNTH-002', sum: 5 };
    expectRefused(refusalOf(restated), CliOutputConflictError, 'CliOutputConflictError', `the assistant message at line ${lineOf(restated, isType('assistant'))} states a tool_use.input that differs from the concatenated deltas`);
  });
});

// ---------------------------------------------------------------------------
// Controls: exit and malformed lines, and D-8's order
// ---------------------------------------------------------------------------

describe('claude-code-cli@2 — exit and malformed-line controls', () => {
  it('V-E1 — a clean stream at exit 1, under SIGTERM, and at exit 0 with SIGKILL → CliExitError naming each', () => {
    expectRefused(refusalOf(build(), { exitCode: 1 }), CliExitError, 'CliExitError', 'exitCode 1, signal null, 0 stderr bytes');
    expectRefused(refusalOf(build(), { exitCode: null, signal: 'SIGTERM' }), CliExitError, 'CliExitError', 'exitCode null, signal SIGTERM');
    expectRefused(refusalOf(build(), { exitCode: 0, signal: 'SIGKILL' }), CliExitError, 'CliExitError', 'exitCode 0, signal SIGKILL');
  });

  it('V-E2 — empty stdout at exit 1 → CliExitError; at exit 0 the walk finds no init', () => {
    expectRefused(thrownBy(() => projectText('', { exitCode: 1 })), CliExitError, 'CliExitError', 'exitCode 1');
    expectRefused(thrownBy(() => projectText('')), CliStreamLifecycleError, 'CliStreamLifecycleError', 'end of stream — no system init event arrived');
  });

  it('V-X1 — the first malformed line is refused after classification, in @1\'s words: not JSON, an array, a string, null', () => {
    const text = serialise(build()).split('\n');
    for (const [bad, detail] of [['{not json', 'not JSON ('], ['[1, 2]', 'parses as an array'], ['"string"', 'parses as a string'], ['null', 'parses as null']] as const) {
      const lines = text.slice();
      lines.splice(4, 0, bad);
      expectRefused(thrownBy(() => projectText(lines.join('\n'))), CliStreamMalformedError, 'CliStreamMalformedError', `stream line 5 is not a JSON object — ${detail}`);
    }
    const two = text.slice();
    two.splice(4, 0, '{first');
    two.splice(9, 0, '{second');
    expectRefused(thrownBy(() => projectText(two.join('\n'))), CliStreamMalformedError, 'CliStreamMalformedError', 'stream line 5 is not a JSON object');
  });

  it('V-X2 — line numbers count blank lines exactly as @1\'s do', () => {
    const events = build();
    rateInfo(events)['overageStatus'] = 'allowed';
    const line = lineOf(events, isType('rate_limit_event'));
    expectRefused(thrownBy(() => projectText(`\n\n${serialise(events)}`)), CliOverageError, 'CliOverageError', `the rate_limit_event at line ${line + 2} reports overage`);
  });
});

describe('claude-code-cli@2 — D-8: each step before the next', () => {
  it('V-D1 — the exit before the malformed line; the malformed line before the walk', () => {
    const lines = serialise(build()).split('\n');
    lines.splice(4, 0, '{not json');
    expectRefused(thrownBy(() => projectText(lines.join('\n'), { exitCode: 1 })), CliExitError, 'CliExitError', 'exitCode 1');
    const events = build();
    afterStatus(events, systemEvent('api_retry'));
    const withBoth = serialise(events).split('\n');
    withBoth.splice(10, 0, '{not json');
    expectRefused(thrownBy(() => projectText(withBoth.join('\n'))), CliStreamMalformedError, 'CliStreamMalformedError', 'stream line 11 is not a JSON object');
  });

  it('V-D2 — the walk before the launch context; the launch context before the result', () => {
    const walk = build();
    initOf(walk)['permissionMode'] = 'acceptEdits';
    afterStatus(walk, systemEvent('api_retry'));
    expectRefused(refusalOf(walk), CliStreamLifecycleError, 'CliStreamLifecycleError', 'system subtype "api_retry"');
    const context = build();
    initOf(context)['permissionMode'] = 'acceptEdits';
    resultOf(context)['terminal_reason'] = 'max_turns';
    expectRefused(refusalOf(context), CliLaunchContextError, 'CliLaunchContextError', 'permissionMode "acceptEdits"');
  });

  it('V-D3 — the result before the usage observed; the usage observed before the model usage', () => {
    const result = build();
    resultOf(result)['terminal_reason'] = 'max_turns';
    result.splice(at(result, isType('rate_limit_event')), 1);
    expectRefused(refusalOf(result), CliResultError, 'CliResultError', 'terminal_reason "max_turns"');
    const usageFirst = build();
    delete rateInfo(usageFirst)['overageStatus'];
    resultOf(usageFirst)['modelUsage'] = {};
    expectRefused(refusalOf(usageFirst), CliUsageUnobservedError, 'CliUsageUnobservedError', 'overageStatus absent');
  });

  it('V-D4 — the model usage before the call; the call before the stop reasons; the stop reasons before the tool loop', () => {
    const modelUsage = build();
    resultOf(modelUsage)['modelUsage'] = {};
    ((inner(modelUsage, at(modelUsage, isBlockStart('tool_use')))['content_block']) as Ev)['name'] = 'Bash';
    expectRefused(refusalOf(modelUsage), CliResultError, 'CliResultError', 'modelUsage has 0 entries');
    // The pause_turn message comes before the call's message (re-pointed by review repair U5, a parent decision, as V-O1
    // is): as the last message it would be refused at the result step, before the call.
    const call = build();
    ((inner(call, at(call, isBlockStart('tool_use')))['content_block']) as Ev)['name'] = 'Bash';
    afterStatus(call, ...textMessage('pause_turn'));
    expectRefused(refusalOf(call), CliUnexpectedToolCallError, 'CliUnexpectedToolCallError', '"Bash"');
    const stop = build();
    afterStatus(stop, ...textMessage('pause_turn'));
    stop.splice(at(stop, isType('user')), 1);
    expectRefused(refusalOf(stop), CliStopReasonError, 'CliStopReasonError', 'stop_reason "pause_turn"');
  });
});

// ---------------------------------------------------------------------------
// Precedence: one case per adjacent pair, the higher-priority fact on the later line
// ---------------------------------------------------------------------------

describe('claude-code-cli@2 — D-7 precedence by rule, not by line', () => {
  it('V-Q1 — overage over exhaustion: a rejected event early, an overage event later → CliOverageError naming the later line', () => {
    const events = build();
    afterStatus(events, rateLimitEvent(compliantInfo({ status: 'rejected' })));
    rateInfo(events, 1)['overageStatus'] = 'allowed';
    const [early, late] = [lineOf(events, isType('rate_limit_event')), lineOf(events, isType('rate_limit_event'), 1)];
    expect(early).toBeLessThan(late);
    expectRefused(refusalOf(events), CliOverageError, 'CliOverageError', `the rate_limit_event at line ${late} reports overage: overageStatus "allowed"`);
  });

  it('V-Q2 — exhaustion over credits: a credits item early, a rejected event later → CliIncludedUsageExhaustedError', () => {
    const events = build();
    afterStatus(events, apiErrorItem({ error: 'model_requires_usage_credits' }));
    rateInfo(events)['status'] = 'rejected';
    expect(lineOf(events, isType('assistant'))).toBeLessThan(lineOf(events, isType('rate_limit_event')));
    expectRefused(refusalOf(events), CliIncludedUsageExhaustedError, 'CliIncludedUsageExhaustedError', `line ${lineOf(events, isType('rate_limit_event'))} reports status "rejected"`);
  });

  it('V-Q3 — credits over the long-context route: a [1m] init model early, a credits item later → CliCreditsRequiredError', () => {
    const events = build();
    initOf(events)['model'] = 'claude-opus-5-5[1m]';
    beforeRateLimit(events, apiErrorItem({ error: 'long_context_credits_required' }));
    expectRefused(refusalOf(events), CliCreditsRequiredError, 'CliCreditsRequiredError', `API error "long_context_credits_required" on an assistant API-error item at line ${lineOf(events, isType('assistant'), 1)}`);
  });

  it('V-Q4 — the long-context route over substitution: a fallback early, a [1m] modelUsage key later → CliLongContextRouteError', () => {
    const events = build();
    afterStatus(events, systemEvent('model_fallback'));
    const mu = modelUsageOf(events);
    mu['claude-opus-5-5[1m]'] = mu['claude-opus-5-5'];
    delete mu['claude-opus-5-5'];
    expectRefused(refusalOf(events), CliLongContextRouteError, 'CliLongContextRouteError', `result.modelUsage key "claude-opus-5-5[1m]" at line ${lineOf(events, isType('result'))}`);
  });

  it('V-Q5 — substitution over refusal: model_refusal_no_fallback early, another canonicalModel later → CliModelSubstitutionError', () => {
    const events = build();
    afterStatus(events, systemEvent('model_refusal_no_fallback', { apiRefusalCategory: 'frontier_llm' }));
    (modelUsageOf(events)['claude-opus-5-5'] as Ev)['canonicalModel'] = 'claude-sonnet-5';
    expectRefused(refusalOf(events), CliModelSubstitutionError, 'CliModelSubstitutionError', `canonicalModel "claude-sonnet-5" at line ${lineOf(events, isType('result'))}`);
  });

  it('V-Q6 — refusal over truncation: max_tokens in the message early, a refusal on the result later → ProviderRefusalError', () => {
    const events = build();
    messageDelta(events)['stop_reason'] = 'max_tokens';
    Object.assign(resultOf(events), { stop_reason: 'refusal', stop_details: { category: 'frontier_llm', explanation: 'late' } });
    const error = refusalOf(events);
    expectRefused(error, ProviderRefusalError, 'ProviderRefusalError', '(category frontier_llm) — late');
    expect(error).not.toBeInstanceOf(ProviderOutputTruncatedError);
  });

  it('V-Q7 — truncation over fast mode: fast mode at init early, max_tokens later → CliOutputTruncatedError', () => {
    const events = build();
    initOf(events)['fast_mode_state'] = 'on';
    messageDelta(events)['stop_reason'] = 'max_tokens';
    expectRefused(refusalOf(events), CliOutputTruncatedError, 'CliOutputTruncatedError', 'stopped at max_tokens (64000)');
  });

  it('V-Q8 — fast mode over the other kinds: effort_requires_thinking early, fast mode on the result later → CliFastModeError', () => {
    const events = build();
    afterStatus(events, apiErrorItem({ error: 'effort_requires_thinking' }));
    resultOf(events)['fast_mode_state'] = 'on';
    expectRefused(refusalOf(events), CliFastModeError, 'CliFastModeError', `result fast_mode_state "on" at line ${lineOf(events, isType('result'))}`);
  });

  it('V-Q9 — exhaustion over substitution: another init model on line 1, a rejected event later → CliIncludedUsageExhaustedError', () => {
    const events = build();
    initOf(events)['model'] = 'claude-opus-5';
    rateInfo(events)['status'] = 'rejected';
    expectRefused(refusalOf(events), CliIncludedUsageExhaustedError, 'CliIncludedUsageExhaustedError', `line ${lineOf(events, isType('rate_limit_event'))} reports status "rejected"`);
  });

  it('V-Q10 — overage then rejected: an overage event early, a rejected event later → CliOverageError naming the early line', () => {
    const events = build();
    rateInfo(events)['overageStatus'] = 'allowed';
    events.splice(at(events, isType('rate_limit_event')) + 1, 0, rateLimitEvent(compliantInfo({ status: 'rejected' })));
    expectRefused(refusalOf(events), CliOverageError, 'CliOverageError', `the rate_limit_event at line ${lineOf(events, isType('rate_limit_event'))} reports overage`);
  });

  it('V-Q11 — a rejected event followed by allowed ones and a clean success at exit 0 → exhausted, naming the rejected line', () => {
    const events = build();
    beforeRateLimit(events, rateLimitEvent(compliantInfo({ status: 'rejected', resetsAt: 1790089800 })));
    events.splice(at(events, isType('rate_limit_event'), 1) + 1, 0, rateLimitEvent(compliantInfo({ status: 'allowed_warning' })));
    expect(events.filter(isType('rate_limit_event')).map((e) => (e['rate_limit_info'] as Ev)['status'])).toEqual(['rejected', 'allowed', 'allowed_warning']);
    const error = refusalOf(events);
    expectRefused(error, CliIncludedUsageExhaustedError, 'CliIncludedUsageExhaustedError', `the rate_limit_event at line ${lineOf(events, isType('rate_limit_event'))} reports status "rejected" (rateLimitType "five_hour", resetsAt 1790089800)`);
    // Positive control: the same stream without the rejected event is a clean success.
    events.splice(at(events, isType('rate_limit_event')), 1);
    expect(project(events)).toBe(PAYLOAD);
  });

  it('V-Q12 — an overage event followed by a malformed line → CliOverageError; so is a malformed line followed by an overage event', () => {
    const events = build();
    rateInfo(events)['overageStatus'] = 'allowed';
    const rate = at(events, isType('rate_limit_event'));
    const after = serialise(events).split('\n');
    after.splice(rate + 1, 0, '{not json');
    expectRefused(thrownBy(() => projectText(after.join('\n'))), CliOverageError, 'CliOverageError', `the rate_limit_event at line ${rate + 1} reports overage: overageStatus "allowed"`);
    const before = serialise(events).split('\n');
    before.splice(1, 0, '{not json');
    expectRefused(thrownBy(() => projectText(before.join('\n'))), CliOverageError, 'CliOverageError', `the rate_limit_event at line ${rate + 2} reports overage`);
  });
});

describe('claude-code-cli@2 — within one rule, the earliest line is named', () => {
  it('V-H1 — two rejected events: the earlier is named, with its own rateLimitType and resetsAt', () => {
    const events = build();
    afterStatus(events, rateLimitEvent(compliantInfo({ status: 'rejected', rateLimitType: 'five_hour', resetsAt: 1790089800 })));
    Object.assign(rateInfo(events, 1), { status: 'rejected', rateLimitType: 'seven_day', resetsAt: 1790500000 });
    const [early, late] = [lineOf(events, isType('rate_limit_event')), lineOf(events, isType('rate_limit_event'), 1)];
    expect(early).toBeLessThan(late);
    const error = refusalOf(events);
    expectRefused(error, CliIncludedUsageExhaustedError, 'CliIncludedUsageExhaustedError', `the rate_limit_event at line ${early} reports status "rejected" (rateLimitType "five_hour", resetsAt 1790089800)`);
    expect((error as CliIncludedUsageExhaustedError).line).toBe(early);
    expect((error as CliIncludedUsageExhaustedError).rateLimitType).toBe('five_hour');
    expect((error as CliIncludedUsageExhaustedError).resetsAt).toBe(1790089800);
  });

  it('V-H2 — two overage events: the earlier is named, with its own fact', () => {
    const events = build();
    afterStatus(events, rateLimitEvent(compliantInfo({ isUsingOverage: true })));
    rateInfo(events, 1)['overageStatus'] = 'allowed';
    const [early, late] = [lineOf(events, isType('rate_limit_event')), lineOf(events, isType('rate_limit_event'), 1)];
    expect(early).toBeLessThan(late);
    const error = refusalOf(events);
    expectRefused(error, CliOverageError, 'CliOverageError', `the rate_limit_event at line ${early} reports overage: isUsingOverage true`);
    expect((error as Error).message).not.toContain(`line ${late}`);
  });
});

// ---------------------------------------------------------------------------
// Purity: what the projection's module imports
// ---------------------------------------------------------------------------

/**
 * Every module specifier a source text names: static and type imports, re-exports, side-effect imports, dynamic
 * imports and require calls. A dynamic import or a require may name its module in backticks as well as quotes.
 */
function importSources(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(/\b(?:import|export)\s+(?:type\s+)?(?:[^'";]*?\bfrom\s*)?['"]([^'"]+)['"]/g)) found.add(m[1]!);
  for (const m of text.matchAll(/\bimport\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g)) found.add(m[1]!);
  for (const m of text.matchAll(/\brequire\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g)) found.add(m[1]!);
  return [...found].sort();
}

describe('claude-code-cli@2 — the projection module stays pure', () => {
  const source = (name: string): string => readFileSync(join(here, '..', 'src', 'pipeline', name), 'utf8');

  it('V-Y0 — the extractor finds every import form, positive control on literal text', () => {
    const text = [
      "import { a } from 'value-import';",
      "import type { B } from 'type-import';",
      'import {\n  c,\n  type D,\n} from "multi-line";',
      "import 'side-effect';",
      "export { e } from 're-export';",
      "export * from 'star-export';",
      "const f = await import('dynamic');",
      "const g = require('required');",
      'const h = await import(`backtick-dynamic`);',
      'const i = require(`backtick-required`);',
    ].join('\n');
    expect(importSources(text)).toEqual(['backtick-dynamic', 'backtick-required', 'dynamic', 'multi-line', 're-export', 'required', 'side-effect', 'star-export', 'type-import', 'value-import']);
  });

  it('V-Y1 — claude-code-cli.ts imports exactly zod, ./anthropic-messages, ./provider-adapter and ./roles: no node:* module and nothing of the transport', () => {
    const sources = importSources(source('claude-code-cli.ts'));
    expect(sources).toEqual(['./anthropic-messages', './provider-adapter', './roles', 'zod']);
    expect(sources.filter((s) => s.startsWith('node:'))).toEqual([]);
    expect(sources.filter((s) => s.includes('claude-code-cli-transport'))).toEqual([]);
  });

  it('V-Y2 — positive control: the same extraction over the transport finds node:child_process and the adapter it imports from', () => {
    const sources = importSources(source('claude-code-cli-transport.ts'));
    expect(sources).toContain('node:child_process');
    expect(sources).toContain('./claude-code-cli');
  });
});
