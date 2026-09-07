/**
 * The Anthropic Messages adapter — the first concrete provider protocol.
 *
 * `provider-adapter.ts` defines the seam: a named, versioned adapter builds
 * the HTTP request for a canonical role request and projects the provider's
 * envelope back to the exact model-content string the role seam validates.
 * This module is one such adapter, `anthropic-messages@1`, speaking the
 * Messages API as its official reference states it on 2026-09-06:
 * `POST` to the named endpoint with `x-api-key`, `anthropic-version` and
 * `content-type`; a body of `model`, `max_tokens`, `system`, `messages`,
 * `thinking` and `output_config`; a response of `type: "message"` whose
 * `content` holds `text` blocks and whose `stop_reason` says how it ended.
 *
 * **Choices this identity fixes, and why.**
 *
 *  - *Non-streaming, bounded output.* A role answers with one JSON object of
 *    modest size, so `max_tokens` is 16 000 and the request is a single
 *    round trip. The reference asks for streaming on long-running requests,
 *    especially past ten minutes; at this ceiling a request is expected well
 *    inside that, and the live runner enforces its own timeout. Streaming is
 *    not adopted merely because an earlier draft named it; adopting it later
 *    would move this adapter's version.
 *  - *Adaptive thinking, high effort.* The reference's current form for
 *    Claude Opus 5; `budget_tokens` is rejected there and is not sent.
 *  - *Structured output as assistance, not authority.* `output_config.format`
 *    carries a JSON schema derived from the local role schema, so the
 *    provider's decoding is constrained to the shape the seam expects. The
 *    seam still parses and validates every response with the local zod
 *    schema; nothing here validates in the provider's terms, and no second
 *    result-validation path exists.
 *  - *No explicit prompt caching.* No `cache_control` is sent. That is a
 *    choice about this request, recorded here because the adapter's identity
 *    is a `pipelineVersion` input: adding caching is a change to what is sent
 *    and would move the version. It is not a claim about provider retention
 *    or data terms, which are a live-use prerequisite decided elsewhere.
 *
 * **Bounded, not proven fast.** The output ceiling bounds what is generated;
 * it does not prove a request completes inside the live runner's ten-minute
 * limit, which is an enforced local bound with no latency measured behind it.
 *
 * **A partial answer is never an answer.** `stop_reason: "max_tokens"` means
 * the output was cut at the ceiling; `"refusal"` means the model declined;
 * `"tool_use"`, `"pause_turn"` and `"stop_sequence"` cannot arise from a
 * request that sends no tools and no stop sequences. Each is refused by name
 * before the seam sees any text, so a truncated JSON prefix can never be
 * published as a role result. An `error` envelope is refused with its type
 * and request id.
 *
 * **The credential appears in one header.** It is never placed in the body,
 * never echoed into an error message, and never reaches the transcript, which
 * records the role's messages and the projected content only.
 *
 * **Usage is read, not trusted.** `readUsage` reports the envelope's `usage`
 * figures for the runner's attempt records and budget ledger. It reads only
 * integer fields and reports `null` — unknown — for anything else, because a
 * zero standing in for a missing figure would say "nothing was billed" with no
 * basis. Reading it changes neither the request nor the projection, so the
 * adapter's identity does not move.
 *
 * Pure: no filesystem, no clock, no network. The live runner performs the
 * request this module describes.
 */

import { z } from 'zod';
import type { ProviderAdapter, ProviderEndpointConfig, ProviderHttpRequest, ProviderAdapterIdentity, ProviderUsage } from './provider-adapter';
import { adjudicatorOutputSchema, prosecutorOutputSchema, readerOutputSchema } from './role-outputs';
import type { RoleName, RoleRequest } from './roles';

export const ANTHROPIC_MESSAGES_IDENTITY: ProviderAdapterIdentity = { id: 'anthropic-messages', version: '1' };
/** The API version header the reference names. */
export const ANTHROPIC_VERSION = '2023-06-01';
/** The output ceiling: one JSON object per role, well inside a non-streaming request's duration. */
export const MAX_OUTPUT_TOKENS = 16000;

