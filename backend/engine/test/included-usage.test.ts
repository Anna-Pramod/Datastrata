/**
 * The harness's account of included usage, rule by rule (plan 2026-09-25,
 * D-5, D-6; Task 5b).
 *
 * Why a file of its own: `included-usage.ts` is the backstop to the `@2`
 * projection, and each of its sixteen facts has to be seen to decide alone —
 * one stream differing from a clean one in exactly one respect, and the whole
 * fact list compared, so a rule that fires too often is caught as surely as
 * one that never fires. Every `@2` value below is a literal written here: the
 * clean stream is `claude-code-cli-v2.test.ts`'s `build()` shape written
 * again, never read off the `@2` profile or adapter, whose agreement would
 * prove nothing. The boundaries D-5 and D-6 draw (the 190,000 ceiling, a
 * utilization of 0 and 1, a reset reached naturally) are shown from both
 * sides. The last case reads `included-usage.ts` with the TypeScript parser
 * and holds every import it has to `import type`, beside synthetic sources
 * that show the scan does flag what it claims to.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { observeUsage, usageStopOf, usageViolations, type UsageFact, type UsageLine } from './included-usage';

const here = dirname(fileURLToPath(import.meta.url));

type Ev = Record<string, unknown>;

const META = { session_id: 'sess', uuid: 'uuid' } as const;
const PAYLOAD = '{"token": "DS-SYNTH-001", "sum": 5}';
const NOTE = 'a resume is a new, separately approved execution';
const BOUNDARY = "(the plan's proposed value, for the user to confirm)";

const se = (kind: string, extra: Ev = {}): Ev => ({ type: 'stream_event', event: { type: kind, ...extra }, parent_tool_use_id: null, ...META });
const usage = (extra: Ev = {}): Ev => ({ input_tokens: 2, output_tokens: 82, cache_creation_input_tokens: 626, cache_read_input_tokens: 0, ...extra });

/**
 * A clean 2.1.295 stream, one event per line, the tool call in one delta:
 * 1 init, 2 status, 3 message_start, 4 content_block_start, 5 delta,
 * 6 assistant, 7 content_block_stop, 8 user, 9 message_delta,
 * 10 message_stop, 11 thinking_tokens, 12 rate_limit_event, 13 result.
 */
function clean(): Ev[] {
  const parsed = JSON.parse(PAYLOAD) as unknown;
  return [
    { type: 'system', subtype: 'init', apiKeySource: 'none', claude_code_version: '2.1.295', model: 'claude-opus-5-5', permissionMode: 'default', fast_mode_state: 'off', tools: ['StructuredOutput'], mcp_servers: [], ...META },
    { type: 'system', subtype: 'status', status: 'requesting', ...META },
    se('message_start', { message: { id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null, usage: { input_tokens: 2, output_tokens: 25 } } }),
    se('content_block_start', { index: 0, content_block: { type: 'tool_use', id: 'toolu_1', name: 'StructuredOutput', input: {} } }),
    se('content_block_delta', { index: 0, delta: { type: 'input_json_delta', partial_json: PAYLOAD } }),
    {
      type: 'assistant',
      message: { id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [{ type: 'tool_use', id: 'toolu_1', name: 'StructuredOutput', input: parsed }], stop_reason: null, usage: usage() },
      request_id: 'req_1',
      parent_tool_use_id: null,
      ...META,
    },
    se('content_block_stop', { index: 0 }),
    { type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'Structured output provided successfully' }] }, parent_tool_use_id: null, ...META },
    se('message_delta', { delta: { stop_reason: 'tool_use', stop_sequence: null, stop_details: null }, usage: usage() }),
    se('message_stop'),
    { type: 'system', subtype: 'thinking_tokens', tokens: 0, ...META },
    { type: 'rate_limit_event', rate_limit_info: compliantInfo(), ...META },
    {
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
    },
  ];
}

/** The clean stream's compliant rate_limit_info, as a fresh literal. */
function compliantInfo(over: Ev = {}): Ev {
  return { status: 'allowed', rateLimitType: 'five_hour', isUsingOverage: false, overageStatus: 'rejected', overageDisabledReason: 'org_level_disabled', resetsAt: 1790075400, ...over };
}

const find = (events: Ev[], pred: (e: Ev) => boolean): Ev => {
  const found = events.find(pred);
  if (found === undefined) throw new Error('no event matching the predicate');
  return found;
};
const isType = (type: string) => (e: Ev): boolean => e['type'] === type;
const isStream = (kind: string) => (e: Ev): boolean => e['type'] === 'stream_event' && (e['event'] as Ev)['type'] === kind;
const initOf = (events: Ev[]): Ev => find(events, (e) => e['type'] === 'system' && e['subtype'] === 'init');
const resultOf = (events: Ev[]): Ev => find(events, isType('result'));
const rateInfo = (events: Ev[]): Ev => find(events, isType('rate_limit_event'))['rate_limit_info'] as Ev;
const messageStart = (events: Ev[]): Ev => (find(events, isStream('message_start'))['event'] as Ev)['message'] as Ev;
const messageDelta = (events: Ev[]): Ev => find(events, isStream('message_delta'))['event'] as Ev;
const assistantMessage = (events: Ev[]): Ev => find(events, isType('assistant'))['message'] as Ev;

/** Inserts events just before the first rate_limit_event, which then moves down a line per event. */
function beforeRateLimit(events: Ev[], ...inserted: Ev[]): void {
  events.splice(events.findIndex(isType('rate_limit_event')), 0, ...inserted);
}

/** An assistant API-error item shaped like the auth-failed probe's; the kind's fields are the caller's. */
function apiErrorItem(fields: Ev, speed: unknown = null): Ev {
  return {
    type: 'assistant',
    ...fields,
    is_api_error_message: true,
    message: { id: 'err_1', type: 'message', role: 'assistant', model: '<synthetic>', content: [{ type: 'text', text: 'API Error' }], stop_reason: 'stop_sequence', stop_sequence: '', usage: { input_tokens: 0, output_tokens: 0, speed } },
    parent_tool_use_id: null,
    ...META,
  };
}

const observed = (events: Ev[]) => observeUsage(events.map((event) => ({ event })));

/** One role launch line over a stream: the reader, launch 2 (the gate is 1), filed at 10:00Z on 2026-09-22, before the clean stream's reset. */
function roleLine(events: Ev[], over: Partial<UsageLine> = {}): UsageLine {
  return { seq: 2, kind: 'role', role: 'reader', index: 0, at: '2026-09-22T10:00:00.000Z', observed: observed(events), ...over };
}

const factsOf = (events: Ev[]): UsageFact[] => usageViolations([roleLine(events)]);

/** An expected fact on the reader's launch line. */
function fact(name: string, kind: string, detail: string, resetsAt: unknown = null): UsageFact {
  return { fact: name, kind, seq: 2, role: 'reader', index: 0, detail, resetsAt } as UsageFact;
}

const mutated = (mutate: (events: Ev[]) => void): Ev[] => {
  const events = clean();
  mutate(events);
  return events;
};

// ---------------------------------------------------------------------------
// The clean control
// ---------------------------------------------------------------------------

