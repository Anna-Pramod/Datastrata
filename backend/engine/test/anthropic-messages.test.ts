/**
 * The Anthropic Messages adapter — B-ADAPTER, offline.
 *
 * The adapter is the whole of what the pipeline knows about one provider's
 * protocol: how a canonical role request becomes an HTTP request, and how the
 * provider's envelope becomes the exact model-content string the role seam
 * validates. Both directions are proved here against canned envelopes with no
 * network, and against the contract the official Messages reference states,
 * not a remembered one.
 *
 * Three properties matter beyond shape. The credential travels in one header
 * and nowhere else. A partial answer — truncated at the output ceiling,
 * refused by the model, or stopped for a reason this pipeline cannot use — is
 * never handed to the seam as if it were an answer. And the structured-output
 * schema sent to the provider is derived from the local role schema, which
 * stays authoritative: the seam re-validates every response regardless.
 */

import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  ANTHROPIC_MESSAGES_ADAPTER,
  ANTHROPIC_MESSAGES_IDENTITY,
  ANTHROPIC_VERSION,
  MalformedProviderEnvelopeError,
  MAX_OUTPUT_TOKENS,
  ProviderRefusalError,
  ProviderResponseError,
  ProviderOutputTruncatedError,
  roleOutputJsonSchema,
  toProviderJsonSchema,
  UnsupportedSchemaFeatureError,
} from '../src/pipeline/anthropic-messages';
import { adjudicatorOutputSchema, parseRoleOutput, prosecutorOutputSchema, readerOutputSchema } from '../src/pipeline/role-outputs';
import type { RoleRequest } from '../src/pipeline/roles';
import { stubReaderOutput } from './pipeline-fixtures';

const KEY = 'sk-ant-test-0123456789';
const ENDPOINT = 'https://api.example.invalid/v1/messages';

function request(role: RoleRequest['role'] = 'reader', index = 0): RoleRequest {
  return {
    role,
    index,
    model: 'claude-opus-5',
    promptSha256: 'a'.repeat(64),
    ...(role === 'prosecutor' ? { lens: 'missing_criterion' } : {}),
    messages: [
      { from: 'prompt', content: '# Role: blind reader\n\nYou produce a reading.' },
      { from: 'input', content: '# Requirement\n\ncsrd/CSRD-S-002 v1\n\n# Entitled closure (abc)\n\n…' },
    ],
  };
}

function envelope(over: Record<string, unknown> = {}, text = JSON.stringify(stubReaderOutput())): string {
  return JSON.stringify({
    id: 'msg_01',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-5',
    content: [{ type: 'text', text }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 5 },
    ...over,
  });
}