// ---------------------------------------------------------------------------
// The provider's JSON-schema subset, derived from the local schema
// ---------------------------------------------------------------------------

/** A feature of the local schema the provider's subset cannot express. Refused, never dropped. */
export class UnsupportedSchemaFeatureError extends Error {
  constructor(readonly feature: string) {
    super(`the local role schema uses ${feature}, which the provider's structured-output subset does not support; the schema sent to the provider must describe exactly what the seam accepts, so this is refused rather than approximated`);
    this.name = 'UnsupportedSchemaFeatureError';
  }
}

type JsonSchema = Record<string, unknown>;

/**
 * Converts a zod schema to the provider's supported JSON-schema subset.
 *
 * Only the node kinds the role schemas use are handled, and every constraint
 * outside the subset the reference lists — array `minItems` above 1, string
 * lengths, numeric bounds, refinements, open objects — is refused by name.
 * A converter that silently dropped a constraint would send the provider a
 * looser shape than the seam accepts and call it the same schema.
 */
export function toProviderJsonSchema(schema: z.ZodTypeAny): JsonSchema {
  const def = schema._def as { typeName: string } & Record<string, unknown>;
  switch (def.typeName) {
    case 'ZodObject': {
      if (def['unknownKeys'] !== 'strict') throw new UnsupportedSchemaFeatureError('an object that is not .strict() (the provider requires additionalProperties: false)');
      const shape = (def['shape'] as () => Record<string, z.ZodTypeAny>)();
      const properties: Record<string, JsonSchema> = {};
      const required: string[] = [];
      for (const [key, value] of Object.entries(shape)) {
        const inner = value._def as { typeName: string; innerType?: z.ZodTypeAny };
        if (inner.typeName === 'ZodOptional') {
          properties[key] = toProviderJsonSchema(inner.innerType!);
        } else {
          properties[key] = toProviderJsonSchema(value);
          required.push(key);
        }
      }
      return { type: 'object', properties, required, additionalProperties: false };
    }
    case 'ZodArray': {
      const min = def['minLength'] as { value: number } | null;
      const max = def['maxLength'] as { value: number } | null;
      const exact = def['exactLength'] as { value: number } | null;
      if (max !== null) throw new UnsupportedSchemaFeatureError('an array maxItems');
      if (exact !== null) throw new UnsupportedSchemaFeatureError('an exact array length');
      if (min !== null && min.value > 1) throw new UnsupportedSchemaFeatureError(`an array minItems ${min.value} (only 0 and 1 are supported)`);
      const out: JsonSchema = { type: 'array', items: toProviderJsonSchema(def['type'] as z.ZodTypeAny) };
      if (min !== null && min.value === 1) out['minItems'] = 1;
      return out;
    }
    case 'ZodString': {
      for (const check of def['checks'] as Array<{ kind: string }>) {
        if (check.kind === 'min') throw new UnsupportedSchemaFeatureError('a string minLength');
        if (check.kind === 'max') throw new UnsupportedSchemaFeatureError('a string maxLength');
        throw new UnsupportedSchemaFeatureError(`a string ${check.kind} check`);
      }
      return { type: 'string' };
    }
    case 'ZodNumber': {
      let integer = false;
      for (const check of def['checks'] as Array<{ kind: string }>) {
        if (check.kind === 'int') integer = true;
        else if (check.kind === 'min') throw new UnsupportedSchemaFeatureError('a numeric minimum');
        else if (check.kind === 'max') throw new UnsupportedSchemaFeatureError('a numeric maximum');
        else throw new UnsupportedSchemaFeatureError(`a numeric ${check.kind} check`);
      }
      return { type: integer ? 'integer' : 'number' };
    }
    case 'ZodBoolean':
      return { type: 'boolean' };
    case 'ZodEnum':
      return { type: 'string', enum: [...(def['values'] as string[])] };
    case 'ZodLiteral':
      return { const: def['value'] };
    case 'ZodDiscriminatedUnion':
    case 'ZodUnion':
      return { anyOf: (def['options'] as z.ZodTypeAny[] | Map<unknown, z.ZodTypeAny>) instanceof Map
        ? [...(def['options'] as Map<unknown, z.ZodTypeAny>).values()].map(toProviderJsonSchema)
        : (def['options'] as z.ZodTypeAny[]).map(toProviderJsonSchema) };
    default:
      throw new UnsupportedSchemaFeatureError(`a ${def.typeName} node`);
  }
}