describe('a clean @2 stream observes what it reports, and makes no fact and no stop', () => {
  it('U-C1 — the clean stream\'s whole observation, as reported: every model position, the CLI version, the rate-limit reading with only the named fields, both fast-mode states and the one speed, the two stops, the counts and the per-request context', () => {
    expect(observed(clean())).toStrictEqual({
      reportedModels: [
        { line: 1, where: 'init.model', model: 'claude-opus-5-5', onApiError: false },
        { line: 3, where: 'message_start message.model', model: 'claude-opus-5-5', onApiError: false },
        { line: 6, where: 'assistant message.model', model: 'claude-opus-5-5', onApiError: false },
        { line: 13, where: 'result.modelUsage key', model: 'claude-opus-5-5', onApiError: false },
        { line: 13, where: 'result.modelUsage["claude-opus-5-5"].canonicalModel', model: 'claude-opus-5-5', onApiError: false },
      ],
      cliVersion: '2.1.295',
      // The one init states no betas: an entry for it, without them (Task 5b review repair R4).
      initBetas: [{ line: 1 }],
      rateLimits: [{ line: 12, info: { status: 'allowed', rateLimitType: 'five_hour', isUsingOverage: false, overageStatus: 'rejected', resetsAt: 1790075400 }, notAnObject: null }],
      fastMode: { init: [{ line: 1, fields: { fast_mode_state: 'off' } }], result: [{ line: 13, fields: { fast_mode_state: 'off' } }], speeds: [{ line: 13, where: 'result usage', speed: 'standard', onApiError: false }] },
      stops: [
        { line: 9, where: 'message_delta', reason: 'tool_use' },
        { line: 13, where: 'result', reason: 'tool_use' },
      ],
      apiErrors: [],
      blockTypes: { tool_use: 1 },
      systemSubtypes: { init: 1, status: 1, thinking_tokens: 1 },
      reportedContextTokens: 628,
    });
  });

  it('U-C2 — no fact and no stop; a gate line and a line with no observation are skipped, while the same observation on a role line is read', () => {
    expect(factsOf(clean())).toStrictEqual([]);
    expect(usageStopOf(factsOf(clean()))).toBeNull();
    const rejected = mutated((ev) => { rateInfo(ev)['status'] = 'rejected'; });
    expect(usageViolations([roleLine(rejected, { kind: 'gate', role: null, index: null, seq: 1 }), { ...roleLine(rejected), observed: null }])).toStrictEqual([]);
    // Positive control: the same observation on a role line is one fact.
    expect(usageViolations([roleLine(rejected)])).toHaveLength(1);
  });

  it('U-C3 — the stops beyond message_delta, each at its position with its category and never its explanation; an API-error item\'s model is read as on an API error, beside a plain assistant\'s (Task 5b review repairs R11, R12)', () => {
    const input: Ev[] = [
      { type: 'system', subtype: 'model_refusal_no_fallback', apiRefusalCategory: 'cat-a', apiRefusalExplanation: 'EXPL-A', ...META },
      apiErrorItem({ error: 'safety_monitor_blocked', apiRefusalCategory: 'cat-b', apiRefusalExplanation: 'EXPL-B' }),
      { type: 'system', subtype: 'api_error', error: 'safety_monitor_blocked', apiRefusalCategory: 'cat-c', apiRefusalExplanation: 'EXPL-C', ...META },
      { type: 'assistant', message: { id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [{ type: 'text', text: 'no' }], stop_reason: 'refusal', stop_details: { category: 'cat-d', explanation: 'EXPL-D' }, usage: usage() }, parent_tool_use_id: null, ...META },
      { type: 'result', subtype: 'success', is_error: false, stop_reason: 'refusal', stop_details: { category: 'cat-e', explanation: 'EXPL-E' }, fast_mode_state: 'off', ...META },
    ];
    const observation = observed(input);
    const text = JSON.stringify(input);
    const serialised = JSON.stringify(observation);
    for (const explanation of ['EXPL-A', 'EXPL-B', 'EXPL-C', 'EXPL-D', 'EXPL-E']) {
      // Positive control: each explanation is in the input the observation was read from.
      expect(text, `${explanation} in the input`).toContain(explanation);
      expect(serialised, `${explanation} copied into the observation`).not.toContain(explanation);
    }
    expect(serialised).not.toMatch(/EXPL-/);
    // Every category, at its position: the absences above are not the absence of the readings.
    expect(observation.stops).toStrictEqual([
      { line: 1, where: 'system model_refusal_no_fallback', apiRefusalCategory: 'cat-a' },
      { line: 2, where: 'assistant message', reason: 'stop_sequence', apiRefusalCategory: 'cat-b' },
      { line: 3, where: 'system api_error', apiRefusalCategory: 'cat-c' },
      { line: 4, where: 'assistant message', reason: 'refusal', category: 'cat-d' },
      { line: 5, where: 'result', reason: 'refusal', category: 'cat-e' },
    ]);
    expect(observation.apiErrors).toStrictEqual([
      { line: 2, where: 'assistant API-error item', kinds: ['safety_monitor_blocked'] },
      { line: 3, where: 'system api_error', kinds: ['safety_monitor_blocked'] },
    ]);
    // R12: the API-error item's model, "<synthetic>", is read as on an API error; the plain assistant's is not.
    expect(observation.reportedModels).toStrictEqual([
      { line: 2, where: 'assistant message.model', model: '<synthetic>', onApiError: true },
      { line: 4, where: 'assistant message.model', model: 'claude-opus-5-5', onApiError: false },
    ]);
  });

  it('U-C4 — every init and every result event is read, in order: their fast_mode* fields, and every init\'s betas, an init that states none an entry without them; the CLI version is the first init\'s, the record (Task 5b review repair R4)', () => {
    const events = mutated((ev) => {
      ev.splice(1, 0, { ...initOf(ev), claude_code_version: '2.1.281', fast_mode_state: 'on', fast_mode_reason: 'second', betas: ['beta-two'] });
      ev.push({ ...resultOf(ev), fast_mode_state: 'cooldown' });
    });
    const observation = observed(events);
    expect(observation.cliVersion).toBe('2.1.295');
    expect(observation.initBetas).toStrictEqual([{ line: 1 }, { line: 2, betas: ['beta-two'] }]);
    expect(observation.fastMode.init).toStrictEqual([{ line: 1, fields: { fast_mode_state: 'off' } }, { line: 2, fields: { fast_mode_state: 'on', fast_mode_reason: 'second' } }]);
    expect(observation.fastMode.result).toStrictEqual([{ line: 14, fields: { fast_mode_state: 'off' } }, { line: 15, fields: { fast_mode_state: 'cooldown' } }]);
    // No init and no result event: the version null, and every list empty, never null.
    const none = observed(mutated((ev) => { ev.splice(0, 1); ev.splice(ev.findIndex(isType('result')), 1); }));
    expect([none.cliVersion, none.initBetas, none.fastMode.init, none.fastMode.result]).toStrictEqual([null, [], [], []]);
  });
});

// ---------------------------------------------------------------------------
// Each of the sixteen facts, alone
// ---------------------------------------------------------------------------

interface Row {
  trigger: string;
  mutate(events: Ev[]): void;
  expected: UsageFact[];
}

const RL = 'rate_limit_event at line 12';
const EVENT_RESET = 1790075400;