describe('identity and request', () => {
  it('A1 — is registered as anthropic-messages@1, and the constants match the official reference', () => {
    expect(ANTHROPIC_MESSAGES_ADAPTER.identity).toEqual(ANTHROPIC_MESSAGES_IDENTITY);
    expect(ANTHROPIC_MESSAGES_IDENTITY).toEqual({ id: 'anthropic-messages', version: '1' });
    expect(ANTHROPIC_VERSION).toBe('2023-06-01');
    expect(MAX_OUTPUT_TOKENS).toBe(16000);
  });

  it('A2 — builds a POST to the named endpoint with the three required headers, and the key in the header alone', () => {
    const built = ANTHROPIC_MESSAGES_ADAPTER.buildRequest(request(), { endpoint: ENDPOINT, apiKey: KEY });
    expect(built.url).toBe(ENDPOINT);
    expect(built.method).toBe('POST');
    expect(built.headers).toEqual({ 'content-type': 'application/json', 'anthropic-version': ANTHROPIC_VERSION, 'x-api-key': KEY });
    expect(built.body).not.toContain(KEY);
    expect(JSON.stringify(built.headers).split(KEY).length - 1).toBe(1);
  });

  it('A3 — the body carries the prompt as system, the input as one user turn, a bounded max_tokens, adaptive thinking, high effort and the role schema; no cache control', () => {
    const built = ANTHROPIC_MESSAGES_ADAPTER.buildRequest(request(), { endpoint: ENDPOINT, apiKey: KEY });
    const body = JSON.parse(built.body);
    expect(body).toMatchObject({
      model: 'claude-opus-5',
      max_tokens: MAX_OUTPUT_TOKENS,
      system: '# Role: blind reader\n\nYou produce a reading.',
      messages: [{ role: 'user', content: '# Requirement\n\ncsrd/CSRD-S-002 v1\n\n# Entitled closure (abc)\n\n…' }],
      thinking: { type: 'adaptive' },
      output_config: { effort: 'high', format: { type: 'json_schema', schema: roleOutputJsonSchema('reader') } },
    });
    expect(Object.keys(body).sort()).toEqual(['max_tokens', 'messages', 'model', 'output_config', 'system', 'thinking']);
    expect(built.body).not.toContain('cache_control');
    expect(built.body).not.toContain('stream');
    // Every role sends its own schema; the prosecutor's differs from the reader's.
    const prosecutor = JSON.parse(ANTHROPIC_MESSAGES_ADAPTER.buildRequest(request('prosecutor', 2), { endpoint: ENDPOINT, apiKey: KEY }).body);
    expect(prosecutor.output_config.format.schema).toEqual(roleOutputJsonSchema('prosecutor'));
    expect(prosecutor.output_config.format.schema).not.toEqual(body.output_config.format.schema);
  });

  it('A4 — refuses a request whose messages are not exactly one prompt and one input, before building anything', () => {
    const extra: RoleRequest = { ...request(), messages: [...request().messages, { from: 'agent', content: '{}' }] };
    expect(() => ANTHROPIC_MESSAGES_ADAPTER.buildRequest(extra, { endpoint: ENDPOINT, apiKey: KEY })).toThrow(/agent/);
    const missing: RoleRequest = { ...request(), messages: [request().messages[0]!] };
    expect(() => ANTHROPIC_MESSAGES_ADAPTER.buildRequest(missing, { endpoint: ENDPOINT, apiKey: KEY })).toThrow(/input/);
  });
});

describe('the structured-output schema is derived from the local role schema', () => {
  it('S1 — converts every role output schema, objects closed and required lists exact', () => {
    for (const [role, local] of [['reader', readerOutputSchema], ['prosecutor', prosecutorOutputSchema], ['adjudicator', adjudicatorOutputSchema]] as const) {
      const schema = roleOutputJsonSchema(role) as { type: string; additionalProperties: boolean; required: string[]; properties: Record<string, unknown> };
      expect(schema.type, role).toBe('object');
      expect(schema.additionalProperties, role).toBe(false);
      expect(schema.required.sort(), role).toEqual(Object.keys(local.shape).sort());
      expect(Object.keys(schema.properties).sort(), role).toEqual(Object.keys(local.shape).sort());
    }
    // A fixture the local schema accepts is described by the converted schema: its evidence array needs one item.
    const reader = roleOutputJsonSchema('reader') as { properties: { elements: { items: { properties: { evidence: { minItems: number } } } } } };
    expect(reader.properties.elements.items.properties.evidence.minItems).toBe(1);
    expect(parseRoleOutput('reader', 0, stubReaderOutput())).toBeTruthy();
  });

  it('S2 — reads the zod definition rather than a hand-written literal: an optional field leaves the required list, a union becomes anyOf', () => {
    const optional = toProviderJsonSchema(z.object({ a: z.string(), b: z.string().optional() }).strict());
    expect(optional).toEqual({ type: 'object', properties: { a: { type: 'string' }, b: { type: 'string' } }, required: ['a'], additionalProperties: false });
    const union = toProviderJsonSchema(z.discriminatedUnion('kind', [z.object({ kind: z.literal('x'), n: z.number() }).strict(), z.object({ kind: z.literal('y') }).strict()]));
    expect(union).toEqual({ anyOf: [
      { type: 'object', properties: { kind: { const: 'x' }, n: { type: 'number' } }, required: ['kind', 'n'], additionalProperties: false },
      { type: 'object', properties: { kind: { const: 'y' } }, required: ['kind'], additionalProperties: false },
    ] });
    expect(toProviderJsonSchema(z.enum(['a', 'b']))).toEqual({ type: 'string', enum: ['a', 'b'] });
    expect(toProviderJsonSchema(z.array(z.string()).min(1))).toEqual({ type: 'array', items: { type: 'string' }, minItems: 1 });
    expect(toProviderJsonSchema(z.number().int())).toEqual({ type: 'integer' });
  });

  it('S3 — refuses, by keyword, anything outside the provider\'s supported subset rather than dropping it', () => {
    expect(() => toProviderJsonSchema(z.array(z.string()).min(2))).toThrow(UnsupportedSchemaFeatureError);
    expect(() => toProviderJsonSchema(z.array(z.string()).min(2))).toThrow(/minItems 2/);
    expect(() => toProviderJsonSchema(z.string().max(5))).toThrow(/maxLength/);
    expect(() => toProviderJsonSchema(z.number().min(1))).toThrow(/minimum/);
    expect(() => toProviderJsonSchema(z.object({ a: z.string() }))).toThrow(/strict/);
    expect(() => toProviderJsonSchema(z.string().refine(() => true))).toThrow(/ZodEffects/);
    // And the whole converted role schema uses only the whitelisted keywords.
    const keywords = new Set<string>();
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (node !== null && typeof node === 'object') {
        for (const [k, v] of Object.entries(node)) {
          if (k !== 'properties') keywords.add(k);
          if (k === 'properties') Object.values(v as object).forEach(walk);
          else walk(v);
        }
      }
    };
    for (const role of ['reader', 'prosecutor', 'adjudicator'] as const) walk(roleOutputJsonSchema(role));
    expect([...keywords].sort()).toEqual(['additionalProperties', 'anyOf', 'const', 'enum', 'items', 'minItems', 'required', 'type']);
  });
});