const ROLE_SCHEMAS = { reader: readerOutputSchema, prosecutor: prosecutorOutputSchema, adjudicator: adjudicatorOutputSchema } as const;

/** The structured-output schema for one role, derived from the seam's own schema. */
export function roleOutputJsonSchema(role: RoleName): JsonSchema {
  return toProviderJsonSchema(ROLE_SCHEMAS[role]);
}

// ---------------------------------------------------------------------------
// Refusals
// ---------------------------------------------------------------------------

function label(request: RoleRequest): string {
  return `${request.role}[${request.index}]`;
}

/** The provider answered with an `error` envelope, or a status the runner could not use. */
export class ProviderResponseError extends Error {
  constructor(
    readonly errorType: string,
    readonly detail: string,
    readonly requestId: string | null,
  ) {
    super(`the provider answered with ${errorType}${requestId === null ? '' : ` (request ${requestId})`}: ${detail}`);
    this.name = 'ProviderResponseError';
  }
}

/** The output hit the ceiling. What arrived is a prefix, and a prefix is not a role result. */
export class ProviderOutputTruncatedError extends Error {
  constructor(request: RoleRequest) {
    super(`${label(request)}: the model's output stopped at max_tokens (${MAX_OUTPUT_TOKENS}); the partial content is not published as a role result`);
    this.name = 'ProviderOutputTruncatedError';
  }
}

/** The model declined. Whatever text accompanies a refusal is not the answer to the request. */
export class ProviderRefusalError extends Error {
  constructor(request: RoleRequest, readonly category: string | null, readonly explanation: string | null) {
    super(`${label(request)}: the model refused (category ${category ?? 'unstated'})${explanation === null ? '' : ` — ${explanation}`}; a refusal is not a role result`);
    this.name = 'ProviderRefusalError';
  }
}

/** The body is not a message envelope this adapter can read. */
export class MalformedProviderEnvelopeError extends Error {
  constructor(request: RoleRequest, detail: string) {
    super(`${label(request)}: the provider's response is not a message envelope this adapter can read — ${detail}`);
    this.name = 'MalformedProviderEnvelopeError';
  }
}

// ---------------------------------------------------------------------------
// The adapter
// ---------------------------------------------------------------------------

function buildRequest(request: RoleRequest, config: ProviderEndpointConfig): ProviderHttpRequest {
  const prompt = request.messages.filter((m) => m.from === 'prompt');
  const input = request.messages.filter((m) => m.from === 'input');
  const other = request.messages.filter((m) => m.from !== 'prompt' && m.from !== 'input');
  if (other.length > 0) {
    throw new Error(`${label(request)}: a role request carries only a prompt and an input; it also carries ${other.map((m) => m.from).join(', ')}`);
  }
  if (prompt.length !== 1 || input.length !== 1) {
    throw new Error(`${label(request)}: a role request carries exactly one prompt and one input message; found ${prompt.length} prompt and ${input.length} input`);
  }
  const body = {
    model: request.model,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: prompt[0]!.content,
    messages: [{ role: 'user', content: input[0]!.content }],
    thinking: { type: 'adaptive' },
    output_config: { effort: 'high', format: { type: 'json_schema', schema: roleOutputJsonSchema(request.role) } },
  };
  return {
    url: config.endpoint,
    method: 'POST',
    headers: { 'content-type': 'application/json', 'anthropic-version': ANTHROPIC_VERSION, 'x-api-key': config.apiKey },
    body: JSON.stringify(body),
  };
}

/**
 * The content blocks this pipeline expects and nothing else: text, and the
 * thinking forms the reference describes. Every block is validated before any
 * is projected, so a malformed text block or an unsupported block type refuses
 * the whole response rather than being dropped while a valid neighbour is
 * published as the answer.
 */
const contentBlockSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string() }).passthrough(),
  z.object({ type: z.literal('thinking'), thinking: z.string() }).passthrough(),
  z.object({ type: z.literal('redacted_thinking'), data: z.string() }).passthrough(),
]);