const LONE: Record<string, Row[]> = {
  rate_limit_rejected: [
    { trigger: 'top status "rejected"', mutate: (ev) => { rateInfo(ev)['status'] = 'rejected'; }, expected: [fact('rate_limit_rejected', 'exhausted', `${RL}: rate_limit_info.status "rejected"`, EVENT_RESET)] },
    { trigger: 'a window one level down, its own resetsAt', mutate: (ev) => { rateInfo(ev)['unifiedWindows'] = [{ status: 'rejected', rateLimitType: 'seven_day', resetsAt: 1790500000 }]; }, expected: [fact('rate_limit_rejected', 'exhausted', `${RL}: rate_limit_info.unifiedWindows[0].status "rejected"`, 1790500000)] },
    { trigger: 'a window deeper, through an object and an array, the event\'s resetsAt', mutate: (ev) => { rateInfo(ev)['unifiedWindows'] = { seven_day: { limits: [{ status: 'rejected' }] } }; }, expected: [fact('rate_limit_rejected', 'exhausted', `${RL}: rate_limit_info.unifiedWindows["seven_day"].limits[0].status "rejected"`, EVENT_RESET)] },
    { trigger: 'a window whose resetsAt is null, which counts as no report (U2)', mutate: (ev) => { rateInfo(ev)['unifiedWindows'] = [{ status: 'rejected', resetsAt: null }]; }, expected: [fact('rate_limit_rejected', 'exhausted', `${RL}: rate_limit_info.unifiedWindows[0].status "rejected"`, EVENT_RESET)] },
  ],
  is_using_overage: [
    { trigger: 'top absent', mutate: (ev) => { delete rateInfo(ev)['isUsingOverage']; }, expected: [fact('is_using_overage', 'unobserved', `${RL}: rate_limit_info.isUsingOverage absent`, EVENT_RESET)] },
    { trigger: 'top true', mutate: (ev) => { rateInfo(ev)['isUsingOverage'] = true; }, expected: [fact('is_using_overage', 'overage', `${RL}: rate_limit_info.isUsingOverage true`, EVENT_RESET)] },
    { trigger: 'top null', mutate: (ev) => { rateInfo(ev)['isUsingOverage'] = null; }, expected: [fact('is_using_overage', 'overage', `${RL}: rate_limit_info.isUsingOverage null`, EVENT_RESET)] },
    { trigger: 'a window, true', mutate: (ev) => { rateInfo(ev)['unifiedWindows'] = [{ isUsingOverage: true }]; }, expected: [fact('is_using_overage', 'overage', `${RL}: rate_limit_info.unifiedWindows[0].isUsingOverage true`, EVENT_RESET)] },
    { trigger: 'a window deeper, "yes"', mutate: (ev) => { rateInfo(ev)['unifiedWindows'] = { five_hour: { detail: { isUsingOverage: 'yes' } } }; }, expected: [fact('is_using_overage', 'overage', `${RL}: rate_limit_info.unifiedWindows["five_hour"].detail.isUsingOverage "yes"`, EVENT_RESET)] },
  ],
  overage_in_use: [
    { trigger: 'top true', mutate: (ev) => { rateInfo(ev)['overageInUse'] = true; }, expected: [fact('overage_in_use', 'overage', `${RL}: rate_limit_info.overageInUse true`, EVENT_RESET)] },
    { trigger: 'a window, 1', mutate: (ev) => { rateInfo(ev)['unifiedWindows'] = [{ overageInUse: 1, resetsAt: 1790600000 }]; }, expected: [fact('overage_in_use', 'overage', `${RL}: rate_limit_info.unifiedWindows[0].overageInUse 1`, 1790600000)] },
    { trigger: 'a window deeper, through an array, true', mutate: (ev) => { rateInfo(ev)['unifiedWindows'] = { five_hour: { detail: [{ overageInUse: true }] } }; }, expected: [fact('overage_in_use', 'overage', `${RL}: rate_limit_info.unifiedWindows["five_hour"].detail[0].overageInUse true`, EVENT_RESET)] },
  ],
  overage_status_not_rejected: [
    { trigger: 'top absent', mutate: (ev) => { delete rateInfo(ev)['overageStatus']; }, expected: [fact('overage_status_not_rejected', 'unobserved', `${RL}: rate_limit_info.overageStatus absent`, EVENT_RESET)] },
    { trigger: 'top "allowed"', mutate: (ev) => { rateInfo(ev)['overageStatus'] = 'allowed'; }, expected: [fact('overage_status_not_rejected', 'overage', `${RL}: rate_limit_info.overageStatus "allowed"`, EVENT_RESET)] },
    { trigger: 'top "allowed_warning"', mutate: (ev) => { rateInfo(ev)['overageStatus'] = 'allowed_warning'; }, expected: [fact('overage_status_not_rejected', 'overage', `${RL}: rate_limit_info.overageStatus "allowed_warning"`, EVENT_RESET)] },
    { trigger: 'a window, "allowed"', mutate: (ev) => { rateInfo(ev)['unifiedWindows'] = [{ overageStatus: 'allowed' }]; }, expected: [fact('overage_status_not_rejected', 'overage', `${RL}: rate_limit_info.unifiedWindows[0].overageStatus "allowed"`, EVENT_RESET)] },
    { trigger: 'a window deeper, through an array, "allowed_warning"', mutate: (ev) => { rateInfo(ev)['unifiedWindows'] = [{ nested: [{ overageStatus: 'allowed_warning' }] }]; }, expected: [fact('overage_status_not_rejected', 'overage', `${RL}: rate_limit_info.unifiedWindows[0].nested[0].overageStatus "allowed_warning"`, EVENT_RESET)] },
  ],
  rate_limit_type_not_included: [
    { trigger: 'top absent', mutate: (ev) => { delete rateInfo(ev)['rateLimitType']; }, expected: [fact('rate_limit_type_not_included', 'unobserved', `${RL}: rate_limit_info.rateLimitType absent`, EVENT_RESET)] },
    { trigger: 'top "overage"', mutate: (ev) => { rateInfo(ev)['rateLimitType'] = 'overage'; }, expected: [fact('rate_limit_type_not_included', 'overage', `${RL}: rate_limit_info.rateLimitType "overage"`, EVENT_RESET)] },
    { trigger: 'top "seven_day_overage_included"', mutate: (ev) => { rateInfo(ev)['rateLimitType'] = 'seven_day_overage_included'; }, expected: [fact('rate_limit_type_not_included', 'overage', `${RL}: rate_limit_info.rateLimitType "seven_day_overage_included"`, EVENT_RESET)] },
    { trigger: 'top "weekly"', mutate: (ev) => { rateInfo(ev)['rateLimitType'] = 'weekly'; }, expected: [fact('rate_limit_type_not_included', 'unobserved', `${RL}: rate_limit_info.rateLimitType "weekly"`, EVENT_RESET)] },
    { trigger: 'a window, "monthly"', mutate: (ev) => { rateInfo(ev)['unifiedWindows'] = [{ rateLimitType: 'monthly' }]; }, expected: [fact('rate_limit_type_not_included', 'unobserved', `${RL}: rate_limit_info.unifiedWindows[0].rateLimitType "monthly"`, EVENT_RESET)] },
    { trigger: 'a window deeper, through an array, "monthly"', mutate: (ev) => { rateInfo(ev)['unifiedWindows'] = [{ limits: [{ rateLimitType: 'monthly' }] }]; }, expected: [fact('rate_limit_type_not_included', 'unobserved', `${RL}: rate_limit_info.unifiedWindows[0].limits[0].rateLimitType "monthly"`, EVENT_RESET)] },
    { trigger: 'a window, "Seven_Day_OVERAGE", case-insensitively', mutate: (ev) => { rateInfo(ev)['unifiedWindows'] = [{ rateLimitType: 'Seven_Day_OVERAGE' }]; }, expected: [fact('rate_limit_type_not_included', 'overage', `${RL}: rate_limit_info.unifiedWindows[0].rateLimitType "Seven_Day_OVERAGE"`, EVENT_RESET)] },
    { trigger: 'an object-form key naming overage', mutate: (ev) => { rateInfo(ev)['unifiedWindows'] = { seven_day_overage_included: { status: 'allowed' } }; }, expected: [fact('rate_limit_type_not_included', 'overage', `${RL}: rate_limit_info.unifiedWindows key "seven_day_overage_included"`, EVENT_RESET)] },
    { trigger: 'a key inside a window naming overage', mutate: (ev) => { rateInfo(ev)['unifiedWindows'] = [{ status: 'allowed', overageDetail: 'x' }]; }, expected: [fact('rate_limit_type_not_included', 'overage', `${RL}: rate_limit_info.unifiedWindows[0] key "overageDetail"`, EVENT_RESET)] },
    { trigger: 'a key inside a window naming overage, the entry\'s own resetsAt on the fact (Task 5b review repair R13)', mutate: (ev) => { rateInfo(ev)['unifiedWindows'] = [{ status: 'allowed', overageDetail: 'x', resetsAt: 1790600000 }]; }, expected: [fact('rate_limit_type_not_included', 'overage', `${RL}: rate_limit_info.unifiedWindows[0] key "overageDetail"`, 1790600000)] },
    { trigger: 'a string value deeper inside a window naming overage', mutate: (ev) => { rateInfo(ev)['unifiedWindows'] = [{ scope: { window: 'seven_day_overage_included' } }]; }, expected: [fact('rate_limit_type_not_included', 'overage', `${RL}: rate_limit_info.unifiedWindows[0].scope.window "seven_day_overage_included"`, EVENT_RESET)] },
  ],
  grace_active: [
    { trigger: 'top, false', mutate: (ev) => { rateInfo(ev)['rateLimitGraceActive'] = false; }, expected: [fact('grace_active', 'unobserved', `${RL}: rate_limit_info.rateLimitGraceActive false`, EVENT_RESET)] },
    { trigger: 'a window, true', mutate: (ev) => { rateInfo(ev)['unifiedWindows'] = [{ rateLimitGraceActive: true }]; }, expected: [fact('grace_active', 'unobserved', `${RL}: rate_limit_info.unifiedWindows[0].rateLimitGraceActive true`, EVENT_RESET)] },
    { trigger: 'a window deeper, through an array, false', mutate: (ev) => { rateInfo(ev)['unifiedWindows'] = { seven_day: { detail: [{ rateLimitGraceActive: false }] } }; }, expected: [fact('grace_active', 'unobserved', `${RL}: rate_limit_info.unifiedWindows["seven_day"].detail[0].rateLimitGraceActive false`, EVENT_RESET)] },
  ],
  utilization_over_1: [
    { trigger: 'top 1.5', mutate: (ev) => { rateInfo(ev)['utilization'] = 1.5; }, expected: [fact('utilization_over_1', 'unobserved', `${RL}: rate_limit_info.utilization 1.5`, EVENT_RESET)] },
    { trigger: 'a window, 2', mutate: (ev) => { rateInfo(ev)['unifiedWindows'] = [{ utilization: 2 }]; }, expected: [fact('utilization_over_1', 'unobserved', `${RL}: rate_limit_info.unifiedWindows[0].utilization 2`, EVENT_RESET)] },
    { trigger: 'a window deeper, through an array, -1', mutate: (ev) => { rateInfo(ev)['unifiedWindows'] = { five_hour: { detail: [{ utilization: -1 }] } }; }, expected: [fact('utilization_over_1', 'unobserved', `${RL}: rate_limit_info.unifiedWindows["five_hour"].detail[0].utilization -1`, EVENT_RESET)] },
  ],
  rate_limit_error_code: [
    { trigger: 'top "x"', mutate: (ev) => { rateInfo(ev)['errorCode'] = 'x'; }, expected: [fact('rate_limit_error_code', 'unobserved', `${RL}: rate_limit_info.errorCode "x"`, EVENT_RESET)] },
    { trigger: 'a window, null', mutate: (ev) => { rateInfo(ev)['unifiedWindows'] = [{ errorCode: null }]; }, expected: [fact('rate_limit_error_code', 'unobserved', `${RL}: rate_limit_info.unifiedWindows[0].errorCode null`, EVENT_RESET)] },
    { trigger: 'a window deeper, through an array, "e"', mutate: (ev) => { rateInfo(ev)['unifiedWindows'] = [{ detail: [{ errorCode: 'e' }] }]; }, expected: [fact('rate_limit_error_code', 'unobserved', `${RL}: rate_limit_info.unifiedWindows[0].detail[0].errorCode "e"`, EVENT_RESET)] },
  ],
  rate_limit_unobserved: [
    { trigger: 'no rate_limit_event in the launch', mutate: (ev) => { ev.splice(ev.findIndex(isType('rate_limit_event')), 1); }, expected: [fact('rate_limit_unobserved', 'unobserved', 'no rate_limit_event carried an object rate_limit_info whose status is "allowed", "allowed_warning" or "rejected"')] },
    // The per-event forms sit beside a second, compliant event, so the launch as a whole is observed.
    { trigger: 'rate_limit_info null', mutate: (ev) => beforeRateLimit(ev, { type: 'rate_limit_event', rate_limit_info: null, ...META }), expected: [fact('rate_limit_unobserved', 'unobserved', `${RL}: rate_limit_info is null`)] },
    { trigger: 'rate_limit_info absent', mutate: (ev) => beforeRateLimit(ev, { type: 'rate_limit_event', ...META }), expected: [fact('rate_limit_unobserved', 'unobserved', `${RL}: rate_limit_info is absent`)] },
    { trigger: 'rate_limit_info an array', mutate: (ev) => beforeRateLimit(ev, { type: 'rate_limit_event', rate_limit_info: [compliantInfo()], ...META }), expected: [fact('rate_limit_unobserved', 'unobserved', `${RL}: rate_limit_info is an array`)] },
    { trigger: 'rate_limit_info a string', mutate: (ev) => beforeRateLimit(ev, { type: 'rate_limit_event', rate_limit_info: 'allowed', ...META }), expected: [fact('rate_limit_unobserved', 'unobserved', `${RL}: rate_limit_info is a string`)] },
    { trigger: 'top status absent', mutate: (ev) => { const info = compliantInfo(); delete info['status']; beforeRateLimit(ev, { type: 'rate_limit_event', rate_limit_info: info, ...META }); }, expected: [fact('rate_limit_unobserved', 'unobserved', `${RL}: rate_limit_info.status absent`, EVENT_RESET)] },
    { trigger: 'top status "paused"', mutate: (ev) => beforeRateLimit(ev, { type: 'rate_limit_event', rate_limit_info: compliantInfo({ status: 'paused' }), ...META }), expected: [fact('rate_limit_unobserved', 'unobserved', `${RL}: rate_limit_info.status "paused"`, EVENT_RESET)] },
    { trigger: 'a window status "paused"', mutate: (ev) => { rateInfo(ev)['unifiedWindows'] = [{ status: 'paused' }]; }, expected: [fact('rate_limit_unobserved', 'unobserved', `${RL}: rate_limit_info.unifiedWindows[0].status "paused"`, EVENT_RESET)] },
    { trigger: 'a window status deeper, through an array, "paused"', mutate: (ev) => { rateInfo(ev)['unifiedWindows'] = [{ detail: [{ status: 'paused' }] }]; }, expected: [fact('rate_limit_unobserved', 'unobserved', `${RL}: rate_limit_info.unifiedWindows[0].detail[0].status "paused"`, EVENT_RESET)] },
    { trigger: 'unifiedWindows neither an array nor an object', mutate: (ev) => { rateInfo(ev)['unifiedWindows'] = 5; }, expected: [fact('rate_limit_unobserved', 'unobserved', `${RL}: rate_limit_info.unifiedWindows 5, neither an array nor an object`, EVENT_RESET)] },
    { trigger: 'a unifiedWindows entry that is not an object', mutate: (ev) => { rateInfo(ev)['unifiedWindows'] = [0.5]; }, expected: [fact('rate_limit_unobserved', 'unobserved', `${RL}: rate_limit_info.unifiedWindows[0] 0.5, not an object`, EVENT_RESET)] },
  ],
  fast_mode_init: [
    { trigger: '"on"', mutate: (ev) => { initOf(ev)['fast_mode_state'] = 'on'; }, expected: [fact('fast_mode_init', 'fast_mode', 'init at line 1: fast_mode_state "on"')] },
    { trigger: '"cooldown"', mutate: (ev) => { initOf(ev)['fast_mode_state'] = 'cooldown'; }, expected: [fact('fast_mode_init', 'fast_mode', 'init at line 1: fast_mode_state "cooldown"')] },
    { trigger: 'absent', mutate: (ev) => { delete initOf(ev)['fast_mode_state']; }, expected: [fact('fast_mode_init', 'fast_mode', 'init at line 1: fast_mode_state absent')] },
    { trigger: '"OFF", not exactly "off"', mutate: (ev) => { initOf(ev)['fast_mode_state'] = 'OFF'; }, expected: [fact('fast_mode_init', 'fast_mode', 'init at line 1: fast_mode_state "OFF"')] },
    { trigger: 'a second init event, "on", after a first that says "off" (Task 5b review repair R4)', mutate: (ev) => { ev.splice(1, 0, { ...initOf(ev), fast_mode_state: 'on' }); }, expected: [fact('fast_mode_init', 'fast_mode', 'init at line 2: fast_mode_state "on"')] },
  ],
  fast_mode_result: [
    { trigger: '"on"', mutate: (ev) => { resultOf(ev)['fast_mode_state'] = 'on'; }, expected: [fact('fast_mode_result', 'fast_mode', 'result at line 13: fast_mode_state "on"')] },
    { trigger: 'absent', mutate: (ev) => { delete resultOf(ev)['fast_mode_state']; }, expected: [fact('fast_mode_result', 'fast_mode', 'result at line 13: fast_mode_state absent')] },
    { trigger: 'a second result event, "on", after a first that says "off" (Task 5b review repair R4)', mutate: (ev) => { ev.push({ ...resultOf(ev), fast_mode_state: 'on' }); }, expected: [fact('fast_mode_result', 'fast_mode', 'result at line 14: fast_mode_state "on"')] },
  ],
  speed_not_standard: [
    { trigger: 'the result usage, "fast"', mutate: (ev) => { (resultOf(ev)['usage'] as Ev)['speed'] = 'fast'; }, expected: [fact('speed_not_standard', 'fast_mode', 'result usage at line 13: speed "fast"')] },
    { trigger: 'the assistant usage, "fast"', mutate: (ev) => { (assistantMessage(ev)['usage'] as Ev)['speed'] = 'fast'; }, expected: [fact('speed_not_standard', 'fast_mode', 'assistant message.usage at line 6: speed "fast"')] },
    { trigger: 'the message_start usage, "priority"', mutate: (ev) => { (messageStart(ev)['usage'] as Ev)['speed'] = 'priority'; }, expected: [fact('speed_not_standard', 'fast_mode', 'message_start message.usage at line 3: speed "priority"')] },
    { trigger: 'the message_delta usage, null off an API-error item (R1)', mutate: (ev) => { (messageDelta(ev)['usage'] as Ev)['speed'] = null; }, expected: [fact('speed_not_standard', 'fast_mode', 'message_delta usage at line 9: speed null')] },
    { trigger: 'an API-error item\'s usage, "fast"', mutate: (ev) => beforeRateLimit(ev, apiErrorItem({}, 'fast')), expected: [fact('speed_not_standard', 'fast_mode', 'assistant message.usage at line 12: speed "fast"')] },
  ],
  credits_required: ['model_requires_usage_credits', 'long_context_credits_required', 'consent_unanswered'].flatMap((kind) =>
    (['error', 'apiError', 'api_error'] as const).flatMap((field): Row[] => [
      { trigger: `${kind} in an assistant API-error item's ${field}`, mutate: (ev) => beforeRateLimit(ev, apiErrorItem({ [field]: kind })), expected: [fact('credits_required', 'credits', `assistant API-error item at line 12: API-error kind "${kind}"`)] },
      { trigger: `${kind} in a system api_error event's ${field}`, mutate: (ev) => beforeRateLimit(ev, { type: 'system', subtype: 'api_error', [field]: kind, ...META }), expected: [fact('credits_required', 'credits', `system api_error at line 12: API-error kind "${kind}"`)] },
    ]),
  ),
  long_context_route: [
    { trigger: 'init.model', mutate: (ev) => { initOf(ev)['model'] = 'claude-opus-5-5[1m]'; }, expected: [fact('long_context_route', 'long_context_route', 'init.model at line 1: "claude-opus-5-5[1m]"')] },
    { trigger: 'the message_start model', mutate: (ev) => { messageStart(ev)['model'] = 'claude-opus-5-5[1m]'; }, expected: [fact('long_context_route', 'long_context_route', 'message_start message.model at line 3: "claude-opus-5-5[1m]"')] },
    { trigger: 'the assistant model', mutate: (ev) => { assistantMessage(ev)['model'] = 'claude-opus-5-5[1m]'; }, expected: [fact('long_context_route', 'long_context_route', 'assistant message.model at line 6: "claude-opus-5-5[1m]"')] },
    { trigger: 'a modelUsage key', mutate: (ev) => { resultOf(ev)['modelUsage'] = { 'claude-opus-5-5[1m]': { inputTokens: 2, outputTokens: 82, canonicalModel: 'claude-opus-5-5' } }; }, expected: [fact('long_context_route', 'long_context_route', 'result.modelUsage key at line 13: "claude-opus-5-5[1m]"')] },
    { trigger: 'a canonicalModel, "[1M]" case-insensitively', mutate: (ev) => { resultOf(ev)['modelUsage'] = { 'claude-opus-5-5': { inputTokens: 2, outputTokens: 82, canonicalModel: 'claude-opus-5-5[1M]' } }; }, expected: [fact('long_context_route', 'long_context_route', 'result.modelUsage["claude-opus-5-5"].canonicalModel at line 13: "claude-opus-5-5[1M]"')] },
    { trigger: 'an init betas entry', mutate: (ev) => { initOf(ev)['betas'] = ['interleaved-thinking-2025-05-14', 'context-1m-2025-08-07']; }, expected: [fact('long_context_route', 'long_context_route', 'init.betas at line 1: "context-1m-2025-08-07"')] },
    { trigger: 'an init betas entry, "CONTEXT-1M" case-insensitively', mutate: (ev) => { initOf(ev)['betas'] = ['CONTEXT-1M-EXPERIMENT']; }, expected: [fact('long_context_route', 'long_context_route', 'init.betas at line 1: "CONTEXT-1M-EXPERIMENT"')] },
    { trigger: 'a second init event\'s betas, after a first that states none (Task 5b review repair R4)', mutate: (ev) => { ev.splice(1, 0, { ...initOf(ev), betas: ['context-1m-2025-08-07'] }); }, expected: [fact('long_context_route', 'long_context_route', 'init.betas at line 2: "context-1m-2025-08-07"')] },
  ],
  long_context_boundary: [
    // 2 + 626 + 189,373: the assistant's request, one token above the ceiling.
    { trigger: 'the assistant usage at 190,001', mutate: (ev) => { (assistantMessage(ev)['usage'] as Ev)['cache_read_input_tokens'] = 189373; }, expected: [fact('long_context_boundary', 'long_context_boundary', `reportedContextTokens 190001, above the per-request ceiling of 190000 ${BOUNDARY}`)] },
    // 190,001 of input alone at message_start, which reports no cache field: a missing field counts 0.
    { trigger: 'the message_start usage at 190,001, no cache fields', mutate: (ev) => { messageStart(ev)['usage'] = { input_tokens: 190001, output_tokens: 25 }; }, expected: [fact('long_context_boundary', 'long_context_boundary', `reportedContextTokens 190001, above the per-request ceiling of 190000 ${BOUNDARY}`)] },
  ],
  unnatural_reset: [
    // Within one launch: a second reading of the same window, reset earlier, while the launch's time is before the first's reset.
    {
      trigger: 'a second event in the launch whose window resets earlier, before the first\'s reset time',
      mutate: (ev) => { ev.splice(ev.findIndex(isType('rate_limit_event')) + 1, 0, { type: 'rate_limit_event', rate_limit_info: compliantInfo({ resetsAt: 1790071800 }), ...META }); },
      expected: [fact('unnatural_reset', 'unnatural_reset', 'rate_limit_event at line 13: window "five_hour" at rate_limit_info reports resetsAt 1790071800, earlier than 1790075400 as reported at launch 2 line 12, while this launch\'s time 2026-09-22T10:00:00.000Z is before that reset at 2026-09-22T11:10:00.000Z', 1790071800)],
    },
  ],
};