describe('the envelope becomes the model content, or a named refusal', () => {
  it('P1 — a completed message yields the text block verbatim; several text blocks are joined; thinking blocks are ignored', () => {
    const text = JSON.stringify(stubReaderOutput());
    expect(ANTHROPIC_MESSAGES_ADAPTER.projectResponse(envelope({}, text), request())).toBe(text);
    const split = envelope({ content: [{ type: 'thinking', thinking: '', signature: 's' }, { type: 'text', text: text.slice(0, 10) }, { type: 'text', text: text.slice(10) }] });
    expect(ANTHROPIC_MESSAGES_ADAPTER.projectResponse(split, request())).toBe(text);
  });

  it('P2 — an output truncated at the ceiling is refused, never published as a partial answer', () => {
    const truncated = envelope({ stop_reason: 'max_tokens' }, '{"elements": [');
    expect(() => ANTHROPIC_MESSAGES_ADAPTER.projectResponse(truncated, request())).toThrow(ProviderOutputTruncatedError);
    expect(() => ANTHROPIC_MESSAGES_ADAPTER.projectResponse(truncated, request())).toThrow(/reader\[0\].*max_tokens/);
  });

  it('P3 — a refusal is refused by name with its category, and any text it carries is not treated as the answer', () => {
    const refused = envelope({ stop_reason: 'refusal', stop_details: { type: 'refusal', category: 'cyber', explanation: 'x' } }, '{"elements":[],"gaps":[]}');
    expect(() => ANTHROPIC_MESSAGES_ADAPTER.projectResponse(refused, request())).toThrow(ProviderRefusalError);
    expect(() => ANTHROPIC_MESSAGES_ADAPTER.projectResponse(refused, request())).toThrow(/cyber/);
  });

  it('P4 — an error envelope is refused with its type and request id, and a stop this pipeline cannot use is refused too', () => {
    const error = JSON.stringify({ type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' }, request_id: 'req_123' });
    expect(() => ANTHROPIC_MESSAGES_ADAPTER.projectResponse(error, request())).toThrow(ProviderResponseError);
    expect(() => ANTHROPIC_MESSAGES_ADAPTER.projectResponse(error, request())).toThrow(/overloaded_error.*req_123/);
    for (const stop of ['tool_use', 'pause_turn', 'stop_sequence']) {
      expect(() => ANTHROPIC_MESSAGES_ADAPTER.projectResponse(envelope({ stop_reason: stop }), request()), stop).toThrow(new RegExp(stop));
    }
  });

  it('P5 — a malformed envelope is refused: not JSON, not a message, no text block, missing stop reason', () => {
    for (const body of ['not json', JSON.stringify({ type: 'completion', completion: '{}' }), envelope({ content: [] }), envelope({ stop_reason: undefined }), envelope({ content: 'x' })]) {
      expect(() => ANTHROPIC_MESSAGES_ADAPTER.projectResponse(body, request()), body.slice(0, 30)).toThrow(MalformedProviderEnvelopeError);
    }
  });

  it('P7 — mixed valid and malformed content is refused whole, never projected in part', () => {
    const mixed = envelope({ content: [{ type: 'text', text: JSON.stringify(stubReaderOutput()) }, { type: 'text', text: 42 }] });
    expect(() => ANTHROPIC_MESSAGES_ADAPTER.projectResponse(mixed, request())).toThrow(MalformedProviderEnvelopeError);
    expect(() => ANTHROPIC_MESSAGES_ADAPTER.projectResponse(mixed, request())).toThrow(/content\[1\]/);
    const unsupported = envelope({ content: [{ type: 'text', text: '{}' }, { type: 'tool_use', id: 't', name: 'n', input: {} }] });
    expect(() => ANTHROPIC_MESSAGES_ADAPTER.projectResponse(unsupported, request())).toThrow(/tool_use/);
    const badThinking = envelope({ content: [{ type: 'thinking', thinking: 7 }, { type: 'text', text: '{}' }] });
    expect(() => ANTHROPIC_MESSAGES_ADAPTER.projectResponse(badThinking, request())).toThrow(MalformedProviderEnvelopeError);
    // Positive control: the expected forms, thinking then text, project cleanly.
    const valid = envelope({ content: [{ type: 'thinking', thinking: '', signature: 's' }, { type: 'redacted_thinking', data: 'x' }, { type: 'text', text: '{"a":1}' }] });
    expect(ANTHROPIC_MESSAGES_ADAPTER.projectResponse(valid, request())).toBe('{"a":1}');
  });

  it('P6 — the seam remains authoritative: content that satisfies the provider but not the local schema is refused there, not here', () => {
    const wrong = envelope({}, JSON.stringify({ elements: [], gaps: [], extra: 1 }));
    const content = ANTHROPIC_MESSAGES_ADAPTER.projectResponse(wrong, request());
    expect(() => parseRoleOutput('reader', 0, JSON.parse(content))).toThrow(/extra/);
  });
});

describe('usage is read from the envelope, or reported unknown', () => {
  it('U1 — integer usage fields are read; absent cache fields are null, not zero', () => {
    const body = envelope({ usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 3 } });
    expect(ANTHROPIC_MESSAGES_ADAPTER.readUsage!(body)).toEqual({ inputTokens: 10, outputTokens: 5, cacheCreationInputTokens: null, cacheReadInputTokens: 3 });
  });

  it('U2 — a missing, partial, non-integer or non-JSON usage is unknown, never zero', () => {
    expect(ANTHROPIC_MESSAGES_ADAPTER.readUsage!(envelope({ usage: undefined }))).toBeNull();
    expect(ANTHROPIC_MESSAGES_ADAPTER.readUsage!(envelope({ usage: { input_tokens: 10 } }))).toBeNull();
    expect(ANTHROPIC_MESSAGES_ADAPTER.readUsage!(envelope({ usage: { input_tokens: '10', output_tokens: 5 } }))).toBeNull();
    expect(ANTHROPIC_MESSAGES_ADAPTER.readUsage!(envelope({ usage: { input_tokens: 1.5, output_tokens: 5 } }))).toBeNull();
    expect(ANTHROPIC_MESSAGES_ADAPTER.readUsage!('not json')).toBeNull();
  });
});
