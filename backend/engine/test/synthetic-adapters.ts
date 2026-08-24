/**
 * Two offline provider adapters that disagree about one envelope.
 *
 * **No real provider is chosen here.** These speak a made-up protocol against a
 * made-up envelope, and neither performs I/O — `buildRequest` returns a
 * description and nothing sends it. What they exist to demonstrate is the thing
 * that made adapter identity a `pipelineVersion` input rather than provenance:
 *
 * ```text
 * one envelope   {"content":[{"text":"A"},{"text":"B"}]}
 *
 * v1             content[0].text            ->  'A'
 * v2             join every text block      ->  'AB'
 * ```
 *
 * The model invocation is identical. The *model's answer*, as the role boundary
 * receives it, is not. Two runs that agree on prompts, model, lens set, schema
 * and closure policy can therefore produce different dossiers, and the only
 * thing that distinguishes them is which adapter read the envelope. A pipeline
 * identity blind to that would let B3 benchmark `v1` and let a later run execute
 * `v2` under the promoted identity.
 *
 * `v2` is a *semantic* successor, not a refactor: every `(request, envelope)`
 * pair it is given maps to a different content string. That is exactly the
 * condition `provider-adapter.ts` states as requiring a version bump.
 */

import type { RoleRequest } from '../src/pipeline/roles';
import type {
  ProviderAdapter,
  ProviderEndpointConfig,
  ProviderHttpRequest,
} from '../src/pipeline/provider-adapter';

/** The made-up envelope both adapters read. */
export function syntheticEnvelope(parts: readonly string[]): string {
  return JSON.stringify({ content: parts.map((text) => ({ text })) });
}

function parts(body: string): string[] {
  const parsed = JSON.parse(body) as { content?: { text?: string }[] };
  return (parsed.content ?? []).map((block) => block.text ?? '');
}

/** One request shape, shared, so the two adapters differ *only* in projection. */
function buildRequest(request: RoleRequest, config: ProviderEndpointConfig): ProviderHttpRequest {
  return {
    url: config.endpoint,
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-test-provider-key': config.apiKey },
    body: JSON.stringify({
      model: request.model,
      input: request.messages.map((message) => ({ from: message.from, text: message.content })),
    }),
  };
}

/** Reads the first content block only. */
export const SYNTHETIC_ADAPTER_V1: ProviderAdapter = {
  identity: { id: 'test-provider', version: '1' },
  buildRequest,
  projectResponse: (body) => parts(body)[0] ?? '',
};

/** Reads every content block, concatenated. A different answer, same envelope. */
export const SYNTHETIC_ADAPTER_V2: ProviderAdapter = {
  identity: { id: 'test-provider', version: '2' },
  buildRequest,
  projectResponse: (body) => parts(body).join(''),
};

/**
 * A third adapter claiming `v1`'s identity while behaving like `v2`.
 *
 * The aliasing failure the registry exists to refuse: an identity is what a
 * promotion is *about*, so two implementations answering to one identity would
 * make a promoted identity ambiguous. Never registered alongside `v1` outside
 * the test that proves the refusal.
 */
export const SYNTHETIC_ADAPTER_IMPOSTOR: ProviderAdapter = {
  identity: { id: 'test-provider', version: '1' },
  buildRequest,
  projectResponse: (body) => parts(body).join(''),
};