describe('each of the sixteen facts alone: one role line whose stream differs from the clean control in one respect makes exactly that fact', () => {
  it('U-F0 — the table names the sixteen facts, each with at least one row', () => {
    expect(Object.keys(LONE)).toEqual([
      'rate_limit_rejected',
      'is_using_overage',
      'overage_in_use',
      'overage_status_not_rejected',
      'rate_limit_type_not_included',
      'grace_active',
      'utilization_over_1',
      'rate_limit_error_code',
      'rate_limit_unobserved',
      'fast_mode_init',
      'fast_mode_result',
      'speed_not_standard',
      'credits_required',
      'long_context_route',
      'long_context_boundary',
      'unnatural_reset',
    ]);
    for (const rows of Object.values(LONE)) expect(rows.length).toBeGreaterThan(0);
  });

  for (const [name, rows] of Object.entries(LONE)) {
    it.each(rows.map((row) => [row.trigger, row] as const))(`U-F ${name} — %s`, (_trigger, row) => {
      expect(factsOf(mutated(row.mutate))).toStrictEqual(row.expected);
    });
  }
});

describe('what makes no fact, beside what makes one', () => {
  it('U-N1 — a window carrying D-6\'s own overage fields at their allowed values names no overage; the same window with one set otherwise is one fact', () => {
    expect(factsOf(mutated((ev) => { rateInfo(ev)['unifiedWindows'] = [{ isUsingOverage: false, overageInUse: false, overageStatus: 'rejected' }]; }))).toStrictEqual([]);
    expect(factsOf(mutated((ev) => { rateInfo(ev)['unifiedWindows'] = [{ isUsingOverage: false, overageInUse: true, overageStatus: 'rejected' }]; }))).toHaveLength(1);
  });

  it('U-N2 — no init event is no fast_mode_init fact and no result event no fast_mode_result fact, beside a present init or result that says "on"', () => {
    expect(factsOf(mutated((ev) => { ev.splice(0, 1); }))).toStrictEqual([]);
    expect(factsOf(mutated((ev) => { ev.splice(ev.findIndex(isType('result')), 1); }))).toStrictEqual([]);
    expect(factsOf(mutated((ev) => { initOf(ev)['fast_mode_state'] = 'on'; })).map((f) => f.fact)).toEqual(['fast_mode_init']);
    expect(factsOf(mutated((ev) => { resultOf(ev)['fast_mode_state'] = 'on'; })).map((f) => f.fact)).toEqual(['fast_mode_result']);
  });

  it('U-N3 — a null speed on an API-error item is no fact (R1), a kind that asks for no credits is no fact, and betas that name no 1M context are none', () => {
    expect(factsOf(mutated((ev) => beforeRateLimit(ev, apiErrorItem({ error: 'effort_requires_thinking' }))))).toStrictEqual([]);
    expect(factsOf(mutated((ev) => { initOf(ev)['betas'] = ['interleaved-thinking-2025-05-14']; }))).toStrictEqual([]);
    // Positive control: the same item's null speed, off an API-error item, is a fact.
    expect(factsOf(mutated((ev) => beforeRateLimit(ev, { ...apiErrorItem({}), is_api_error_message: false }))).map((f) => f.detail)).toEqual(['assistant message.usage at line 12: speed null']);
  });

  it('U-N4 — D-6\'s allowed values make no fact: status "allowed_warning" and the included windows "seven_day_opus" and "seven_day_sonnet", at the top and in a window; beside the same positions holding "paused" and "monthly", which make facts, as the LONE rows rate_limit_unobserved "top status \\"paused\\"" and "a window status \\"paused\\"" and rate_limit_type_not_included "a window, \\"monthly\\"" show (Task 5b review repair M1)', () => {
    const top = (field: string, value: string): Ev[] => mutated((ev) => { rateInfo(ev)[field] = value; });
    const window = (field: string, value: string): Ev[] => mutated((ev) => { rateInfo(ev)['unifiedWindows'] = [{ [field]: value }]; });
    expect(factsOf(top('status', 'allowed_warning'))).toStrictEqual([]);
    expect(factsOf(window('status', 'allowed_warning'))).toStrictEqual([]);
    for (const type of ['seven_day_opus', 'seven_day_sonnet']) {
      expect(factsOf(top('rateLimitType', type)), `top ${type}`).toStrictEqual([]);
      expect(factsOf(window('rateLimitType', type)), `window ${type}`).toStrictEqual([]);
    }
    // Positive counterparts: the same positions, a value D-6 does not allow, make facts (a lone top "paused" also leaves the launch unobserved).
    expect(factsOf(top('status', 'paused')).map((f) => f.fact)).toEqual(['rate_limit_unobserved', 'rate_limit_unobserved']);
    expect(factsOf(window('status', 'paused')).map((f) => f.fact)).toEqual(['rate_limit_unobserved']);
    expect(factsOf(top('rateLimitType', 'monthly')).map((f) => f.fact)).toEqual(['rate_limit_type_not_included']);
    expect(factsOf(window('rateLimitType', 'monthly')).map((f) => f.fact)).toEqual(['rate_limit_type_not_included']);
  });
});