/** `content[1].text`, so a refusal names the block it refused. */
function issuePath(path: (string | number)[]): string {
  if (path.length === 0) return '<root>';
  return path.map((segment, i) => (typeof segment === 'number' ? `[${segment}]` : i === 0 ? segment : `.${segment}`)).join('');
}

/** The value a path points at inside the parsed body, if the path exists. */
function valueAt(root: unknown, path: (string | number)[]): unknown {
  let current: unknown = root;
  for (const segment of path) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<string | number, unknown>)[segment];
  }
  return current;
}

/**
 * One validation issue, naming the position and — for a block of a type this
 * pipeline does not accept — the type the provider actually sent, so the
 * refusal says "content[1]: unsupported block type \"tool_use\"" rather than
 * only which types would have been accepted.
 */
function describeIssue(issue: z.ZodIssue, parsed: unknown): string {
  const where = issuePath(issue.path);
  if (issue.code === 'invalid_union_discriminator') {
    const received = valueAt(parsed, issue.path);
    return `${where}: unsupported block type ${JSON.stringify(received)} (${issue.message})`;
  }
  return `${where}: ${issue.message}`;
}

const envelopeSchema = z.object({
  type: z.literal('message'),
  content: z.array(contentBlockSchema),
  stop_reason: z.string(),
  stop_details: z.object({ category: z.string().nullable().optional(), explanation: z.string().nullable().optional() }).passthrough().nullable().optional(),
}).passthrough();

const errorEnvelopeSchema = z.object({
  type: z.literal('error'),
  error: z.object({ type: z.string(), message: z.string() }).passthrough(),
  request_id: z.string().optional(),
}).passthrough();

function projectResponse(body: string, request: RoleRequest): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (error) {
    throw new MalformedProviderEnvelopeError(request, `not JSON (${error instanceof Error ? error.message : String(error)})`);
  }
  const asError = errorEnvelopeSchema.safeParse(parsed);
  if (asError.success) {
    throw new ProviderResponseError(asError.data.error.type, asError.data.error.message, asError.data.request_id ?? null);
  }
  const envelope = envelopeSchema.safeParse(parsed);
  if (!envelope.success) {
    throw new MalformedProviderEnvelopeError(request, envelope.error.issues.map((issue) => describeIssue(issue, parsed)).join('; '));
  }
  const { stop_reason: stop, content } = envelope.data;
  if (stop === 'max_tokens') throw new ProviderOutputTruncatedError(request);
  if (stop === 'refusal') {
    const details = envelope.data.stop_details ?? null;
    throw new ProviderRefusalError(request, details?.category ?? null, details?.explanation ?? null);
  }
  if (stop !== 'end_turn') {
    throw new MalformedProviderEnvelopeError(request, `stop_reason ${stop} cannot arise from a request that sends no tools and no stop sequences, and its content is not a role result`);
  }
  const text = content.filter((block): block is { type: 'text'; text: string } => block.type === 'text').map((block) => block.text);
  if (text.length === 0) throw new MalformedProviderEnvelopeError(request, 'the message carries no text block');
  return text.join('');
}

/** A non-negative integer, or nothing: a string, a float or a negative number is not a count. */
function countOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

function readUsage(body: string): ProviderUsage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  const usage = (parsed as { usage?: unknown } | null)?.usage;
  if (usage === null || usage === undefined || typeof usage !== 'object') return null;
  const fields = usage as Record<string, unknown>;
  const inputTokens = countOrNull(fields['input_tokens']);
  const outputTokens = countOrNull(fields['output_tokens']);
  if (inputTokens === null || outputTokens === null) return null;
  return {
    inputTokens,
    outputTokens,
    cacheCreationInputTokens: countOrNull(fields['cache_creation_input_tokens']),
    cacheReadInputTokens: countOrNull(fields['cache_read_input_tokens']),
  };
}

export const ANTHROPIC_MESSAGES_ADAPTER: ProviderAdapter = {
  identity: ANTHROPIC_MESSAGES_IDENTITY,
  buildRequest,
  projectResponse,
  readUsage,
};