// ---------------------------------------------------------------------------
// An array entry inside unifiedWindows, and one rejected event among allowed ones
// ---------------------------------------------------------------------------

describe('a unifiedWindows entry that is an array is a fact of its own, and every object inside it is still read, as the projection reads it (Task 5b review repair R1)', () => {
  /** The clean stream with `unifiedWindows: [[window]]`: an entry that is itself an array holding one window. */
  const nested = (window: Ev): Ev[] => mutated((ev) => { rateInfo(ev)['unifiedWindows'] = [[window]]; });
  /** The entry's own fact: not an object, on the event's reset time. */
  const notAnObject = (window: Ev): UsageFact => fact('rate_limit_unobserved', 'unobserved', `${RL}: rate_limit_info.unifiedWindows[0] ${JSON.stringify([window])}, not an object`, EVENT_RESET);

  it('U-A1 — a rejected window inside the array entry is exhausted, at its own path and on its own reset time; and the stop is exhausted, holding that reset', () => {
    const window = { status: 'rejected', resetsAt: 1790500000 };
    const facts = factsOf(nested(window));
    expect(facts).toStrictEqual([fact('rate_limit_rejected', 'exhausted', `${RL}: rate_limit_info.unifiedWindows[0][0].status "rejected"`, 1790500000), notAnObject(window)]);
    expect(usageStopOf(facts)).toStrictEqual({ kind: 'exhausted', facts, seq: 2, role: 'reader', index: 0, resetsAt: 1790500000, note: NOTE });
  });

  it('U-A2 — overage in use inside the array entry is overage, on the window\'s own reset time', () => {
    const window = { overageInUse: true, resetsAt: 1790500000 };
    expect(factsOf(nested(window))).toStrictEqual([fact('overage_in_use', 'overage', `${RL}: rate_limit_info.unifiedWindows[0][0].overageInUse true`, 1790500000), notAnObject(window)]);
  });

  it('U-A3 — a window type not included, inside the array entry, is a fact', () => {
    const window = { rateLimitType: 'monthly', resetsAt: 1790500000 };
    expect(factsOf(nested(window))).toStrictEqual([fact('rate_limit_type_not_included', 'unobserved', `${RL}: rate_limit_info.unifiedWindows[0][0].rateLimitType "monthly"`, 1790500000), notAnObject(window)]);
  });
});

describe('an overage name found in a window carries the reset time of the innermost object holding it, else its event\'s (Task 5b review repair N2)', () => {
  /** A name fact: rate_limit_type_not_included, kind overage, at `where` on the event's line. */
  const named = (where: string, resetsAt: unknown): UsageFact => fact('rate_limit_type_not_included', 'overage', `${RL}: rate_limit_info.unifiedWindows${where}`, resetsAt);
  const withWindows = (windows: unknown): Ev[] => mutated((ev) => { rateInfo(ev)['unifiedWindows'] = windows; });

  it('U-W1 — a key naming overage in a window inside an array entry carries that window\'s own resetsAt; the entry, not an object, is a fact of its own on the event\'s', () => {
    expect(factsOf(withWindows([[{ overageDetail: 'x', resetsAt: 1790600000 }]]))).toStrictEqual([
      named('[0][0] key "overageDetail"', 1790600000),
      fact('rate_limit_unobserved', 'unobserved', `${RL}: rate_limit_info.unifiedWindows[0] [{"overageDetail":"x","resetsAt":1790600000}], not an object`, EVENT_RESET),
    ]);
  });

  it('U-W2 — a key naming overage in an object nested inside an object-form entry carries the nested object\'s own resetsAt, not its entry\'s absent one', () => {
    expect(factsOf(withWindows({ w: { inner: { overageDetail: 'x', resetsAt: 1790700000 } } }))).toStrictEqual([named('["w"].inner key "overageDetail"', 1790700000)]);
  });

  it('U-W3 — a string naming overage held by no object, in an array entry, carries the event\'s resetsAt', () => {
    expect(factsOf(withWindows([['seven_day_overage_included']]))).toStrictEqual([
      named('[0][0] "seven_day_overage_included"', EVENT_RESET),
      fact('rate_limit_unobserved', 'unobserved', `${RL}: rate_limit_info.unifiedWindows[0] ["seven_day_overage_included"], not an object`, EVENT_RESET),
    ]);
  });

  it('U-W4 — each name goes with the object holding it: a key and a string in a directly held array of a window with its own reset carry that reset, and a key in an object inside it that reports none carries the event\'s, never the enclosing window\'s', () => {
    expect(factsOf(withWindows([{ resetsAt: 1790600000, overageNote: 'x', tags: ['overage-tag'], inner: { overageDetail: 'y' } }]))).toStrictEqual([
      named('[0] key "overageNote"', 1790600000),
      named('[0].tags[0] "overage-tag"', 1790600000),
      named('[0].inner key "overageDetail"', EVENT_RESET),
    ]);
  });
});

describe('any one rejected event means included usage is exhausted, whatever follows it in the launch (D-6\'s auto-continue case; Task 5b review repair R5)', () => {
  it('U-E1 — a rejected event before the compliant allowed one, the result still a clean success: exactly the rejected fact, at the inserted line, and a stop of kind exhausted', () => {
    const events = mutated((ev) => beforeRateLimit(ev, { type: 'rate_limit_event', rate_limit_info: compliantInfo({ status: 'rejected' }), ...META }));
    // The launch otherwise says all is well: the allowed event follows the rejected one, and the result is a clean success.
    expect(observed(events).rateLimits.map((reading) => [reading.line, reading.info?.['status']])).toEqual([[12, 'rejected'], [13, 'allowed']]);
    expect(resultOf(events)).toMatchObject({ subtype: 'success', is_error: false, terminal_reason: 'completed' });
    const facts = factsOf(events);
    expect(facts).toStrictEqual([fact('rate_limit_rejected', 'exhausted', `${RL}: rate_limit_info.status "rejected"`, EVENT_RESET)]);
    expect(usageStopOf(facts)).toStrictEqual({ kind: 'exhausted', facts, seq: 2, role: 'reader', index: 0, resetsAt: EVENT_RESET, note: NOTE });
  });
});

// ---------------------------------------------------------------------------
// Boundaries
// ---------------------------------------------------------------------------

describe('the boundaries D-5 and D-6 draw, from both sides', () => {
  it('U-B1 — a utilization of 0 or 1 is no fact; 1.0000001, -0.1 and "0.5" are one each', () => {
    for (const value of [0, 1]) expect(factsOf(mutated((ev) => { rateInfo(ev)['utilization'] = value; })), String(value)).toStrictEqual([]);
    for (const [value, shown] of [[1.0000001, '1.0000001'], [-0.1, '-0.1'], ['0.5', '"0.5"']] as const) {
      expect(factsOf(mutated((ev) => { rateInfo(ev)['utilization'] = value; })), String(value)).toStrictEqual([fact('utilization_over_1', 'unobserved', `${RL}: rate_limit_info.utilization ${shown}`, EVENT_RESET)]);
    }
  });

  it('U-B2 — a per-request context of 190,000 is no fact, and 190,001 is one', () => {
    // 2 + 626 + 189,372 = 190,000.
    const at = mutated((ev) => { (assistantMessage(ev)['usage'] as Ev)['cache_read_input_tokens'] = 189372; });
    expect(observed(at).reportedContextTokens).toBe(190000);
    expect(factsOf(at)).toStrictEqual([]);
    const above = mutated((ev) => { (assistantMessage(ev)['usage'] as Ev)['cache_read_input_tokens'] = 189373; });
    expect(observed(above).reportedContextTokens).toBe(190001);
    expect(factsOf(above)).toStrictEqual([fact('long_context_boundary', 'long_context_boundary', `reportedContextTokens 190001, above the per-request ceiling of 190000 ${BOUNDARY}`)]);
  });

  it('U-B3 — per request, not the sum: two requests of 100,000 each, and a result usage of 200,000 summing them, are no fact', () => {
    const events = mutated((ev) => {
      messageStart(ev)['usage'] = { input_tokens: 100000, output_tokens: 25 };
      assistantMessage(ev)['usage'] = usage({ input_tokens: 100000, cache_creation_input_tokens: 0 });
      // The tool loop's second request.
      ev.splice(ev.findIndex(isStream('message_stop')) + 1, 0, se('message_start', { message: { id: 'msg_2', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null, usage: { input_tokens: 100000, output_tokens: 1 } } }));
      resultOf(ev)['usage'] = usage({ input_tokens: 200000, cache_creation_input_tokens: 0, speed: 'standard' });
    });
    expect(observed(events).reportedContextTokens).toBe(100000);
    expect(factsOf(events)).toStrictEqual([]);
  });

  it('U-B4 — the result usage is read only when no message usage reports an input count: then 190,001 there is a fact', () => {
    const events = mutated((ev) => {
      messageStart(ev)['usage'] = { output_tokens: 25 };
      assistantMessage(ev)['usage'] = { output_tokens: 82, input_tokens: '2' };
      resultOf(ev)['usage'] = usage({ input_tokens: 189375, speed: 'standard' });
    });
    expect(observed(events).reportedContextTokens).toBe(190001);
    expect(factsOf(events)).toStrictEqual([fact('long_context_boundary', 'long_context_boundary', `reportedContextTokens 190001, above the per-request ceiling of 190000 ${BOUNDARY}`)]);
    // With no usage anywhere, the figure is null and there is no fact.
    const none = mutated((ev) => {
      messageStart(ev)['usage'] = { output_tokens: 25 };
      assistantMessage(ev)['usage'] = { output_tokens: 82 };
      delete resultOf(ev)['usage'];
    });
    expect(observed(none).reportedContextTokens).toBeNull();
    expect(factsOf(none)).toStrictEqual([]);
  });
});

// ---------------------------------------------------------------------------
// unnatural_reset, across launches
// ---------------------------------------------------------------------------

describe('unnatural_reset compares each window with its state from earlier events, before the reset time the window last reported itself', () => {
  const reader = (events: Ev[]): UsageLine => roleLine(events, { at: '2026-09-22T10:00:00.000Z' });
  const prosecutor = (events: Ev[], at = '2026-09-22T10:30:00.000Z'): UsageLine => roleLine(events, { seq: 3, role: 'prosecutor', index: 0, at });
  const withInfo = (over: Ev): Ev[] => mutated((ev) => { Object.assign(rateInfo(ev), over); });

  it('U-R1 — a window whose resetsAt moves earlier while the clock is before the earlier reset is a fact; the same after the earlier reset time, a natural reset, is none', () => {
    const earlier = withInfo({ resetsAt: 1790071800 });
    expect(usageViolations([reader(clean()), prosecutor(earlier)])).toStrictEqual([
      { fact: 'unnatural_reset', kind: 'unnatural_reset', seq: 3, role: 'prosecutor', index: 0, detail: 'rate_limit_event at line 12: window "five_hour" at rate_limit_info reports resetsAt 1790071800, earlier than 1790075400 as reported at launch 2 line 12, while this launch\'s time 2026-09-22T10:30:00.000Z is before that reset at 2026-09-22T11:10:00.000Z', resetsAt: 1790071800 },
    ]);
    // At the earlier reset time exactly, and after it: a natural reset.
    expect(usageViolations([reader(clean()), prosecutor(earlier, '2026-09-22T11:10:00.000Z')])).toStrictEqual([]);
    expect(usageViolations([reader(clean()), prosecutor(earlier, '2026-09-22T12:00:00.000Z')])).toStrictEqual([]);
  });

  it('U-R2 — utilization falling before the reset time is a fact; rising is none', () => {
    const first = withInfo({ utilization: 0.5 });
    expect(usageViolations([reader(first), prosecutor(withInfo({ utilization: 0.2 }))])).toStrictEqual([
      { fact: 'unnatural_reset', kind: 'unnatural_reset', seq: 3, role: 'prosecutor', index: 0, detail: 'rate_limit_event at line 12: window "five_hour" at rate_limit_info reports utilization 0.2, lower than 0.5 as reported at launch 2 line 12, while this launch\'s time 2026-09-22T10:30:00.000Z is before that reset at 2026-09-22T11:10:00.000Z', resetsAt: 1790075400 },
    ]);
    expect(usageViolations([reader(first), prosecutor(withInfo({ utilization: 0.7 }))])).toStrictEqual([]);
  });

  it('U-R3 — two different windows are never compared: a seven_day reading after a five_hour one, with an earlier reset, is none', () => {
    expect(usageViolations([reader(clean()), prosecutor(withInfo({ rateLimitType: 'seven_day', resetsAt: 1790071800 }))])).toStrictEqual([]);
  });

  it('U-R4 — a unifiedWindows entry of the object form is named by its key, and compared; an array-form window naming no type is not (a recorded limitation)', () => {
    const keyed = (resetsAt: number): Ev[] => withInfo({ unifiedWindows: { seven_day: { resetsAt } } });
    expect(usageViolations([reader(keyed(1790500000)), prosecutor(keyed(1790400000))])).toStrictEqual([
      { fact: 'unnatural_reset', kind: 'unnatural_reset', seq: 3, role: 'prosecutor', index: 0, detail: 'rate_limit_event at line 12: window "seven_day" at rate_limit_info.unifiedWindows["seven_day"] reports resetsAt 1790400000, earlier than 1790500000 as reported at launch 2 line 12, while this launch\'s time 2026-09-22T10:30:00.000Z is before that reset at 2026-09-27T09:06:40.000Z', resetsAt: 1790400000 },
    ]);
    const unnamed = (resetsAt: number): Ev[] => withInfo({ unifiedWindows: [{ resetsAt }] });
    expect(usageViolations([reader(unnamed(1790500000)), prosecutor(unnamed(1790400000))])).toStrictEqual([]);
  });

  it('U-R5 — a gate line and a line with no observation between the two readings change nothing', () => {
    const gate: UsageLine = { seq: 1, kind: 'gate', role: null, index: null, at: '2026-09-22T09:59:00.000Z', observed: null };
    const failed: UsageLine = { ...prosecutor(clean()), seq: 3, observed: null };
    const second = roleLine(withInfo({ resetsAt: 1790071800 }), { seq: 4, role: 'prosecutor', index: 1, at: '2026-09-22T10:30:00.000Z' });
    expect(usageViolations([gate, reader(clean()), failed, second]).map((f) => [f.fact, f.seq])).toEqual([['unnatural_reset', 4]]);
  });

  /** The instant `hh:mm` on 2026-09-22, UTC. */
  const clock = (hhmm: string): string => `2026-09-22T${hhmm}:00.000Z`;
  const reset = (seq: number, index: number, detail: string, resetsAt: unknown): UsageFact => ({ fact: 'unnatural_reset', kind: 'unnatural_reset', seq, role: 'prosecutor', index, detail, resetsAt });

  it('U-R6 — against the latest earlier reading, not the first: utilization 0.1, 0.5, then 0.3 on one window, all before its reset time, is one fact, at the third, lower than the second\'s 0.5 (Task 5b review repair R3)', () => {
    const lines = [
      roleLine(withInfo({ utilization: 0.1 }), { at: clock('10:00') }),
      roleLine(withInfo({ utilization: 0.5 }), { seq: 3, role: 'prosecutor', index: 0, at: clock('10:10') }),
      roleLine(withInfo({ utilization: 0.3 }), { seq: 4, role: 'prosecutor', index: 1, at: clock('10:20') }),
    ];
    expect(usageViolations(lines)).toStrictEqual([
      reset(4, 1, 'rate_limit_event at line 12: window "five_hour" at rate_limit_info reports utilization 0.3, lower than 0.5 as reported at launch 3 line 12, while this launch\'s time 2026-09-22T10:20:00.000Z is before that reset at 2026-09-22T11:10:00.000Z', 1790075400),
    ]);
  });

  it('U-R6b — the same for resetsAt: 1790075400; then 1790090000 after 11:10Z, a natural reset; then 1790080000 before 15:13:20Z, is one fact, at the third, earlier than the second\'s (Task 5b review repair R3)', () => {
    const lines = [
      roleLine(withInfo({ resetsAt: 1790075400 }), { at: clock('10:00') }),
      roleLine(withInfo({ resetsAt: 1790090000 }), { seq: 3, role: 'prosecutor', index: 0, at: clock('11:30') }),
      roleLine(withInfo({ resetsAt: 1790080000 }), { seq: 4, role: 'prosecutor', index: 1, at: clock('12:00') }),
    ];
    expect(usageViolations(lines)).toStrictEqual([
      reset(4, 1, 'rate_limit_event at line 12: window "five_hour" at rate_limit_info reports resetsAt 1790080000, earlier than 1790090000 as reported at launch 3 line 12, while this launch\'s time 2026-09-22T12:00:00.000Z is before that reset at 2026-09-22T15:13:20.000Z', 1790080000),
    ]);
  });

  it('U-R7 — a window is judged against a reset time it reported itself, never one borrowed from its event: a five_hour window reporting none, beside a seven_day reading, then a five_hour reading resetting before the seven_day time, is no fact; the same window reporting its own reset, then a lower and earlier reading before it, is one (Task 5b review repair R2)', () => {
    const sevenDay = (window: Ev): Ev[] => withInfo({ rateLimitType: 'seven_day', resetsAt: 1790500000, unifiedWindows: { five_hour: window } });
    // The counterexample: 1790075400 is earlier than the seven_day reset the window's event reports, not than any reset the window reported.
    expect(usageViolations([reader(sevenDay({ utilization: 0.4 })), prosecutor(clean())])).toStrictEqual([]);
    // A recorded limitation: a window that has never reported its own reset time is not judged, though its utilization falls.
    expect(usageViolations([reader(sevenDay({ utilization: 0.4 })), prosecutor(sevenDay({ utilization: 0.2 }))])).toStrictEqual([]);
    // Positive control: the window reports its own reset, 1790080000, and the next reading, lower and earlier, comes before it.
    expect(usageViolations([reader(sevenDay({ utilization: 0.4, resetsAt: 1790080000 })), prosecutor(withInfo({ utilization: 0.2 }))])).toStrictEqual([
      reset(3, 0, 'rate_limit_event at line 12: window "five_hour" at rate_limit_info reports resetsAt 1790075400, earlier than 1790080000 and utilization 0.2, lower than 0.4 as reported at launch 2 line 12, while this launch\'s time 2026-09-22T10:30:00.000Z is before that reset at 2026-09-22T12:26:40.000Z', 1790075400),
    ]);
  });

  it('U-R8 — an array-form window naming its own rateLimitType is compared by it across launches (Task 5b review repair R3)', () => {
    const typed = (resetsAt: number): Ev[] => withInfo({ unifiedWindows: [{ rateLimitType: 'seven_day', resetsAt }] });
    expect(usageViolations([reader(typed(1790500000)), prosecutor(typed(1790400000))])).toStrictEqual([
      reset(3, 0, 'rate_limit_event at line 12: window "seven_day" at rate_limit_info.unifiedWindows[0] reports resetsAt 1790400000, earlier than 1790500000 as reported at launch 2 line 12, while this launch\'s time 2026-09-22T10:30:00.000Z is before that reset at 2026-09-27T09:06:40.000Z', 1790400000),
    ]);
  });

  it('U-R9 — the time gate is the latest reset the window reported itself, kept past a reading that reported none: utilization below that reading\'s is judged against the earlier reading\'s own reset, and the detail names both (Task 5b review repair R2)', () => {
    const lines = [
      roleLine(withInfo({ utilization: 0.5 }), { at: clock('10:00') }),
      roleLine(withInfo({ rateLimitType: 'seven_day', resetsAt: 1790500000, unifiedWindows: { five_hour: { utilization: 0.6 } } }), { seq: 3, role: 'prosecutor', index: 0, at: clock('10:10') }),
      roleLine(withInfo({ utilization: 0.3 }), { seq: 4, role: 'prosecutor', index: 1, at: clock('10:20') }),
    ];
    expect(usageViolations(lines)).toStrictEqual([
      reset(4, 1, 'rate_limit_event at line 12: window "five_hour" at rate_limit_info reports utilization 0.3, lower than 0.6 as reported at launch 3 line 12, while this launch\'s time 2026-09-22T10:20:00.000Z is before the window\'s reset at 2026-09-22T11:10:00.000Z as reported at launch 2 line 12', 1790075400),
    ]);
  });

  /** An event reporting the five_hour window twice: the top-level reading (the event's reset, 1790075400) and a unifiedWindows object of the same name. */
  const twice = (top: number, inWindows: Ev): Ev[] => withInfo({ utilization: top, unifiedWindows: { five_hour: inWindows } });

  it('U-R10 — a window reported twice in every event, a top-level reading and a unifiedWindows object of the same name, stable over three launches before the reset, is no fact in either order of the two values; the same stream whose lower reading falls at the third launch is one fact (Task 5b review repair N1)', () => {
    for (const [top, inWindows] of [[0.4, 0.2], [0.2, 0.4]] as const) {
      const lines = [
        roleLine(twice(top, { utilization: inWindows }), { at: clock('10:00') }),
        roleLine(twice(top, { utilization: inWindows }), { seq: 3, role: 'prosecutor', index: 0, at: clock('10:10') }),
        roleLine(twice(top, { utilization: inWindows }), { seq: 4, role: 'prosecutor', index: 1, at: clock('10:20') }),
      ];
      expect(usageViolations(lines), `top ${top}, unifiedWindows ${inWindows}`).toStrictEqual([]);
    }
    // Positive control: the lower of the two readings falls, from 0.2 to 0.1, at the third launch.
    const falls = [
      roleLine(twice(0.4, { utilization: 0.2 }), { at: clock('10:00') }),
      roleLine(twice(0.4, { utilization: 0.2 }), { seq: 3, role: 'prosecutor', index: 0, at: clock('10:10') }),
      roleLine(twice(0.4, { utilization: 0.1 }), { seq: 4, role: 'prosecutor', index: 1, at: clock('10:20') }),
    ];
    expect(usageViolations(falls)).toStrictEqual([
      reset(4, 1, 'rate_limit_event at line 12: window "five_hour" at rate_limit_info.unifiedWindows["five_hour"] reports utilization 0.1, lower than 0.2 as reported at launch 3 line 12, while this launch\'s time 2026-09-22T10:20:00.000Z is before that reset at 2026-09-22T11:10:00.000Z', null),
    ]);
  });

  it('U-R11 — a utilization fall across a reading that reports none: 0.5, then a reading with no utilization, then 0.3, all before the reset, is one fact at the third, lower than the first\'s 0.5 and judged against the second\'s own reset, the detail naming each value\'s source; 0.6 at the third is none (Task 5b review repair N1)', () => {
    const lines = (third: number): UsageLine[] => [
      roleLine(withInfo({ utilization: 0.5 }), { at: clock('10:00') }),
      roleLine(clean(), { seq: 3, role: 'prosecutor', index: 0, at: clock('10:10') }),
      roleLine(withInfo({ utilization: third }), { seq: 4, role: 'prosecutor', index: 1, at: clock('10:20') }),
    ];
    expect(usageViolations(lines(0.3))).toStrictEqual([
      reset(4, 1, 'rate_limit_event at line 12: window "five_hour" at rate_limit_info reports utilization 0.3, lower than 0.5 as reported at launch 2 line 12, while this launch\'s time 2026-09-22T10:20:00.000Z is before the window\'s reset at 2026-09-22T11:10:00.000Z as reported at launch 3 line 12', 1790075400),
    ]);
    expect(usageViolations(lines(0.6))).toStrictEqual([]);
  });

  it('U-R12 — an unnatural_reset fact carries the reading\'s own resetsAt, null when it reports none: a five_hour window under a seven_day event, its own reset 1790080000 at utilization 0.5, then the same window at 0.2 reporting no reset, is exactly one fact at the window\'s path (Task 5b review repair N1)', () => {
    const sevenDay = (window: Ev): Ev[] => withInfo({ rateLimitType: 'seven_day', resetsAt: 1790500000, unifiedWindows: { five_hour: window } });
    expect(usageViolations([reader(sevenDay({ utilization: 0.5, resetsAt: 1790080000 })), prosecutor(sevenDay({ utilization: 0.2 }))])).toStrictEqual([
      reset(3, 0, 'rate_limit_event at line 12: window "five_hour" at rate_limit_info.unifiedWindows["five_hour"] reports utilization 0.2, lower than 0.5 as reported at launch 2 line 12, while this launch\'s time 2026-09-22T10:30:00.000Z is before that reset at 2026-09-22T12:26:40.000Z', null),
    ]);
  });

  it('U-R13 — an event that reports a window twice leaves the smaller of its two reset times as the gate, and the smaller of its two utilizations: after 1790075400 (11:10Z) and 1790080000 (12:26:40Z) at 0.6 and 0.3, a reading at 11:30Z is past the gate and a reading of 0.4 is no fall; 0.2 before 11:10Z is one fact (Task 5b review repair N1)', () => {
    const first = roleLine(twice(0.6, { utilization: 0.3, resetsAt: 1790080000 }), { at: clock('10:00') });
    expect(usageViolations([first, prosecutor(withInfo({ utilization: 0.2 }), clock('11:30'))])).toStrictEqual([]);
    expect(usageViolations([first, prosecutor(withInfo({ utilization: 0.4 }))])).toStrictEqual([]);
    // Positive control: below the smaller utilization, before the smaller reset.
    expect(usageViolations([first, prosecutor(withInfo({ utilization: 0.2 }))])).toStrictEqual([
      reset(3, 0, 'rate_limit_event at line 12: window "five_hour" at rate_limit_info reports utilization 0.2, lower than 0.3 as reported at launch 2 line 12, while this launch\'s time 2026-09-22T10:30:00.000Z is before that reset at 2026-09-22T11:10:00.000Z', 1790075400),
    ]);
  });
});

// ---------------------------------------------------------------------------
// Ordering, and the stop
// ---------------------------------------------------------------------------

describe('facts are ordered by launch, then line, then the fixed fact order; the stop takes its kind from them', () => {
  it('U-O1 — within a launch, by the event\'s line, a launch-level fact last, and on one line by the fixed order, not the order read', () => {
    const events = mutated((ev) => {
      initOf(ev)['fast_mode_state'] = 'on';
      // On one line, the top-level errorCode (fact 8) is read before the window's rejected status (fact 1); the order is the facts'.
      Object.assign(rateInfo(ev), { errorCode: 'x', unifiedWindows: [{ status: 'rejected' }] });
      (assistantMessage(ev)['usage'] as Ev)['cache_read_input_tokens'] = 200000;
    });
    expect(factsOf(events).map((f) => f.fact)).toEqual(['fast_mode_init', 'rate_limit_rejected', 'rate_limit_error_code', 'long_context_boundary']);
  });

  it('U-S1 — kind priority: one line with overage, fast-mode and unobserved facts stops as overage; across launches — a fast-mode launch, then one with overage and unobserved facts, then another overage — the stop is overage, at the first overage fact\'s launch', () => {
    const one = usageStopOf(factsOf(mutated((ev) => { initOf(ev)['fast_mode_state'] = 'on'; Object.assign(rateInfo(ev), { overageInUse: true, errorCode: 'x' }); })));
    expect([one?.kind, one?.facts.map((f) => f.kind), one?.seq]).toEqual(['overage', ['fast_mode', 'overage', 'unobserved'], 2]);
    const a = roleLine(mutated((ev) => { initOf(ev)['fast_mode_state'] = 'on'; }));
    const b = roleLine(mutated((ev) => { Object.assign(rateInfo(ev), { overageInUse: true, errorCode: 'x' }); }), { seq: 3, role: 'prosecutor', index: 0 });
    const c = roleLine(mutated((ev) => { rateInfo(ev)['overageStatus'] = 'allowed'; }), { seq: 4, role: 'prosecutor', index: 1 });
    const stop = usageStopOf(usageViolations([a, b, c]));
    expect(stop).toStrictEqual({
      kind: 'overage',
      facts: [
        { fact: 'fast_mode_init', kind: 'fast_mode', seq: 2, role: 'reader', index: 0, detail: 'init at line 1: fast_mode_state "on"', resetsAt: null },
        { fact: 'overage_in_use', kind: 'overage', seq: 3, role: 'prosecutor', index: 0, detail: `${RL}: rate_limit_info.overageInUse true`, resetsAt: EVENT_RESET },
        { fact: 'rate_limit_error_code', kind: 'unobserved', seq: 3, role: 'prosecutor', index: 0, detail: `${RL}: rate_limit_info.errorCode "x"`, resetsAt: EVENT_RESET },
        { fact: 'overage_status_not_rejected', kind: 'overage', seq: 4, role: 'prosecutor', index: 1, detail: `${RL}: rate_limit_info.overageStatus "allowed"`, resetsAt: EVENT_RESET },
      ],
      seq: 3,
      role: 'prosecutor',
      index: 0,
      resetsAt: EVENT_RESET,
      note: NOTE,
    });
  });

  /** A hand-made fact, for the orderings no stream would produce. */
  const made = (kind: string, seq: number, resetsAt: unknown = null): UsageFact => ({ fact: 'rate_limit_unobserved', kind, seq, role: 'prosecutor', index: seq - 3, detail: `made ${kind} ${seq}`, resetsAt }) as UsageFact;

  it('U-S2 — every adjacent pair of kinds, the higher-priority one second: the higher one decides the kind, and where it was first seen', () => {
    const order = ['overage', 'exhausted', 'unnatural_reset', 'credits', 'long_context_route', 'long_context_boundary', 'fast_mode', 'unobserved'];
    for (let i = 0; i + 1 < order.length; i += 1) {
      const stop = usageStopOf([made(order[i + 1]!, 3), made(order[i]!, 4)]);
      expect([stop?.kind, stop?.seq], `${order[i]} over ${order[i + 1]}`).toEqual([order[i], 4]);
    }
  });

  it('U-S3 — resetsAt is the latest finite one among the exhausted and overage facts, a later fact with an earlier time included; another kind\'s and a non-number are not read', () => {
    const facts = [
      made('overage', 3, 1790000000),
      made('exhausted', 4, 1790099999),
      made('overage', 5, 1790050000),
      made('unobserved', 6, 1790300000),
      made('unnatural_reset', 7, 1790200000),
      made('exhausted', 8, '1790400000'),
    ];
    expect(usageStopOf(facts)?.resetsAt).toBe(1790099999);
    expect(usageStopOf([made('fast_mode', 3), made('unobserved', 4, 1790300000)])?.resetsAt).toBeNull();
  });

  it('U-S4 — no fact is no stop; any fact is a stop carrying every fact and the note, word for word', () => {
    expect(usageStopOf([])).toBeNull();
    const one = made('credits', 5);
    expect(usageStopOf([one])).toStrictEqual({ kind: 'credits', facts: [one], seq: 5, role: 'prosecutor', index: 2, resetsAt: null, note: 'a resume is a new, separately approved execution' });
  });

  // Characterisations of the gap the reset-pending check closes (Task 5b review repair M4, a parent decision P-5b-14):
  // an exhaustion whose reset time is not a finite number is a stop of kind exhausted whose resetsAt is null, and the
  // harness then holds the next execution until an operator reviews it. usageStopOf itself is unchanged.
  it.each([
    ['(a) top status "rejected" with resetsAt a string', (ev: Ev[]) => { Object.assign(rateInfo(ev), { status: 'rejected', resetsAt: '2026-09-27T18:00:00Z' }); }],
    ['(b) top status "rejected" with resetsAt absent, a window reporting its own finite resetsAt but no status', (ev: Ev[]) => { const info = rateInfo(ev); info['status'] = 'rejected'; delete info['resetsAt']; info['unifiedWindows'] = [{ rateLimitType: 'seven_day', resetsAt: 1790500000 }]; }],
    ['(c) a rejected window whose resetsAt "soon" shadows the event\'s 1790000000 (U2)', (ev: Ev[]) => { const info = rateInfo(ev); info['resetsAt'] = 1790000000; info['unifiedWindows'] = [{ status: 'rejected', resetsAt: 'soon' }]; }],
  ] as const)('U-S5 — %s: a stop of kind exhausted whose resetsAt is null', (_input, mutate) => {
    const facts = factsOf(mutated(mutate));
    expect(facts.filter((f) => f.kind === 'exhausted').map((f) => f.fact)).toEqual(['rate_limit_rejected']);
    const stop = usageStopOf(facts);
    expect(stop?.kind).toBe('exhausted');
    expect(stop?.resetsAt).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The static scan
// ---------------------------------------------------------------------------

/**
 * Every import or re-export in a source, a type-only one included, named with the file: P-5b-1 allows
 * included-usage.ts none at all (Task 5b review repair M3). A type-only one is named as such, so a finding
 * says what it is.
 */
function importsIn(fileName: string, source: string): string[] {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const specifierOf = (node: ts.Expression | undefined): string => (node !== undefined && ts.isStringLiteralLike(node) ? node.text : '<computed>');
  const found: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) {
      const clause = node.importClause;
      const bindings = clause?.namedBindings;
      const onlyTypes = clause !== undefined && (clause.isTypeOnly || (clause.name === undefined && bindings !== undefined && ts.isNamedImports(bindings) && bindings.elements.length > 0 && bindings.elements.every((element) => element.isTypeOnly)));
      if (clause === undefined) found.push(`${fileName}: a side-effect import of ${specifierOf(node.moduleSpecifier)}`);
      else found.push(`${fileName}: a ${onlyTypes ? 'type' : 'value'} import from ${specifierOf(node.moduleSpecifier)}`);
    }
    if (ts.isExportDeclaration(node) && node.moduleSpecifier !== undefined) {
      const clause = node.exportClause;
      const onlyTypes = node.isTypeOnly || (clause !== undefined && ts.isNamedExports(clause) && clause.elements.length > 0 && clause.elements.every((element) => element.isTypeOnly));
      found.push(`${fileName}: a ${onlyTypes ? 'type' : 'value'} re-export from ${specifierOf(node.moduleSpecifier)}`);
    }
    if (ts.isImportTypeNode(node)) {
      const argument = node.argument;
      found.push(`${fileName}: an import type node of ${ts.isLiteralTypeNode(argument) ? specifierOf(argument.literal as ts.Expression) : '<computed>'}`);
    }
    if (ts.isImportEqualsDeclaration(node)) found.push(`${fileName}: an import-equals declaration`);
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) found.push(`${fileName}: a dynamic import of ${specifierOf(node.arguments[0])}`);
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'require') found.push(`${fileName}: a require of ${specifierOf(node.arguments[0])}`);
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

/** A type import planted after the source's opening JSDoc block, as a later edit could add one (Task 5b review repair M3). */
const PLANTED_TYPE_IMPORT = "import type { LaunchLine } from './live-capture';";
function withTypeImportPlanted(source: string): string {
  const end = source.indexOf('*/') + 2;
  return `${source.slice(0, end)}\n${PLANTED_TYPE_IMPORT}\n${source.slice(end)}`;
}

describe('included-usage.ts imports nothing at all, not even a type (Task 5b, a parent decision P-5b-1; Task 5b review repair M3)', () => {
  it('U-I1 — the scan finds no import declaration of any kind (a type import included), no export-from, no import type node, dynamic import or require in test/included-usage.ts, and read the file that declares the three readers; the same source with a type import planted after its JSDoc is flagged, naming the file', () => {
    const source = readFileSync(join(here, 'included-usage.ts'), 'utf8');
    expect(importsIn('test/included-usage.ts', source)).toEqual([]);
    // The file scanned is the module under test, not an empty one.
    const file = ts.createSourceFile('included-usage.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const functions = file.statements.filter(ts.isFunctionDeclaration).map((declaration) => declaration.name?.text);
    expect(functions).toEqual(expect.arrayContaining(['observeUsage', 'usageViolations', 'usageStopOf']));
    // Positive control over a copy of the real source: one type import planted is one finding.
    const planted = withTypeImportPlanted(source);
    expect(planted).toContain(PLANTED_TYPE_IMPORT);
    expect(importsIn('test/included-usage.ts', planted)).toEqual(['test/included-usage.ts: a type import from ./live-capture']);
  });

  it('U-I2 — positive controls: a type import, a value import from the projection, a side-effect import, a type or value re-export, a mixed import, an import type node, a dynamic import and a require are each flagged, naming the file; a string or comment that reads like one, and a local export, pass', () => {
    const flagged: [string, string][] = [
      [PLANTED_TYPE_IMPORT, 'synthetic.ts: a type import from ./live-capture'],
      ["import type { CliProfile } from '../src/pipeline/claude-code-cli';", 'synthetic.ts: a type import from ../src/pipeline/claude-code-cli'],
      ["import { type CliProfile, type CliEnvelope } from '../src/pipeline/claude-code-cli';", 'synthetic.ts: a type import from ../src/pipeline/claude-code-cli'],
      ["export type { CliProfile } from '../src/pipeline/claude-code-cli';", 'synthetic.ts: a type re-export from ../src/pipeline/claude-code-cli'],
      ["type Line = import('./live-capture').LaunchLine;", 'synthetic.ts: an import type node of ./live-capture'],
      ["import { CLAUDE_CODE_CLI_V2_ADAPTER } from '../src/pipeline/claude-code-cli';", 'synthetic.ts: a value import from ../src/pipeline/claude-code-cli'],
      ["import '../src/pipeline/claude-code-cli';", 'synthetic.ts: a side-effect import of ../src/pipeline/claude-code-cli'],
      ["export { CLAUDE_CODE_CLI_V2_ADAPTER } from '../src/pipeline/claude-code-cli';", 'synthetic.ts: a value re-export from ../src/pipeline/claude-code-cli'],
      ["export * from '../src/pipeline/claude-code-cli';", 'synthetic.ts: a value re-export from ../src/pipeline/claude-code-cli'],
      ["import { type CliProfile, CLAUDE_CODE_CLI_V2_PROFILE } from '../src/pipeline/claude-code-cli';", 'synthetic.ts: a value import from ../src/pipeline/claude-code-cli'],
      ["import * as cli from '../src/pipeline/claude-code-cli';", 'synthetic.ts: a value import from ../src/pipeline/claude-code-cli'],
      ["const cli = await import('../src/pipeline/claude-code-cli');", 'synthetic.ts: a dynamic import of ../src/pipeline/claude-code-cli'],
      ["const cli = require('../src/pipeline/claude-code-cli');", 'synthetic.ts: a require of ../src/pipeline/claude-code-cli'],
    ];
    for (const [source, expected] of flagged) expect(importsIn('synthetic.ts', source), source).toEqual([expected]);
    for (const source of [
      "const words = \"import { X } from 'y'\"; // import { Y } from 'z'",
      'const x = 1; export { x };',
      'export type Local = { a: number };',
    ]) {
      expect(importsIn('synthetic.ts', source), source).toEqual([]);
    }
  });
});
