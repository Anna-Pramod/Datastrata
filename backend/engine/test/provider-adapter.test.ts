/**
 * Provider semantics as pipeline identity.
 *
 * The claim under test is one sentence: **two runs that differ only in how a
 * provider's response envelope is read are two different pipelines.** Everything
 * here exists to make that mechanical rather than intended, and to keep the two
 * dimensions — which model answered, and which semantics read the answer —
 * independent of one another.
 *
 * No provider is chosen and nothing here performs I/O. The two adapters speak a
 * made-up protocol over a made-up envelope (`synthetic-adapters.ts`), and
 * `buildRequest` returns a description that nothing sends.
 */

import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  AgentCapabilityError,
  createLiveAgentRunner,
  LiveAgentRunner,
  MissingProviderAdapterError,
  LIVE_AGENTS_ENV,
  LIVE_AGENTS_TOKEN,
  type ProviderTransport,
} from '../src/pipeline/live-runner';
import { pipelineVersionFor, runVerificationPipeline } from '../src/pipeline/orchestrate';
import {
  assertValidInvocationIdentity,
  InvalidInvocationIdentityError,
  INVOCATION_EFFORTS,
  invocationDifferences,
  InvocationMismatchError,
  ProviderAdapterMismatchError,
  ProviderAdapterNotSelectedError,
  UnverifiedProviderAdapterError,
  type InvocationIdentity,
  type ProviderAdapterIdentity,
} from '../src/pipeline/provider-adapter';
import { CLAUDE_CODE_CLI_ADAPTER, CLAUDE_CODE_CLI_V2_ADAPTER, CLAUDE_CODE_CLI_V3_ADAPTER } from '../src/pipeline/claude-code-cli';
import type { RoleConfig } from '../src/pipeline/config';
import { RoleOutputError, RoleTransportError } from '../src/pipeline/roles';
import type { AgentRunner } from '../src/pipeline/runner';
import { installNetworkTrap } from './helpers';
import { replayRunner, TranscriptRunMismatchError } from '../src/pipeline/replay';
import { runTranscriptSchema } from '../src/pipeline/transcript';
import {
  fixtureAuthorisedCorpus,
  fixtureRenderContext,
  fixtureRequirement,
  lensFromRequest,
  stubAdjudicatorOutput,
  stubProsecutorOutput,
  stubReaderOutput,
  fixtureRegister,
} from './pipeline-fixtures';
import { EntitledClosure } from '../src/pipeline/entitlement';

import { CLOSURE_POLICY_V0 } from '../src/corpus/closure';
import { DEFAULT_ROLE_CONFIG } from '../src/pipeline/config';
import {
  buildPipelineIdentity,
  PIPELINE_IDENTITY_SCHEME,
  RESULT_SCHEMA_VERSION,
  type PipelineIdentityInput,
} from '../src/pipeline/identity';
import { loadPromptSet, promptHashes } from '../src/pipeline/prompts';
import {
  assertValidProviderAdapterIdentity,
  InvalidProviderAdapterIdentityError,
  isProviderAdapterSelected,
  providerAdapterKey,
  ProviderAdapterCollisionError,
  registerProviderAdapter,
  resolveProviderAdapter,
  UnknownProviderAdapterError,
  UNSELECTED_PROVIDER_ADAPTER,
  type ProviderAdapterRegistry,
} from '../src/pipeline/provider-adapter';
import type { RoleRequest } from '../src/pipeline/roles';
import {
  syntheticEnvelope,
  SYNTHETIC_ADAPTER_IMPOSTOR,
  SYNTHETIC_ADAPTER_V1,
  SYNTHETIC_ADAPTER_V2,
} from './synthetic-adapters';
import { fixtureSourceUniverse } from './pipeline-fixtures';
import { CLOSURE_RENDERER_VERSION } from '../src/pipeline/entitlement';

/**
 * The identity a fully-specified input hashes to, pinned.
 *
 * Derived once and written down, which is the point: a value the test computes
 * at run time from the function under test agrees with that function however
 * wrong it becomes. Every promotion record for a given identity is a claim about
 * this digest, so a change to it is a change to what a pipeline *is* — and
 * re-deriving this constant to make a red test green is the repair that retires
 * the test. It is a golden, and it is reviewed as one.
 */
/**
 * Re-derived at B-E2 (2026-09-05), deliberately. The previous value,
 * `pipeline-v2-869e7385634f69f8720d8ae386253b39a69b531fb68df466ea19de4d22d984ea`,
 * was taken under scheme `v2`; `v3` hashes the closure policy's `expansion`
 * rule and `closureRendererVersion` as well, so every identity moved and no
 * promotion record existed to invalidate. The fixed-function property this
 * golden protects is unchanged: the same declared inputs yield this string and
 * nothing about deployment enters it.
 */
const GOLDEN_IDENTITY =
  'pipeline-v3-1d566c9903cb90711e3e52750460759d4c87a5900765d4349c61eca37e285b7c';

/**
 * The input `GOLDEN_IDENTITY` is taken over, as the golden case below writes
 * it: every value a literal. It declares no invocation, so the golden is the
 * absent-invocation case (plan 2026-09-25, Task 3).
 */
function goldenInput(): PipelineIdentityInput {
  return {
    promptSha256: { reader: 'r'.repeat(64), prosecutor: 'p'.repeat(64), adjudicator: 'a'.repeat(64) },
    models: { reader: 'm-r', prosecutor: 'm-p', adjudicator: 'm-a' },
    roleConfig: { prosecutorCount: 2, lenses: ['l1', 'l2'], order: ['reader', 'prosecutor', 'adjudicator'] },
    resultSchemaVersion: '1.3.0',
    closureRendererVersion: '1.0.0',
    providerAdapter: { id: 'test-provider', version: '1' },
    closurePolicy: CLOSURE_POLICY_V0,
  };
}

/**
 * `claude-code-cli@2`'s invocation, written out (plan 2026-09-25, D-3 to D-5).
 * A literal, never read off the `@2` profile or adapter: an expectation
 * computed from the profile agrees with the profile however wrong it becomes.
 */
const INVOCATION_V2: InvocationIdentity = {
  effort: 'high',
  maxOutputTokens: 64000,
  executable: { version: '2.1.295', sha256: '494870c9763b5ea370b6165e7e04af589a7b2472bf0de18ffb25477f8230bdf6' },
  // The thirteen launch controls, keys sorted (the spend controls' identity extension).
  controls: {
    CLAUDE_CODE_DISABLE_FAST_MODE: '1',
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    CLAUDE_CODE_DISABLE_NONSTREAMING_FALLBACK: '1',
    CLAUDE_CODE_DISABLE_REFUSAL_FALLBACK: '1',
    CLAUDE_CODE_DISABLE_REFUSAL_RETRY: '1',
    CLAUDE_CODE_DISABLE_STRUCTURED_OUTPUTS: '1',
    CLAUDE_CODE_MAX_OUTPUT_TOKENS: '64000',
    CLAUDE_CODE_MAX_RETRIES: '0',
    CLAUDE_CODE_NO_MODEL_FALLBACK: '1',
    DISABLE_AUTOUPDATER: '1',
    DISABLE_ERROR_REPORTING: '1',
    DISABLE_TELEMETRY: '1',
    MAX_STRUCTURED_OUTPUT_RETRIES: '0',
  },
};

/** `claude-code-cli@3`'s invocation, written out: `@2`'s above and the permission mode it requests. */
const INVOCATION_V3: InvocationIdentity = { ...INVOCATION_V2, permissionMode: 'default' };

/** `INVOCATION_V2`'s controls as a mismatch message shows them: `NAME=value`, sorted, written out. */
const INVOCATION_V2_CONTROLS_SHOWN =
  '[CLAUDE_CODE_DISABLE_FAST_MODE=1, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1, CLAUDE_CODE_DISABLE_NONSTREAMING_FALLBACK=1, ' +
  'CLAUDE_CODE_DISABLE_REFUSAL_FALLBACK=1, CLAUDE_CODE_DISABLE_REFUSAL_RETRY=1, CLAUDE_CODE_DISABLE_STRUCTURED_OUTPUTS=1, ' +
  'CLAUDE_CODE_MAX_OUTPUT_TOKENS=64000, CLAUDE_CODE_MAX_RETRIES=0, CLAUDE_CODE_NO_MODEL_FALLBACK=1, DISABLE_AUTOUPDATER=1, ' +
  'DISABLE_ERROR_REPORTING=1, DISABLE_TELEMETRY=1, MAX_STRUCTURED_OUTPUT_RETRIES=0]';

/**
 * The invocation `GOLDEN_IDENTITY_WITH_INVOCATION` was taken over: `@2`'s as
 * this file declared it on 2026-09-25, pinned at 2.1.280. Test-local data,
 * kept when `@2`'s pin moved to 2.1.295 (2026-10-15): the golden is an
 * encoding test, one fixed input and its digest, and states nothing about
 * which executable `@2` pins, which `INVOCATION_V2` states.
 */
const GOLDEN_INVOCATION: InvocationIdentity = {
  effort: 'high',
  maxOutputTokens: 64000,
  executable: { version: '2.1.280', sha256: '862db5f39398606acd531777565505e14c792b9da72fd31df0b309b8eb55406e' },
};

/**
 * `goldenInput()` with `GOLDEN_INVOCATION` declared: the present-invocation
 * golden.
 *
 * Taken on 2026-09-25 by a placeholder run of `buildPipelineIdentity`, and
 * held to account by `handWrittenIdentity` below, which derives the same
 * string without `identityPayload`, `canonicalJson` or `sha256Hex` and
 * reproduces `GOLDEN_IDENTITY` when the invocation is left off. Re-deriving
 * it to make a red test green is the repair that retires it; it is reviewed
 * as a golden.
 */
const GOLDEN_IDENTITY_WITH_INVOCATION =
  'pipeline-v3-002ec70e66b27d39ffb742112ec22d5b96812221b4012ffc8bb5fdece59f4237';

/**
 * The identity, derived without the code under test.
 *
 * The canonical payload is written out by hand — keys in sorted order, no
 * whitespace, each field placed explicitly — and hashed with `node:crypto`.
 * Nothing here calls `identityPayload`, `canonicalJson` or `sha256Hex`, so a
 * defect in any of them (a key emitted as `null`, a field left out, the
 * declared object spread wholesale) cannot be reproduced here by agreement.
 * Only the four declared invocation fields are written, and the launch
 * controls where the invocation declares them, which is the rule the
 * builder is held to. The controls go first inside the invocation
 * ("controls" sorts before "effort"), each entry in the literal's own key
 * order: nothing here sorts them, so a literal is written with its keys
 * sorted by hand.
 */
function handWrittenIdentity(input: PipelineIdentityInput): string {
  const q = (value: string): string => JSON.stringify(value);
  const list = (values: readonly string[]): string => `[${values.map(q).join(',')}]`;
  const policy = input.closurePolicy;
  const invocation = input.invocation;
  const controls = invocation?.controls;
  const json =
    `{"closurePolicy":{"expansion":${q(policy.expansion)},"referenceDepth":${policy.referenceDepth},` +
    `"referenceKinds":${list(policy.referenceKinds)},"structuralKinds":${list(policy.structuralKinds)}},` +
    `"closureRendererVersion":${q(input.closureRendererVersion)},` +
    (invocation === undefined
      ? ''
      : '"invocation":{' +
        (controls === undefined ? '' : `"controls":{${Object.entries(controls).map(([name, value]) => `${q(name)}:${q(value)}`).join(',')}},`) +
        `"effort":${q(invocation.effort)},"executable":{"sha256":${q(invocation.executable.sha256)},` +
        `"version":${q(invocation.executable.version)}},"maxOutputTokens":${invocation.maxOutputTokens}},`) +
    `"models":{"adjudicator":${q(input.models.adjudicator)},"prosecutor":${q(input.models.prosecutor)},"reader":${q(input.models.reader)}},` +
    `"prompts":{"adjudicator":${q(input.promptSha256.adjudicator)},"prosecutor":${q(input.promptSha256.prosecutor)},"reader":${q(input.promptSha256.reader)}},` +
    `"providerAdapter":{"id":${q(input.providerAdapter.id)},"version":${q(input.providerAdapter.version)}},` +
    `"resultSchemaVersion":${q(input.resultSchemaVersion)},` +
    `"roleConfig":{"lenses":${list(input.roleConfig.lenses)},"order":${list(input.roleConfig.order)},"prosecutorCount":${input.roleConfig.prosecutorCount}},` +
    `"scheme":"v3"}`;
  return `pipeline-v3-${createHash('sha256').update(json, 'utf8').digest('hex')}`;
}

/** What an act threw, or `undefined` when it threw nothing. */
function thrownBy(act: () => unknown): unknown {
  try {
    act();
  } catch (error) {
    return error;
  }
  return undefined;
}

const prompts = loadPromptSet();
const corpus = fixtureAuthorisedCorpus();

/** One prosecutor, so a run needs three exchanges rather than five. */
const SINGLE_PROSECUTOR = { ...DEFAULT_ROLE_CONFIG, prosecutorCount: 1 };

/** Everything a run needs except its configuration and its capability. */
function pipelineInput() {
  return {
    packId: 'testpack',
    requirementId: 'TEST-R-001',
    requirement: fixtureRequirement(),
    renderContext: fixtureRenderContext(),
    closure: EntitledClosure.forSources(corpus, fixtureRegister(), fixtureSourceUniverse(), ['SRC-100']),
    corpus,
    prompts,
  };
}

function baseline(): PipelineIdentityInput {
  return {
    promptSha256: promptHashes(prompts),
    models: DEFAULT_ROLE_CONFIG.models,
    roleConfig: {
      prosecutorCount: DEFAULT_ROLE_CONFIG.prosecutorCount,
      lenses: DEFAULT_ROLE_CONFIG.lenses,
      order: DEFAULT_ROLE_CONFIG.order,
    },
    resultSchemaVersion: RESULT_SCHEMA_VERSION,
    closureRendererVersion: CLOSURE_RENDERER_VERSION,
    providerAdapter: SYNTHETIC_ADAPTER_V1.identity,
    closurePolicy: CLOSURE_POLICY_V0,
  };
}

function roleRequest(): RoleRequest {
  return {
    role: 'reader',
    index: 0,
    model: 'test-model',
    promptSha256: 'a'.repeat(64),
    messages: [{ from: 'prompt', content: 'p' }, { from: 'input', content: 'i' }],
  };
}

// ---------------------------------------------------------------------------
// The reason this is identity and not provenance
// ---------------------------------------------------------------------------

describe('two readings of one envelope', () => {
  const ENVELOPE = syntheticEnvelope(['A', 'B']);

  it('disagree about what the model actually answered', () => {
    // Stated first and separately, because everything below is only interesting
    // if this is true. Same bytes off the wire, two different role inputs.
    expect(SYNTHETIC_ADAPTER_V1.projectResponse(ENVELOPE, roleRequest())).toBe('A');
    expect(SYNTHETIC_ADAPTER_V2.projectResponse(ENVELOPE, roleRequest())).toBe('AB');
  });

  it('and therefore are two different pipelines', () => {
    const withV1 = buildPipelineIdentity({
      ...baseline(),
      providerAdapter: SYNTHETIC_ADAPTER_V1.identity,
    });
    const withV2 = buildPipelineIdentity({
      ...baseline(),
      providerAdapter: SYNTHETIC_ADAPTER_V2.identity,
    });
    // Everything else is identical — prompts, models, lens set, count, order,
    // schema version, closure policy. Only the reading moved.
    expect(withV2).not.toBe(withV1);
  });

  it('the version alone is enough to move it, with the id unchanged', () => {
    // The narrower claim, because `test-provider@1` and `test-provider@2` share
    // an id: an identity that hashed only the id would pass the test above only
    // if the ids differed, and would silently alias every version bump.
    expect(SYNTHETIC_ADAPTER_V1.identity.id).toBe(SYNTHETIC_ADAPTER_V2.identity.id);
    expect(
      buildPipelineIdentity({ ...baseline(), providerAdapter: { id: 'test-provider', version: '2' } }),
    ).not.toBe(
      buildPipelineIdentity({ ...baseline(), providerAdapter: { id: 'test-provider', version: '1' } }),
    );
  });

  it('the id alone is enough to move it, with the version unchanged', () => {
    expect(
      buildPipelineIdentity({ ...baseline(), providerAdapter: { id: 'other-provider', version: '1' } }),
    ).not.toBe(
      buildPipelineIdentity({ ...baseline(), providerAdapter: { id: 'test-provider', version: '1' } }),
    );
  });

  it('and varying nothing leaves it byte-identical', () => {
    // The control. Without it, "the identity moved" would be satisfied by a
    // builder that produced a different value on every call.
    expect(buildPipelineIdentity(baseline())).toBe(buildPipelineIdentity(baseline()));
  });
});

// ---------------------------------------------------------------------------
// Two independent dimensions
// ---------------------------------------------------------------------------

describe('model identity and adapter identity are independent', () => {
  it('same adapter, different model — different pipeline', () => {
    const before = buildPipelineIdentity(baseline());
    const after = buildPipelineIdentity({
      ...baseline(),
      models: { ...DEFAULT_ROLE_CONFIG.models, reader: 'a-different-model' },
    });
    expect(after).not.toBe(before);
  });

  it('same model, different adapter semantics — different pipeline', () => {
    const before = buildPipelineIdentity(baseline());
    const after = buildPipelineIdentity({
      ...baseline(),
      providerAdapter: SYNTHETIC_ADAPTER_V2.identity,
    });
    expect(after).not.toBe(before);
  });

  it('neither is derivable from the other: all four combinations are distinct', () => {
    const identities = new Set<string>();
    for (const model of ['model-x', 'model-y']) {
      for (const adapter of [SYNTHETIC_ADAPTER_V1.identity, SYNTHETIC_ADAPTER_V2.identity]) {
        identities.add(
          buildPipelineIdentity({
            ...baseline(),
            models: { reader: model, prosecutor: model, adjudicator: model },
            providerAdapter: adapter,
          }),
        );
      }
    }
    // Four, not two: an identity that folded one dimension into the other, or
    // ignored one, would collapse this set.
    expect(identities.size).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Semantics versus deployment
// ---------------------------------------------------------------------------

describe('deployment configuration is not verification semantics', () => {
  it('the digest is a fixed function of the declared inputs, and of nothing else', () => {
    // A **golden over the hashed payload**, and the only assertion here with
    // teeth against the payload gaining a field.
    //
    // The version this replaced inspected `Object.keys(baseline())` — the test
    // file's own literal — and claimed to be structural. It was not: adding
    // `endpoint` and `apiKey` to `PipelineIdentityInput` *and hashing both*
    // left it green, because it never consulted the type or the payload.
    //
    // Changing this digest is a deliberate identity change: every promotion
    // record for the old value stops matching. Re-deriving it to make this test
    // pass is exactly the repair that would retire it, so a change here must be
    // reviewed as a change to what a pipeline *is*.
    expect(
      buildPipelineIdentity({
        promptSha256: { reader: 'r'.repeat(64), prosecutor: 'p'.repeat(64), adjudicator: 'a'.repeat(64) },
        models: { reader: 'm-r', prosecutor: 'm-p', adjudicator: 'm-a' },
        roleConfig: { prosecutorCount: 2, lenses: ['l1', 'l2'], order: ['reader', 'prosecutor', 'adjudicator'] },
        resultSchemaVersion: '1.3.0',
        closureRendererVersion: '1.0.0',
        providerAdapter: { id: 'test-provider', version: '1' },
        closurePolicy: CLOSURE_POLICY_V0,
      }),
    ).toBe(GOLDEN_IDENTITY);
  });

  it('a field nobody declared cannot reach the digest by being present on the input', () => {
    // The complementary tooth: `identityPayload` names its fields one by one
    // rather than spreading, so an object carrying extra properties hashes the
    // same as one without them. A payload built by spreading would fail this.
    const clean = baseline();
    const smuggled = {
      ...clean,
      endpoint: 'https://a-host.invalid/v1',
      apiKey: 'sk-should-never-be-hashed',
      requestId: 'req-12345',
    } as unknown as PipelineIdentityInput;
    expect(buildPipelineIdentity(smuggled)).toBe(buildPipelineIdentity(clean));
  });

  it('one adapter serves two endpoints as one pipeline', () => {
    // The behavioural half: the same adapter builds requests for two hosts, and
    // the identity is the adapter's, so routing changes nothing about which
    // pipeline this is.
    const a = SYNTHETIC_ADAPTER_V1.buildRequest(roleRequest(), {
      endpoint: 'https://one.invalid/v1',
      apiKey: 'k1',
    });
    const b = SYNTHETIC_ADAPTER_V1.buildRequest(roleRequest(), {
      endpoint: 'https://two.invalid/v1',
      apiKey: 'k2',
    });
    expect(a.url).not.toBe(b.url);
    expect(a.body).toBe(b.body);
    expect(buildPipelineIdentity(baseline())).toBe(buildPipelineIdentity(baseline()));
  });

  it('an identity that could be read two ways is refused before it is hashed', () => {
    // Wired into the identity path, not only into registration: without this,
    // `{id:' x '}` and `{id:'x'}` are two pipelines that a human reading a
    // ledger would call one.
    expect(() =>
      pipelineVersionFor({
        prompts,
        config: { ...SINGLE_PROSECUTOR, providerAdapter: { id: ' test-provider ', version: '1' } },
        closure: EntitledClosure.forSources(corpus, fixtureRegister(), fixtureSourceUniverse(), ['SRC-100']),
      }),
    ).toThrow(InvalidProviderAdapterIdentityError);
    // Control: the same call with a clean identity produces one.
    expect(
      pipelineVersionFor({
        prompts,
        config: { ...SINGLE_PROSECUTOR, providerAdapter: SYNTHETIC_ADAPTER_V1.identity },
        closure: EntitledClosure.forSources(corpus, fixtureRegister(), fixtureSourceUniverse(), ['SRC-100']),
      }),
    ).toMatch(new RegExp(`^pipeline-${PIPELINE_IDENTITY_SCHEME}-[0-9a-f]{64}$`));
  });

  it('no secret reaches the digest, because no secret reaches the input', () => {
    const identity = buildPipelineIdentity({
      ...baseline(),
      providerAdapter: { id: 'test-provider', version: '1' },
    });
    expect(identity).toMatch(new RegExp(`^pipeline-${PIPELINE_IDENTITY_SCHEME}-[0-9a-f]{64}$`));
    // A digest is 64 hex characters and carries nothing recoverable; the claim
    // that matters is the structural one above. Labelled: this assertion is a
    // shape check, not evidence about secrecy.
  });
});

// ---------------------------------------------------------------------------
// The invocation, where an adapter declares one (plan 2026-09-25, Task 3)
// ---------------------------------------------------------------------------

describe('a declared invocation is part of the identity, and absence is no key at all', () => {
  it('the hand-written payload reproduces GOLDEN_IDENTITY without an invocation', () => {
    // The hand-writer's positive control: it agrees with the golden the
    // builder has been held to since B-E2, over the golden's own input, so its
    // derivation of the present case below is worth believing.
    expect(buildPipelineIdentity(goldenInput())).toBe(GOLDEN_IDENTITY);
    expect(handWrittenIdentity(goldenInput())).toBe(GOLDEN_IDENTITY);
  });

  it('with GOLDEN_INVOCATION declared, the hand-written payload is the present-invocation golden', () => {
    expect(handWrittenIdentity({ ...goldenInput(), invocation: GOLDEN_INVOCATION })).toBe(
      GOLDEN_IDENTITY_WITH_INVOCATION,
    );
    // Two literals: no src/ defect can red this line; the builder cases carry the evidence.
    expect(GOLDEN_IDENTITY_WITH_INVOCATION).not.toBe(GOLDEN_IDENTITY);
  });

  it('and the builder derives the same literal', () => {
    expect(buildPipelineIdentity({ ...goldenInput(), invocation: GOLDEN_INVOCATION })).toBe(
      GOLDEN_IDENTITY_WITH_INVOCATION,
    );
  });

  it('over the suite baseline, with the real prompt hashes, the builder and the hand-written payload agree too', () => {
    // A second input, so an agreement over the golden's input alone cannot be
    // a coincidence of the values it happens to hold.
    const present = { ...baseline(), invocation: INVOCATION_V2 };
    expect(buildPipelineIdentity(present)).toBe(handWrittenIdentity(present));
    expect(buildPipelineIdentity(present)).not.toBe(buildPipelineIdentity(baseline()));
  });

  it('an invocation explicitly undefined is the absent case: the golden does not move', () => {
    const input: PipelineIdentityInput = { ...goldenInput(), invocation: undefined };
    // The key is really on the object, so this is not the absent case by
    // construction.
    expect('invocation' in input).toBe(true);
    expect(buildPipelineIdentity(input)).toBe(GOLDEN_IDENTITY);
  });

  it.each([
    ['effort', { ...GOLDEN_INVOCATION, effort: 'medium' }],
    ['maxOutputTokens', { ...GOLDEN_INVOCATION, maxOutputTokens: 63999 }],
    ['executable.version', { ...GOLDEN_INVOCATION, executable: { ...GOLDEN_INVOCATION.executable, version: '2.1.281' } }],
    [
      'executable.sha256',
      {
        ...GOLDEN_INVOCATION,
        executable: { ...GOLDEN_INVOCATION.executable, sha256: '862db5f39398606acd531777565505e14c792b9da72fd31df0b309b8eb55406f' },
      },
    ],
  ] as const)('moves when %s alone moves', (_field, moved) => {
    // Against the builder's own digest of the unmoved invocation, not only the
    // literal: a field dropped from the payload moves every present digest
    // away from the literal, so "differs from the literal" would hold against
    // exactly the defect this case is for (observed: Task 3 teeth T12, first
    // run). Two digests from one builder that differ in this field alone are
    // what show the field is hashed.
    const unmoved = buildPipelineIdentity({ ...goldenInput(), invocation: GOLDEN_INVOCATION });
    const identity = buildPipelineIdentity({ ...goldenInput(), invocation: moved });
    expect(identity).not.toBe(unmoved);
    expect(identity).not.toBe(GOLDEN_IDENTITY_WITH_INVOCATION);
  });

  it('an extra key inside the executable does not reach the digest', () => {
    // Field-by-field emission: a path is deployment, and a payload that
    // spread the declared object would hash it.
    const withPath = {
      ...GOLDEN_INVOCATION,
      executable: { ...GOLDEN_INVOCATION.executable, path: '/Users/someone/Library/claude' },
    } as InvocationIdentity;
    expect(buildPipelineIdentity({ ...goldenInput(), invocation: withPath })).toBe(GOLDEN_IDENTITY_WITH_INVOCATION);
  });

  it('an extra key beside the invocation fields does not reach the digest', () => {
    const withChannel = { ...GOLDEN_INVOCATION, channel: 'process' } as InvocationIdentity;
    expect(buildPipelineIdentity({ ...goldenInput(), invocation: withChannel })).toBe(
      GOLDEN_IDENTITY_WITH_INVOCATION,
    );
  });
});

describe('a declared invocation must be usable as one', () => {
  const SHORT_SHA = '862db5f39398606acd531777565505e14c792b9da72fd31df0b309b8eb55406';
  const UPPER_SHA = '862DB5F39398606ACD531777565505E14C792B9DA72FD31DF0B309B8EB55406E';
  const NON_HEX_SHA = '862db5f39398606acd531777565505e14c792b9da72fd31df0b309b8eb55406g';
  const withExecutable = (executable: unknown): unknown => ({ ...INVOCATION_V2, executable });
  const withControls = (controls: unknown): unknown => ({ ...INVOCATION_V2, controls });

  it('accepts the @2 literal', () => {
    expect(() => assertValidInvocationIdentity(INVOCATION_V2)).not.toThrow();
  });

  it('accepts a valid control map, and an invocation declaring none at all or declaring it undefined (the positive controls for the controls rows below)', () => {
    // The @2 literal above carries the thirteen; one entry, digits and underscores in the name, and an empty value are valid too.
    expect(() => assertValidInvocationIdentity(withControls({ CLAUDE_CODE_MAX_RETRIES: '0', A1_B: '' }))).not.toThrow();
    const { controls: _removed, ...none } = INVOCATION_V2;
    expect('controls' in none).toBe(false);
    expect(() => assertValidInvocationIdentity(none)).not.toThrow();
    expect(() => assertValidInvocationIdentity(withControls(undefined))).not.toThrow();
  });

  it('accepts the invocation the @2 adapter actually declares', () => {
    // The link between the effort set and the adapter: a set that lost the
    // effort `@2` passes would refuse `@2`'s own declaration here.
    expect(CLAUDE_CODE_CLI_V2_ADAPTER.invocation).toBeDefined();
    expect(() => assertValidInvocationIdentity(CLAUDE_CODE_CLI_V2_ADAPTER.invocation)).not.toThrow();
  });

  it('accepts a permission mode of exactly "default", and the invocation the @3 adapter actually declares (the positive controls for the permission-mode rows below)', () => {
    expect(() => assertValidInvocationIdentity(INVOCATION_V3)).not.toThrow();
    expect(CLAUDE_CODE_CLI_V3_ADAPTER.invocation).toEqual(INVOCATION_V3);
    expect(() => assertValidInvocationIdentity(CLAUDE_CODE_CLI_V3_ADAPTER.invocation)).not.toThrow();
    // Absent, as @2 declares it, is accepted too: the mode is checked only when defined.
    expect('permissionMode' in INVOCATION_V2).toBe(false);
    expect(() => assertValidInvocationIdentity({ ...INVOCATION_V2, permissionMode: undefined })).not.toThrow();
  });

  it('the effort set is exactly the one effort a registered adapter passes, and cannot be edited in place', () => {
    // When a second effort is registered, the orchestration effort row must
    // return as an InvocationMismatchError case (see 'refuses a live
    // capability differing in effort alone, as an effort no registered adapter
    // passes' and the direct comparison case).
    expect(INVOCATION_EFFORTS).toEqual(['high']);
    expect(Object.isFrozen(INVOCATION_EFFORTS)).toBe(true);
  });

  it.each([
    ['a sha256 of the wrong length', withExecutable({ version: '2.1.280', sha256: SHORT_SHA }), [`executable.sha256 "${SHORT_SHA}" is not 64 lowercase hex characters`]],
    ['an uppercase sha256', withExecutable({ version: '2.1.280', sha256: UPPER_SHA }), [`executable.sha256 "${UPPER_SHA}" is not 64 lowercase hex characters`]],
    ['a non-hex sha256', withExecutable({ version: '2.1.280', sha256: NON_HEX_SHA }), [`executable.sha256 "${NON_HEX_SHA}" is not 64 lowercase hex characters`]],
    ['a ceiling of 0', { ...INVOCATION_V2, maxOutputTokens: 0 }, ['maxOutputTokens 0 is not a positive safe integer']],
    ['a ceiling of -1', { ...INVOCATION_V2, maxOutputTokens: -1 }, ['maxOutputTokens -1 is not a positive safe integer']],
    ['a ceiling of 1.5', { ...INVOCATION_V2, maxOutputTokens: 1.5 }, ['maxOutputTokens 1.5 is not a positive safe integer']],
    [
      'a ceiling past the safe integers',
      { ...INVOCATION_V2, maxOutputTokens: Number.MAX_SAFE_INTEGER + 1 },
      ['maxOutputTokens 9007199254740992 is not a positive safe integer'],
    ],
    ['a ceiling of NaN', { ...INVOCATION_V2, maxOutputTokens: Number.NaN }, ['maxOutputTokens NaN is not a positive safe integer']],
    ['a ceiling written as a string', { ...INVOCATION_V2, maxOutputTokens: '64000' }, ['maxOutputTokens "64000" is not a positive safe integer']],
    ['an empty version', withExecutable({ version: '', sha256: INVOCATION_V2.executable.sha256 }), ['executable.version is empty']],
    [
      'a version with surrounding whitespace',
      withExecutable({ version: ' 2.1.280', sha256: INVOCATION_V2.executable.sha256 }),
      ['executable.version has surrounding whitespace'],
    ],
    [
      'a version with whitespace inside',
      withExecutable({ version: '2.1 .280', sha256: INVOCATION_V2.executable.sha256 }),
      ['executable.version contains whitespace'],
    ],
    ['a version that is not a string', withExecutable({ version: 2.1, sha256: INVOCATION_V2.executable.sha256 }), ['executable.version is not a string']],
    ['the effort medium', { ...INVOCATION_V2, effort: 'medium' }, ['effort "medium" is not one a registered adapter passes (high)']],
    ['the effort HIGH', { ...INVOCATION_V2, effort: 'HIGH' }, ['effort "HIGH" is not one a registered adapter passes (high)']],
    ['a null executable', withExecutable(null), ['executable is not an object']],
    ['an array for the executable', withExecutable([]), ['executable is not an object']],
    ['a string for the executable', withExecutable('2.1.280'), ['executable is not an object']],
    ['null', null, ['invocation is not an object']],
    ['a string for the whole invocation', 'high', ['invocation is not an object']],
    ['a number for the whole invocation', 64000, ['invocation is not an object']],
    [
      'an empty object',
      {},
      ['effort is not a string', 'maxOutputTokens undefined is not a positive safe integer', 'executable is not an object'],
    ],
    ['an array', [], ['invocation is not an object']],
    // The launch controls (the spend controls' identity extension), checked only when defined.
    ['controls null', withControls(null), ['controls is not an object']],
    ['controls an array', withControls([['CLAUDE_CODE_MAX_RETRIES', '0']]), ['controls is not an object']],
    ['controls a string', withControls('CLAUDE_CODE_MAX_RETRIES=0'), ['controls is not an object']],
    ['an empty control map', withControls({}), ['controls is empty']],
    ['a control named in lower case', withControls({ claude_code_max_retries: '0' }), ['controls key "claude_code_max_retries" is not an environment variable name (^[A-Z][A-Z0-9_]*$)']],
    ['a control name starting with a digit', withControls({ '1CLAUDE': '0' }), ['controls key "1CLAUDE" is not an environment variable name (^[A-Z][A-Z0-9_]*$)']],
    ['a control name carrying "="', withControls({ 'CLAUDE_CODE_MAX_RETRIES=0': '0' }), ['controls key "CLAUDE_CODE_MAX_RETRIES=0" is not an environment variable name (^[A-Z][A-Z0-9_]*$)']],
    ['a control value written as a number', withControls({ CLAUDE_CODE_MAX_RETRIES: 0 }), ['controls["CLAUDE_CODE_MAX_RETRIES"] 0 is not a string']],
    ['a control value that is null', withControls({ CLAUDE_CODE_MAX_RETRIES: null }), ['controls["CLAUDE_CODE_MAX_RETRIES"] null is not a string']],
    ['a control value that is a boolean', withControls({ CLAUDE_CODE_DISABLE_FAST_MODE: true }), ['controls["CLAUDE_CODE_DISABLE_FAST_MODE"] true is not a string']],
    // The permission mode (claude-code-cli@3), checked only when defined: exactly "default".
    ['the permission mode "auto"', { ...INVOCATION_V2, permissionMode: 'auto' }, ['permissionMode "auto" is not "default", the only mode a registered adapter requests']],
    ['the permission mode "Default"', { ...INVOCATION_V2, permissionMode: 'Default' }, ['permissionMode "Default" is not "default", the only mode a registered adapter requests']],
    ['an empty permission mode', { ...INVOCATION_V2, permissionMode: '' }, ['permissionMode "" is not "default", the only mode a registered adapter requests']],
    ['a permission mode written as a number', { ...INVOCATION_V2, permissionMode: 1 }, ['permissionMode 1 is not "default", the only mode a registered adapter requests']],
    ['a null permission mode', { ...INVOCATION_V2, permissionMode: null }, ['permissionMode null is not "default", the only mode a registered adapter requests']],
  ] as const)('refuses %s, naming the field', (_name, value, problems) => {
    const error = thrownBy(() => assertValidInvocationIdentity(value));
    expect(error).toBeInstanceOf(InvalidInvocationIdentityError);
    expect((error as InvalidInvocationIdentityError).problems).toEqual(problems);
    expect((error as Error).message).toContain(problems[0]);
    // A direct call names no side: the control for the two sides named below,
    // so that a default of either one reds here.
    expect((error as InvalidInvocationIdentityError).side).toBe(null);
    expect((error as Error).message).toContain(`the invocation identity is not usable:\n - ${problems[0]}`);
  });

  describe('through pipelineVersionFor, before anything is hashed', () => {
    const closure = (): EntitledClosure =>
      EntitledClosure.forSources(corpus, fixtureRegister(), fixtureSourceUniverse(), ['SRC-100']);
    const configured = (invocation: unknown): RoleConfig =>
      ({ ...SINGLE_PROSECUTOR, providerAdapter: SYNTHETIC_ADAPTER_V1.identity, invocation }) as RoleConfig;

    it('refuses a null invocation rather than hashing it as absent', () => {
      const error = thrownBy(() => pipelineVersionFor({ prompts, config: configured(null), closure: closure() }));
      expect(error).toBeInstanceOf(InvalidInvocationIdentityError);
      expect((error as InvalidInvocationIdentityError).problems).toEqual(['invocation is not an object']);
      expect((error as Error).message).toContain('invocation is not an object');
      // The configuration's declaration, named as such: its repair is an edit
      // to the configuration, not to the capability.
      expect((error as InvalidInvocationIdentityError).side).toBe('configuration');
      expect((error as Error).message).toContain(
        'the invocation the configuration declares is not usable:\n - invocation is not an object',
      );
    });

    it('refuses an invalid invocation', () => {
      const error = thrownBy(() =>
        pipelineVersionFor({
          prompts,
          config: configured({ ...INVOCATION_V2, executable: { version: '2.1.280', sha256: UPPER_SHA } }),
          closure: closure(),
        }),
      );
      expect(error).toBeInstanceOf(InvalidInvocationIdentityError);
      expect((error as InvalidInvocationIdentityError).problems).toEqual([
        `executable.sha256 "${UPPER_SHA}" is not 64 lowercase hex characters`,
      ]);
      expect((error as Error).message).toContain(`executable.sha256 "${UPPER_SHA}" is not 64 lowercase hex characters`);
      expect((error as InvalidInvocationIdentityError).side).toBe('configuration');
      expect((error as Error).message).toContain(
        `the invocation the configuration declares is not usable:\n - executable.sha256 "${UPPER_SHA}" is not 64 lowercase hex characters`,
      );
    });

    it('refuses an invalid control map as the configuration\'s, before anything is hashed', () => {
      const error = thrownBy(() => pipelineVersionFor({ prompts, config: configured({ ...INVOCATION_V2, controls: {} }), closure: closure() }));
      expect(error).toBeInstanceOf(InvalidInvocationIdentityError);
      expect((error as InvalidInvocationIdentityError).problems).toEqual(['controls is empty']);
      expect((error as InvalidInvocationIdentityError).side).toBe('configuration');
      expect((error as Error).message).toContain('the invocation the configuration declares is not usable:\n - controls is empty');
    });

    it('positive control: the valid invocation derives an identity, and a different one from none', () => {
      const withInvocation = pipelineVersionFor({ prompts, config: configured(INVOCATION_V2), closure: closure() });
      expect(withInvocation).toMatch(/^pipeline-v3-[0-9a-f]{64}$/);
      expect(withInvocation).not.toBe(pipelineVersionFor({ prompts, config: configured(undefined), closure: closure() }));
    });
  });
});

// ---------------------------------------------------------------------------
// Identity is declared, and must be usable as one
// ---------------------------------------------------------------------------

describe('adapter identities', () => {
  it('reads as id@version', () => {
    expect(providerAdapterKey(SYNTHETIC_ADAPTER_V2.identity)).toBe('test-provider@2');
  });

  it.each([
    ['an empty id', { id: '', version: '1' }],
    ['an empty version', { id: 'x', version: '' }],
    ['whitespace inside', { id: 'a b', version: '1' }],
    ['surrounding whitespace', { id: ' x ', version: '1' }],
    ["an '@' in the id", { id: 'a@b', version: '1' }],
  ])('refuses %s', (_name, identity) => {
    expect(() => assertValidProviderAdapterIdentity(identity)).toThrow(
      InvalidProviderAdapterIdentityError,
    );
  });

  it('accepts the identities actually in use', () => {
    // The positive control: a validator that rejected everything would satisfy
    // every case above.
    for (const identity of [
      SYNTHETIC_ADAPTER_V1.identity,
      SYNTHETIC_ADAPTER_V2.identity,
      UNSELECTED_PROVIDER_ADAPTER,
      DEFAULT_ROLE_CONFIG.providerAdapter,
    ]) {
      expect(() => assertValidProviderAdapterIdentity(identity)).not.toThrow();
    }
  });

  it('the default configuration selects the Anthropic Messages adapter, and an unselected identity still says so', () => {
    // B-ADAPTER: the default is the concrete adapter production executes. The
    // unselected identity remains the declaration a configuration makes when
    // no provider may be reached, and it still reads as unselected.
    expect(DEFAULT_ROLE_CONFIG.providerAdapter).toEqual({ id: 'anthropic-messages', version: '1' });
    expect(isProviderAdapterSelected(DEFAULT_ROLE_CONFIG.providerAdapter)).toBe(true);
    expect(isProviderAdapterSelected(UNSELECTED_PROVIDER_ADAPTER)).toBe(false);
    expect(isProviderAdapterSelected(SYNTHETIC_ADAPTER_V1.identity)).toBe(true);
  });

  it('an unselected pipeline is not the same pipeline as any selected one', () => {
    // Why the default is a declaration rather than a real provider's identity:
    // an offline run answering from a table must not produce the identity of a
    // run that calls a provider.
    expect(
      buildPipelineIdentity({ ...baseline(), providerAdapter: UNSELECTED_PROVIDER_ADAPTER }),
    ).not.toBe(buildPipelineIdentity({ ...baseline(), providerAdapter: SYNTHETIC_ADAPTER_V1.identity }));
  });
});

// ---------------------------------------------------------------------------
// One identity, one implementation
// ---------------------------------------------------------------------------

describe('the registry', () => {
  const empty: ProviderAdapterRegistry = new Map();

  it('resolves a configured identity to its adapter', () => {
    const registry = registerProviderAdapter(empty, SYNTHETIC_ADAPTER_V1);
    expect(resolveProviderAdapter(registry, SYNTHETIC_ADAPTER_V1.identity)).toBe(
      SYNTHETIC_ADAPTER_V1,
    );
  });

  it('refuses an identity nothing implements, rather than defaulting', () => {
    const registry = registerProviderAdapter(empty, SYNTHETIC_ADAPTER_V1);
    expect(() => resolveProviderAdapter(registry, SYNTHETIC_ADAPTER_V2.identity)).toThrow(
      UnknownProviderAdapterError,
    );
  });

  it('refuses two different adapters answering to one identity', () => {
    // The impostor declares `test-provider@1` while projecting like v2. If it
    // could be registered, a promoted identity would be ambiguous: B3 could
    // benchmark one implementation and a live run execute the other.
    const registry = registerProviderAdapter(empty, SYNTHETIC_ADAPTER_V1);
    expect(() => registerProviderAdapter(registry, SYNTHETIC_ADAPTER_IMPOSTOR)).toThrow(
      ProviderAdapterCollisionError,
    );
    // And the two really do disagree, so the collision is not academic.
    const envelope = syntheticEnvelope(['A', 'B']);
    expect(SYNTHETIC_ADAPTER_IMPOSTOR.projectResponse(envelope, roleRequest())).not.toBe(
      SYNTHETIC_ADAPTER_V1.projectResponse(envelope, roleRequest()),
    );
  });

  it('registering the same adapter twice is not a collision', () => {
    // The control for the case above: a registry that refused every second
    // registration would pass it for the wrong reason.
    const once = registerProviderAdapter(empty, SYNTHETIC_ADAPTER_V1);
    expect(() => registerProviderAdapter(once, SYNTHETIC_ADAPTER_V1)).not.toThrow();
  });

  it('registering is not mutation: the registry handed in is unchanged', () => {
    const registry = registerProviderAdapter(empty, SYNTHETIC_ADAPTER_V1);
    expect(empty.size).toBe(0);
    expect(registry.size).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// The live path, fail-closed
// ---------------------------------------------------------------------------

describe('a live run with no provider selected', () => {
  it('refuses before any network call, with everything else configured', async () => {
    const trap = installNetworkTrap();
    process.env[LIVE_AGENTS_ENV] = LIVE_AGENTS_TOKEN;
    try {
      // Opt-in, endpoint, credential and model all present. Only the protocol
      // is missing, and that alone stops the request.
      expect(() =>
        createLiveAgentRunner({ endpoint: 'https://unused.invalid/', apiKey: 'sk-unused' }),
      ).toThrow(MissingProviderAdapterError);

      const direct = new LiveAgentRunner({
        endpoint: 'https://unused.invalid/',
        apiKey: 'sk-unused',
      });
      await expect(direct.run(roleRequest())).rejects.toBeInstanceOf(MissingProviderAdapterError);
      expect(trap.calls).toEqual([]);
    } finally {
      delete process.env[LIVE_AGENTS_ENV];
      trap.restore();
    }
  });

  it('a runner with no adapter declares no adapter identity', () => {
    // So orchestration's agreement check has nothing to compare, and the
    // refusal comes from the runner itself rather than from a comparison that
    // happened to pass against `undefined`.
    expect(new LiveAgentRunner({ endpoint: 'https://unused.invalid/', apiKey: 'k' }).adapter).toBe(
      undefined,
    );
    expect(
      new LiveAgentRunner({
        endpoint: 'https://unused.invalid/',
        apiKey: 'k',
        adapter: SYNTHETIC_ADAPTER_V1,
      }).adapter,
    ).toEqual(SYNTHETIC_ADAPTER_V1.identity);
  });
});

describe('a live runner exposes the invocation its adapter declares', () => {
  // Constructed only: nothing here calls `run()` or reaches a transport.
  const over = (adapter?: typeof CLAUDE_CODE_CLI_V2_ADAPTER): LiveAgentRunner =>
    new LiveAgentRunner({ endpoint: 'https://unused.invalid/', apiKey: 'k', ...(adapter === undefined ? {} : { adapter }) });

  it('over claude-code-cli@2, the @2 invocation', () => {
    expect(over(CLAUDE_CODE_CLI_V2_ADAPTER).invocation).toEqual(INVOCATION_V2);
  });

  it('over claude-code-cli@1, a synthetic adapter or no adapter, none', () => {
    // The @2 case above is the positive control: the getter can return one.
    expect(over(CLAUDE_CODE_CLI_ADAPTER).invocation).toBe(undefined);
    expect(over(SYNTHETIC_ADAPTER_V1).invocation).toBe(undefined);
    expect(over().invocation).toBe(undefined);
  });
});

describe('the capability must speak the protocol the identity was derived over', () => {
  it('refuses a run whose configured adapter is not the one the capability speaks', async () => {
    const trap = installNetworkTrap();
    try {
      // A capability declaring v2 against a configuration derived over v1. The
      // recorded identity would otherwise describe a pipeline that did not run.
      const capability: AgentRunner = {
        kind: 'replay',
        adapter: SYNTHETIC_ADAPTER_V2.identity,
        run: () => Promise.resolve({ outputJson: JSON.stringify(stubReaderOutput()) }),
      };
      await expect(
        runVerificationPipeline({
          ...pipelineInput(),
          config: { ...SINGLE_PROSECUTOR, providerAdapter: SYNTHETIC_ADAPTER_V1.identity },
          runner: capability,
        }),
      ).rejects.toBeInstanceOf(ProviderAdapterMismatchError);
      expect(trap.calls).toEqual([]);
    } finally {
      trap.restore();
    }
  });

  it('refuses a live capability that declares no adapter at all', async () => {
    // The hole this rule closed: the check used to test only
    // `adapter !== undefined`, so *omitting* the field was an exemption. A
    // capability announcing `kind: 'live'` and leaving it off ran to completion
    // and published a record whose pipelineVersion claimed an adapter nothing
    // had verified. An undeclared adapter is an unverifiable claim, not a pass.
    let asked = 0;
    const silent: AgentRunner = {
      kind: 'live',
      run: () => {
        asked += 1;
        return Promise.resolve({ outputJson: JSON.stringify(stubReaderOutput()) });
      },
    };
    const error = await runVerificationPipeline({
      ...pipelineInput(),
      // Selected, so this is not the not-selected refusal wearing another name.
      config: { ...SINGLE_PROSECUTOR, providerAdapter: SYNTHETIC_ADAPTER_V1.identity },
      runner: silent,
    }).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(UnverifiedProviderAdapterError);
    expect((error as UnverifiedProviderAdapterError).configured).toEqual(
      SYNTHETIC_ADAPTER_V1.identity,
    );
    // Before any role ran.
    expect(asked).toBe(0);
  });

  it('and the two live refusals are different facts with different names', async () => {
    // Configuration chose no provider, versus capability brought no protocol.
    // An operator repairing the first edits configuration; repairing the second
    // supplies an adapter. Collapsing them would send one of the two to the
    // wrong repair.
    const silent: AgentRunner = {
      kind: 'live',
      run: () => Promise.resolve({ outputJson: JSON.stringify(stubReaderOutput()) }),
    };
    const unselected = await runVerificationPipeline({
      ...pipelineInput(),
      config: { ...SINGLE_PROSECUTOR, providerAdapter: UNSELECTED_PROVIDER_ADAPTER },
      runner: silent,
    }).catch((thrown: unknown) => thrown);
    const undeclared = await runVerificationPipeline({
      ...pipelineInput(),
      config: { ...SINGLE_PROSECUTOR, providerAdapter: SYNTHETIC_ADAPTER_V1.identity },
      runner: silent,
    }).catch((thrown: unknown) => thrown);

    expect(unselected).toBeInstanceOf(ProviderAdapterNotSelectedError);
    expect(undeclared).toBeInstanceOf(UnverifiedProviderAdapterError);
    expect((unselected as Error).message).not.toBe((undeclared as Error).message);
  });

  it('positive control: the same run proceeds when the two agree', async () => {
    // Without this, the refusal above would be equally green against a
    // configuration that could never run at all.
    const capability: AgentRunner = {
      kind: 'replay',
      adapter: SYNTHETIC_ADAPTER_V1.identity,
      run: (request) =>
        Promise.resolve({
          outputJson: JSON.stringify(
            request.role === 'reader'
              ? stubReaderOutput()
              : request.role === 'prosecutor'
                ? stubProsecutorOutput(lensFromRequest(request))
                : stubAdjudicatorOutput(),
          ),
        }),
    };
    await expect(
      runVerificationPipeline({
        ...pipelineInput(),
        config: { ...SINGLE_PROSECUTOR, providerAdapter: SYNTHETIC_ADAPTER_V1.identity },
        runner: capability,
      }),
    ).resolves.toBeDefined();
  });

  it('a capability declaring no adapter is never compared, and replay is one', async () => {
    // Replay speaks no protocol, so there is nothing to disagree about — which
    // is what keeps it provider-independent while still reproducing the
    // pipeline identity of the run it replays.
    const capability: AgentRunner = {
      kind: 'replay',
      run: (request) =>
        Promise.resolve({
          outputJson: JSON.stringify(
            request.role === 'reader'
              ? stubReaderOutput()
              : request.role === 'prosecutor'
                ? stubProsecutorOutput(lensFromRequest(request))
                : stubAdjudicatorOutput(),
          ),
        }),
    };
    expect(capability.adapter).toBe(undefined);
    await expect(
      runVerificationPipeline({
        ...pipelineInput(),
        config: { ...SINGLE_PROSECUTOR, providerAdapter: SYNTHETIC_ADAPTER_V2.identity },
        runner: capability,
      }),
    ).resolves.toBeDefined();
  });
});

describe('the capability must make the invocation the identity was derived over', () => {
  /** The configuration under test: a selected adapter, and `@2`'s invocation declared. */
  const CONFIGURED: RoleConfig = {
    ...SINGLE_PROSECUTOR,
    providerAdapter: SYNTHETIC_ADAPTER_V1.identity,
    invocation: INVOCATION_V2,
  };
  /** The same adapter, and no invocation. */
  const UNDECLARED: RoleConfig = { ...SINGLE_PROSECUTOR, providerAdapter: SYNTHETIC_ADAPTER_V1.identity };

  /**
   * A capability of the given kind answering every role with a stub, counting
   * what it was asked and how often it was bound. `bind` is where a run first
   * hands its identity to the capability, so a refusal that is to come before
   * any work leaves it at zero, and a run that completes binds exactly once.
   */
  function capability(
    kind: 'live' | 'replay',
    declared: { adapter?: ProviderAdapterIdentity; invocation?: InvocationIdentity | undefined },
  ): { runner: AgentRunner; asked: () => number; bound: () => number } {
    let asked = 0;
    let bound = 0;
    const runner: AgentRunner = {
      kind,
      ...declared,
      bind: () => {
        bound += 1;
      },
      run: (request) => {
        asked += 1;
        return Promise.resolve({
          outputJson: JSON.stringify(
            request.role === 'reader'
              ? stubReaderOutput()
              : request.role === 'prosecutor'
                ? stubProsecutorOutput(lensFromRequest(request))
                : stubAdjudicatorOutput(),
          ),
        });
      },
    };
    return { runner, asked: () => asked, bound: () => bound };
  }

  /** Runs to the first refusal under the network trap, and says what was reached. */
  async function attempt(config: RoleConfig, runner: AgentRunner): Promise<{ error: unknown; network: string[] }> {
    const trap = installNetworkTrap();
    try {
      const error = await runVerificationPipeline({ ...pipelineInput(), config, runner }).then(
        () => undefined,
        (thrown: unknown) => thrown,
      );
      return { error, network: [...trap.calls] };
    } finally {
      trap.restore();
    }
  }

  it('refuses a live capability making a different invocation under the same adapter identity', async () => {
    const other = {
      ...INVOCATION_V2,
      maxOutputTokens: 63999,
      executable: { ...INVOCATION_V2.executable, version: '2.1.275' },
    };
    const { runner, asked, bound } = capability('live', { adapter: SYNTHETIC_ADAPTER_V1.identity, invocation: other });
    const { error, network } = await attempt(CONFIGURED, runner);

    expect(error).toBeInstanceOf(InvocationMismatchError);
    const mismatch = error as InvocationMismatchError;
    expect(mismatch.message).toContain('maxOutputTokens configured 64000, actual 63999');
    expect(mismatch.message).toContain('executable.version configured "2.1.295", actual "2.1.275"');
    expect(mismatch.configured).toEqual(INVOCATION_V2);
    expect(mismatch.actual).toEqual(other);
    expect(mismatch.fields).toEqual(['maxOutputTokens', 'executable.version']);
    expect(asked()).toBe(0);
    expect(bound()).toBe(0);
    expect(network).toEqual([]);
  });

  it('refuses when the configuration declares an invocation and the live capability declares none', async () => {
    const { runner, asked, bound } = capability('live', { adapter: SYNTHETIC_ADAPTER_V1.identity });
    const { error, network } = await attempt(CONFIGURED, runner);

    expect(error).toBeInstanceOf(InvocationMismatchError);
    const mismatch = error as InvocationMismatchError;
    expect(mismatch.message).toContain('but the execution capability declares none');
    expect(mismatch.configured).toEqual(INVOCATION_V2);
    expect(mismatch.actual).toBe(undefined);
    expect(mismatch.fields).toEqual([]);
    expect(asked()).toBe(0);
    expect(bound()).toBe(0);
    expect(network).toEqual([]);
  });

  it('refuses when the live capability declares an invocation and the configuration declares none', async () => {
    const { runner, asked, bound } = capability('live', { adapter: SYNTHETIC_ADAPTER_V1.identity, invocation: INVOCATION_V2 });
    const { error, network } = await attempt(UNDECLARED, runner);

    expect(error).toBeInstanceOf(InvocationMismatchError);
    const mismatch = error as InvocationMismatchError;
    expect(mismatch.message).toContain("but the configuration this run's pipelineVersion is derived over declares none");
    expect(mismatch.configured).toBe(undefined);
    expect(mismatch.actual).toEqual(INVOCATION_V2);
    expect(mismatch.fields).toEqual([]);
    expect(asked()).toBe(0);
    expect(bound()).toBe(0);
    expect(network).toEqual([]);
  });

  it.each([
    ['maxOutputTokens', { ...INVOCATION_V2, maxOutputTokens: 32000 }, 'maxOutputTokens configured 64000, actual 32000'],
    [
      'executable.version',
      { ...INVOCATION_V2, executable: { ...INVOCATION_V2.executable, version: '2.1.281' } },
      'executable.version configured "2.1.295", actual "2.1.281"',
    ],
    [
      'executable.sha256',
      { ...INVOCATION_V2, executable: { ...INVOCATION_V2.executable, sha256: 'f'.repeat(64) } },
      `executable.sha256 configured "494870c9763b5ea370b6165e7e04af589a7b2472bf0de18ffb25477f8230bdf6", actual "${'f'.repeat(64)}"`,
    ],
  ] as const)('refuses a live capability differing in %s alone, naming only that field', async (field, other, fragment) => {
    const { runner, asked, bound } = capability('live', { adapter: SYNTHETIC_ADAPTER_V1.identity, invocation: other });
    const { error, network } = await attempt(CONFIGURED, runner);

    expect(error).toBeInstanceOf(InvocationMismatchError);
    expect((error as InvocationMismatchError).fields).toEqual([field]);
    expect((error as InvocationMismatchError).configured).toEqual(INVOCATION_V2);
    expect((error as InvocationMismatchError).actual).toEqual(other);
    expect((error as Error).message).toContain(fragment);
    expect(asked()).toBe(0);
    expect(bound()).toBe(0);
    expect(network).toEqual([]);
  });

  // Since the pin moved to 2.1.295 (2026-10-15), both version rows above declare an actual version older than the
  // configured one. This one declares a newer build, which is what the desktop updater installs, so a comparison
  // that named only an older executable would pass it.
  it('refuses a live capability declaring a newer executable version (2.1.296 against the configured 2.1.295), naming only executable.version', async () => {
    const other: InvocationIdentity = {
      effort: 'high',
      maxOutputTokens: 64000,
      executable: { version: '2.1.296', sha256: '494870c9763b5ea370b6165e7e04af589a7b2472bf0de18ffb25477f8230bdf6' },
      controls: { ...INVOCATION_V2.controls },
    };
    const { runner, asked, bound } = capability('live', { adapter: SYNTHETIC_ADAPTER_V1.identity, invocation: other });
    const { error, network } = await attempt(CONFIGURED, runner);

    expect(error).toBeInstanceOf(InvocationMismatchError);
    expect((error as InvocationMismatchError).fields).toEqual(['executable.version']);
    expect((error as InvocationMismatchError).configured).toEqual(INVOCATION_V2);
    expect((error as InvocationMismatchError).actual).toEqual(other);
    expect((error as Error).message).toContain('executable.version configured "2.1.295", actual "2.1.296"');
    expect(asked()).toBe(0);
    expect(bound()).toBe(0);
    expect(network).toEqual([]);
  });

  // The launch controls (the spend controls' identity extension): a capability whose declared controls differ from the
  // configuration's, by one value or by declaring none, runs under a launch the identity does not name.
  it.each([
    [
      'one control value differing (CLAUDE_CODE_DISABLE_REFUSAL_RETRY "0")',
      { ...INVOCATION_V2, controls: { ...INVOCATION_V2.controls, CLAUDE_CODE_DISABLE_REFUSAL_RETRY: '0' } },
      `controls configured ${INVOCATION_V2_CONTROLS_SHOWN}, actual ${INVOCATION_V2_CONTROLS_SHOWN.replace('CLAUDE_CODE_DISABLE_REFUSAL_RETRY=1', 'CLAUDE_CODE_DISABLE_REFUSAL_RETRY=0')}`,
    ],
    [
      'no controls at all, beside an invocation otherwise equal',
      { effort: 'high', maxOutputTokens: 64000, executable: { version: '2.1.295', sha256: '494870c9763b5ea370b6165e7e04af589a7b2472bf0de18ffb25477f8230bdf6' } },
      `controls configured ${INVOCATION_V2_CONTROLS_SHOWN}, actual none`,
    ],
  ] as const)('refuses a live capability declaring %s, naming only controls', async (_what, other, fragment) => {
    const { runner, asked, bound } = capability('live', { adapter: SYNTHETIC_ADAPTER_V1.identity, invocation: other });
    const { error, network } = await attempt(CONFIGURED, runner);

    expect(error).toBeInstanceOf(InvocationMismatchError);
    expect((error as InvocationMismatchError).fields).toEqual(['controls']);
    expect((error as InvocationMismatchError).configured).toEqual(INVOCATION_V2);
    expect((error as InvocationMismatchError).actual).toEqual(other);
    expect((error as Error).message).toContain(fragment);
    expect(asked()).toBe(0);
    expect(bound()).toBe(0);
    expect(network).toEqual([]);
  });

  it('refuses a live capability declaring the controls where the configuration\'s invocation declares none, naming only controls', async () => {
    const { controls: _removed, ...configuredWithout } = INVOCATION_V2;
    const { runner, asked, bound } = capability('live', { adapter: SYNTHETIC_ADAPTER_V1.identity, invocation: INVOCATION_V2 });
    const { error, network } = await attempt({ ...CONFIGURED, invocation: configuredWithout }, runner);

    expect(error).toBeInstanceOf(InvocationMismatchError);
    expect((error as InvocationMismatchError).fields).toEqual(['controls']);
    expect((error as Error).message).toContain(`controls configured none, actual ${INVOCATION_V2_CONTROLS_SHOWN}`);
    expect(asked()).toBe(0);
    expect(bound()).toBe(0);
    expect(network).toEqual([]);
  });

  // The permission mode (claude-code-cli@3): a capability declaring no mode where the configuration requests one, or
  // one where the configuration requests none, runs under a launch the identity does not name.
  it('refuses a live capability declaring no permission mode where the configuration\'s invocation requests "default", naming only permissionMode', async () => {
    const { runner, asked, bound } = capability('live', { adapter: SYNTHETIC_ADAPTER_V1.identity, invocation: INVOCATION_V2 });
    const { error, network } = await attempt({ ...CONFIGURED, invocation: INVOCATION_V3 }, runner);

    expect(error).toBeInstanceOf(InvocationMismatchError);
    expect((error as InvocationMismatchError).fields).toEqual(['permissionMode']);
    expect((error as InvocationMismatchError).configured).toEqual(INVOCATION_V3);
    expect((error as InvocationMismatchError).actual).toEqual(INVOCATION_V2);
    expect((error as Error).message).toContain('permissionMode configured "default", actual none');
    expect(asked()).toBe(0);
    expect(bound()).toBe(0);
    expect(network).toEqual([]);
  });

  it('refuses the reverse: a live capability requesting "default" where the configuration\'s invocation declares no mode, naming only permissionMode', async () => {
    const { runner, asked, bound } = capability('live', { adapter: SYNTHETIC_ADAPTER_V1.identity, invocation: INVOCATION_V3 });
    const { error, network } = await attempt(CONFIGURED, runner);

    expect(error).toBeInstanceOf(InvocationMismatchError);
    expect((error as InvocationMismatchError).fields).toEqual(['permissionMode']);
    expect((error as InvocationMismatchError).configured).toEqual(INVOCATION_V2);
    expect((error as InvocationMismatchError).actual).toEqual(INVOCATION_V3);
    expect((error as Error).message).toContain('permissionMode configured none, actual "default"');
    expect(asked()).toBe(0);
    expect(bound()).toBe(0);
    expect(network).toEqual([]);
  });

  it('positive control for both: a live capability making exactly the configured @3 invocation, as a distinct object, runs and binds once; a mismatch described in full shows the mode', async () => {
    const equal: InvocationIdentity = { ...INVOCATION_V3, executable: { ...INVOCATION_V3.executable }, controls: { ...INVOCATION_V3.controls } };
    expect(equal).not.toBe(INVOCATION_V3);
    expect(invocationDifferences(INVOCATION_V3, equal)).toEqual([]);
    const { runner, asked, bound } = capability('live', { adapter: SYNTHETIC_ADAPTER_V1.identity, invocation: equal });
    const { error, network } = await attempt({ ...CONFIGURED, invocation: INVOCATION_V3 }, runner);

    expect(error).toBe(undefined);
    expect(asked()).toBeGreaterThan(0);
    expect(bound()).toBe(1);
    expect(network).toEqual([]);
    expect(new InvocationMismatchError(INVOCATION_V3, undefined).message).toContain(
      `this run's pipelineVersion is derived over invocation {effort "high", maxOutputTokens 64000, executable "2.1.295" sha256 "494870c9763b5ea370b6165e7e04af589a7b2472bf0de18ffb25477f8230bdf6", controls ${INVOCATION_V2_CONTROLS_SHOWN}, permissionMode "default"}, but the execution capability declares none`,
    );
  });

  it('the comparison reads two orders of one control map as no difference, and a mismatch described in full shows the controls sorted', () => {
    const reordered = { ...INVOCATION_V2, controls: Object.fromEntries(Object.entries(INVOCATION_V2.controls!).reverse()) };
    // Positive control: the key order really differs.
    expect(Object.keys(reordered.controls)).not.toEqual(Object.keys(INVOCATION_V2.controls!));
    expect(invocationDifferences(INVOCATION_V2, reordered)).toEqual([]);
    // The absent side: a mismatch where the capability declares no invocation describes the configured one, controls and all.
    expect(new InvocationMismatchError(reordered, undefined).message).toContain(
      `this run's pipelineVersion is derived over invocation {effort "high", maxOutputTokens 64000, executable "2.1.295" sha256 "494870c9763b5ea370b6165e7e04af589a7b2472bf0de18ffb25477f8230bdf6", controls ${INVOCATION_V2_CONTROLS_SHOWN}}, but the execution capability declares none`,
    );
  });

  // Effort is the one field whose difference cannot reach the comparison
  // through a run. `INVOCATION_EFFORTS` holds a single effort and both sides
  // are validated against it, so a declared effort other than the configured
  // `high` is one no registered adapter passes: the capability's declaration
  // is refused as invalid before it is compared. This case holds that refusal
  // and its place; the next holds the comparison's own effort conjunct.
  it('refuses a live capability differing in effort alone, as an effort no registered adapter passes', async () => {
    const other = { ...INVOCATION_V2, effort: 'max' };
    const { runner, asked, bound } = capability('live', { adapter: SYNTHETIC_ADAPTER_V1.identity, invocation: other });
    const { error, network } = await attempt(CONFIGURED, runner);

    expect(error).toBeInstanceOf(InvalidInvocationIdentityError);
    expect((error as InvalidInvocationIdentityError).problems).toEqual([
      'effort "max" is not one a registered adapter passes (high)',
    ]);
    expect((error as Error).message).toContain('effort "max" is not one a registered adapter passes (high)');
    // The capability's declaration, named as such: the configuration's `high`
    // is valid, and its repair is the capability's.
    expect((error as InvalidInvocationIdentityError).side).toBe('capability');
    expect((error as Error).message).toContain(
      'the invocation the execution capability declares is not usable:\n - effort "max" is not one a registered adapter passes (high)',
    );
    expect(asked()).toBe(0);
    expect(bound()).toBe(0);
    expect(network).toEqual([]);
  });

  it('the comparison names an effort difference alone, and the mismatch reports it', () => {
    // Called directly, because a run refuses an effort difference by
    // validation first (above): this is the case that reds if the comparison
    // drops `effort`. Equal invocations, as distinct objects, are its control.
    const other = { ...INVOCATION_V2, effort: 'max' };
    expect(invocationDifferences(INVOCATION_V2, { ...INVOCATION_V2, executable: { ...INVOCATION_V2.executable } })).toEqual([]);
    expect(invocationDifferences(INVOCATION_V2, other)).toEqual(['effort']);
    const mismatch = new InvocationMismatchError(INVOCATION_V2, other);
    expect(mismatch.fields).toEqual(['effort']);
    expect(mismatch.configured).toEqual(INVOCATION_V2);
    expect(mismatch.actual).toEqual(other);
    expect(mismatch.message).toContain('effort configured "high", actual "max"');
  });

  it('a capability differing in both adapter and invocation is refused for the adapter first', async () => {
    const { runner, asked, bound } = capability('live', {
      adapter: SYNTHETIC_ADAPTER_V2.identity,
      invocation: { ...INVOCATION_V2, maxOutputTokens: 32000 },
    });
    const { error, network } = await attempt(CONFIGURED, runner);

    expect(error).toBeInstanceOf(ProviderAdapterMismatchError);
    expect(error).not.toBeInstanceOf(InvocationMismatchError);
    expect((error as Error).message).toContain(
      'derived over provider adapter test-provider@1 but the execution capability speaks test-provider@2',
    );
    expect(asked()).toBe(0);
    expect(bound()).toBe(0);
    expect(network).toEqual([]);
  });

  it('a capability differing in adapter and declaring a malformed invocation is refused for the adapter first', async () => {
    // The case above cannot tell where the capability's declaration is
    // validated, because its declaration is valid. This one is not: validated
    // before the adapter checks, it would be refused as an unusable invocation
    // rather than as another protocol. The rows below, where the adapter
    // agrees, are the control that this same `null` is refused as that.
    const { runner, asked, bound } = capability('live', {
      adapter: SYNTHETIC_ADAPTER_V2.identity,
      invocation: null as unknown as InvocationIdentity,
    });
    const { error, network } = await attempt(CONFIGURED, runner);

    expect(error).toBeInstanceOf(ProviderAdapterMismatchError);
    expect(error).not.toBeInstanceOf(InvalidInvocationIdentityError);
    expect((error as Error).message).toContain(
      'derived over provider adapter test-provider@1 but the execution capability speaks test-provider@2',
    );
    expect(asked()).toBe(0);
    expect(bound()).toBe(0);
    expect(network).toEqual([]);
  });

  // A capability's declaration is a value like any other, whatever its static
  // type: the capture harness's role wrapper is to forward whatever its inner
  // runner holds (plan 2026-09-25, D-3, Task 5). Declared but malformed, it is
  // refused by name before it is
  // compared — not by a TypeError from the comparison, or from the mismatch
  // message describing it. `null` is a declaration, not absence.
  it.each([
    ['null, under a configuration declaring the @2 invocation', CONFIGURED, null, ['invocation is not an object']],
    ['null, under a configuration declaring none', UNDECLARED, null, ['invocation is not an object']],
    [
      'an invocation without its executable, under a configuration declaring the @2 invocation',
      CONFIGURED,
      { effort: 'high', maxOutputTokens: 64000 },
      ['executable is not an object'],
    ],
  ] as const)('refuses a live capability declaring %s, by name and before any work', async (_name, config, declared, problems) => {
    const { runner, asked, bound } = capability('live', {
      adapter: SYNTHETIC_ADAPTER_V1.identity,
      invocation: declared as unknown as InvocationIdentity,
    });
    const { error, network } = await attempt(config, runner);

    expect(error).toBeInstanceOf(InvalidInvocationIdentityError);
    expect((error as InvalidInvocationIdentityError).problems).toEqual(problems);
    // Named as the capability's declaration, not the configuration's: the
    // repair is the capability's.
    expect((error as InvalidInvocationIdentityError).side).toBe('capability');
    expect((error as Error).message).toContain(
      `the invocation the execution capability declares is not usable:\n - ${problems[0]}`,
    );
    expect(asked()).toBe(0);
    expect(bound()).toBe(0);
    expect(network).toEqual([]);
  });

  it('positive control: equal invocations, as distinct objects, run to completion', async () => {
    const equal: InvocationIdentity = {
      effort: 'high',
      maxOutputTokens: 64000,
      executable: { version: '2.1.295', sha256: '494870c9763b5ea370b6165e7e04af589a7b2472bf0de18ffb25477f8230bdf6' },
      controls: { ...INVOCATION_V2.controls },
    };
    expect(equal).not.toBe(INVOCATION_V2);
    expect(equal.executable).not.toBe(INVOCATION_V2.executable);
    expect(equal.controls).not.toBe(INVOCATION_V2.controls);
    const { runner, asked, bound } = capability('live', { adapter: SYNTHETIC_ADAPTER_V1.identity, invocation: equal });
    const { error, network } = await attempt(CONFIGURED, runner);

    expect(error).toBe(undefined);
    expect(asked()).toBeGreaterThan(0);
    expect(bound()).toBe(1);
    expect(network).toEqual([]);
  });

  it('positive control: keys the identity does not hash move nothing, beside the declared fields or inside the executable', async () => {
    // The comparison is over the fields the identity hashes, as the emission
    // is: a key the digest cannot see — a path, which is deployment, or one
    // beside the four fields and the controls — can move neither the identity
    // nor the check.
    const withExtras = {
      ...INVOCATION_V2,
      executable: { ...INVOCATION_V2.executable, path: '/x' },
      channel: 'process',
    } as unknown as InvocationIdentity;
    const { runner, asked, bound } = capability('live', { adapter: SYNTHETIC_ADAPTER_V1.identity, invocation: withExtras });
    const { error, network } = await attempt(CONFIGURED, runner);

    expect(error).toBe(undefined);
    expect(asked()).toBeGreaterThan(0);
    expect(bound()).toBe(1);
    expect(network).toEqual([]);
  });

  it('positive control: claude-code-cli@1 declares no invocation, and runs under a configuration that declares none', async () => {
    expect(CLAUDE_CODE_CLI_ADAPTER.invocation).toBe(undefined);
    const config: RoleConfig = { ...SINGLE_PROSECUTOR, providerAdapter: { id: 'claude-code-cli', version: '1' } };
    const { runner, asked, bound } = capability('live', {
      adapter: CLAUDE_CODE_CLI_ADAPTER.identity,
      invocation: CLAUDE_CODE_CLI_ADAPTER.invocation,
    });
    const { error, network } = await attempt(config, runner);

    expect(error).toBe(undefined);
    expect(asked()).toBeGreaterThan(0);
    expect(bound()).toBe(1);
    expect(network).toEqual([]);
  });

  it('positive control: replay is exempt, and declares none against a configuration that declares one', async () => {
    const { runner, asked, bound } = capability('replay', {});
    expect(runner.invocation).toBe(undefined);
    const { error, network } = await attempt(CONFIGURED, runner);

    expect(error).toBe(undefined);
    expect(asked()).toBeGreaterThan(0);
    expect(bound()).toBe(1);
    expect(network).toEqual([]);
  });

  describe('through the live runner itself, which reads its adapter’s declaration', () => {
    /** A transport that must never be reached: counted, and refusing. */
    function unreachable(): { transport: ProviderTransport; calls: () => number } {
      let calls = 0;
      return {
        transport: () => {
          calls += 1;
          return Promise.reject(new Error('the transport was reached'));
        },
        calls: () => calls,
      };
    }
    const V2_UNDECLARED: RoleConfig = { ...SINGLE_PROSECUTOR, providerAdapter: { id: 'claude-code-cli', version: '2' } };

    it('a @2 live runner under a configuration declaring no invocation is refused before any role', async () => {
      const saved = process.env[LIVE_AGENTS_ENV];
      delete process.env[LIVE_AGENTS_ENV];
      try {
        const spy = unreachable();
        const runner = new LiveAgentRunner({ endpoint: '', apiKey: '', adapter: CLAUDE_CODE_CLI_V2_ADAPTER, transport: spy.transport });
        const { error, network } = await attempt(V2_UNDECLARED, runner);

        expect(error).toBeInstanceOf(InvocationMismatchError);
        expect((error as Error).message).toContain(
          "but the configuration this run's pipelineVersion is derived over declares none",
        );
        expect((error as InvocationMismatchError).configured).toBe(undefined);
        expect((error as InvocationMismatchError).actual).toEqual(INVOCATION_V2);
        expect(spy.calls()).toBe(0);
        expect(network).toEqual([]);
      } finally {
        if (saved !== undefined) process.env[LIVE_AGENTS_ENV] = saved;
      }
    });

    it('positive control: under the configuration declaring its invocation, it passes the check and stops at the capability gate', async () => {
      // The run reaches `run()`, which refuses without the token: the invocation
      // check was passed, and nothing was sent.
      const saved = process.env[LIVE_AGENTS_ENV];
      delete process.env[LIVE_AGENTS_ENV];
      try {
        const spy = unreachable();
        const runner = new LiveAgentRunner({ endpoint: '', apiKey: '', adapter: CLAUDE_CODE_CLI_V2_ADAPTER, transport: spy.transport });
        const { error, network } = await attempt({ ...V2_UNDECLARED, invocation: INVOCATION_V2 }, runner);

        expect(error).toBeInstanceOf(AgentCapabilityError);
        expect(spy.calls()).toBe(0);
        expect(network).toEqual([]);
      } finally {
        if (saved !== undefined) process.env[LIVE_AGENTS_ENV] = saved;
      }
    });
  });
});

// ---------------------------------------------------------------------------
// The adapter's output is ordinary output
// ---------------------------------------------------------------------------

describe('projected content goes through the ordinary role boundary', () => {
  it('a projection that yields a malformed answer is refused at the seam, by name', async () => {
    // v2 concatenates every content block. Given two blocks that are each valid
    // JSON, the concatenation is not — which is a realistic way a projection
    // choice produces something the schema must refuse, with no provider-aware
    // validation path anywhere to soften it.
    const envelope = syntheticEnvelope([JSON.stringify(stubReaderOutput()), '{"trailing":1}']);
    const projected = SYNTHETIC_ADAPTER_V2.projectResponse(envelope, roleRequest());
    expect(() => JSON.parse(projected)).toThrow();

    const capability: AgentRunner = {
      kind: 'replay',
      adapter: SYNTHETIC_ADAPTER_V2.identity,
      run: () => Promise.resolve({ outputJson: projected }),
    };
    await expect(
      runVerificationPipeline({
        ...pipelineInput(),
        config: { ...SINGLE_PROSECUTOR, providerAdapter: SYNTHETIC_ADAPTER_V2.identity },
        runner: capability,
      }),
    ).rejects.toBeInstanceOf(RoleTransportError);
  });

  it('and the same content read by v1 is accepted, so the refusal tracks the projection', async () => {
    // The control. v1 takes the first block only, which is the valid reading.
    const envelope = syntheticEnvelope([JSON.stringify(stubReaderOutput()), '{"trailing":1}']);
    expect(() => JSON.parse(SYNTHETIC_ADAPTER_V1.projectResponse(envelope, roleRequest()))).not.toThrow();
  });

  it('the seam refuses identically however the answer was obtained', async () => {
    // Two capabilities differing only in the adapter identity they declare,
    // given the same malformed content: the same refusal. A role boundary that
    // branched on provider identity could widen what it accepts for one
    // provider without touching a schema.
    const malformed = JSON.stringify({ notAReading: true });
    const outcomes: string[] = [];
    for (const adapter of [SYNTHETIC_ADAPTER_V1, SYNTHETIC_ADAPTER_V2]) {
      const error = await runVerificationPipeline({
        ...pipelineInput(),
        config: { ...SINGLE_PROSECUTOR, providerAdapter: adapter.identity },
        runner: {
          kind: 'replay',
          adapter: adapter.identity,
          run: () => Promise.resolve({ outputJson: malformed }),
        },
      }).catch((thrown: unknown) => thrown);
      expect(error).toBeInstanceOf(RoleOutputError);
      outcomes.push((error as Error).message);
    }
    expect(outcomes[1]).toBe(outcomes[0]);
  });
});

// ---------------------------------------------------------------------------
// The transcript already binds this, and gains no field for it
// ---------------------------------------------------------------------------

describe('transcript binding across adapter semantics', () => {
  it('a recording made under one adapter cannot answer a run configured for another', async () => {
    // Why no `providerAdapterId` field was added to the transcript: `runId` is
    // derived from `pipelineVersion` plus the question, and `pipelineVersion`
    // now carries the adapter identity. So the binding is already exact, and a
    // duplicated field would be a second answer to a question one authority
    // already settles — with no binding role of its own.
    const answering = (request: { role: string }) =>
      Promise.resolve({
        outputJson: JSON.stringify(
          request.role === 'reader'
            ? stubReaderOutput()
            : request.role === 'prosecutor'
              ? stubProsecutorOutput(DEFAULT_ROLE_CONFIG.lenses[0]!)
              : stubAdjudicatorOutput(),
        ),
      });

    const underV1 = await runVerificationPipeline({
      ...pipelineInput(),
      config: { ...SINGLE_PROSECUTOR, providerAdapter: SYNTHETIC_ADAPTER_V1.identity },
      runner: { kind: 'replay', run: answering },
    });

    // Same everything, one adapter version later.
    const underV2 = await runVerificationPipeline({
      ...pipelineInput(),
      config: { ...SINGLE_PROSECUTOR, providerAdapter: SYNTHETIC_ADAPTER_V2.identity },
      runner: { kind: 'replay', run: answering },
    });

    expect(underV2.pipelineVersion).not.toBe(underV1.pipelineVersion);
    // And therefore the recordings are filed under different runs.
    expect(underV2.runId).not.toBe(underV1.runId);
    expect(underV2.transcript.runId).not.toBe(underV1.transcript.runId);

    // Replaying v1's recording against a v2-configured run refuses at `bind`,
    // naming the field that moved — with no adapter-specific check anywhere.
    const error = await runVerificationPipeline({
      ...pipelineInput(),
      config: { ...SINGLE_PROSECUTOR, providerAdapter: SYNTHETIC_ADAPTER_V2.identity },
      runner: replayRunner(underV1.transcript),
    }).catch((thrown: unknown) => thrown);
    expect(error).toBeInstanceOf(TranscriptRunMismatchError);
    expect(
      (error as TranscriptRunMismatchError).differences.map((difference) => difference.field),
    ).toContain('pipelineVersion');
  });

  it('and the transcript gained no field at all for it', () => {
    // The exact key set, not a blacklist of two guessed names. A blacklist is
    // satisfied by any third name — `providerSemantics`, say — so it would let
    // in precisely the second authority the decision exists to keep out.
    // Written as equality so that *adding* anything here is a deliberate,
    // reviewed change to the transcript contract.
    expect(Object.keys(runTranscriptSchema.shape).sort()).toEqual([
      'corpusClosureSha256',
      'packId',
      'pipelineVersion',
      'renderedConditionSha256',
      'requirementId',
      'requirementInputSha256',
      'roles',
      'runId',
      'transcriptSchemaVersion',
    ]);
  });
});

// ---------------------------------------------------------------------------
// The runner speaks through the adapter, in both directions
// ---------------------------------------------------------------------------

/**
 * A `fetch` that answers from a canned envelope instead of a network.
 *
 * **No request leaves the process.** The network trap proves a call was *not*
 * made; this proves what the call would have *been* and what came back, which
 * the trap cannot — it throws before a response exists, so every assertion about
 * `projectResponse` would be vacuous under it (evidence-standard failure mode
 * 7). Installed and removed around one test, and it records the request it was
 * given so the adapter's `buildRequest` can be checked against what was sent.
 */
function installCannedFetch(body: string): {
  calls: { url: string; init: RequestInit }[];
  restore(): void;
} {
  const calls: { url: string; init: RequestInit }[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = ((url: unknown, init: unknown) => {
    calls.push({ url: String(url), init: init as RequestInit });
    return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(body) });
  }) as unknown as typeof fetch;
  return {
    calls,
    restore(): void {
      globalThis.fetch = original;
    },
  };
}

describe('the live runner speaks only through its adapter', () => {
  const ENVELOPE = syntheticEnvelope(['A', 'B']);

  it('returns the adapter’s projection, not the response body', async () => {
    const canned = installCannedFetch(ENVELOPE);
    try {
      process.env[LIVE_AGENTS_ENV] = LIVE_AGENTS_TOKEN;
      const v1 = await new LiveAgentRunner({
        endpoint: 'https://unused.invalid/v1',
        apiKey: 'k',
        adapter: SYNTHETIC_ADAPTER_V1,
      }).run(roleRequest());
      const v2 = await new LiveAgentRunner({
        endpoint: 'https://unused.invalid/v1',
        apiKey: 'k',
        adapter: SYNTHETIC_ADAPTER_V2,
      }).run(roleRequest());

      // The two readings, through the runner rather than the adapter directly.
      expect(v1.outputJson).toBe('A');
      expect(v2.outputJson).toBe('AB');
      // And neither is the envelope. A runner returning the raw body would give
      // both of these the same value, and that value would be this one.
      expect(v1.outputJson).not.toBe(ENVELOPE);
      expect(v2.outputJson).not.toBe(ENVELOPE);
      // Exactly one request each, so a runner making extra calls is visible.
      expect(canned.calls).toHaveLength(2);
    } finally {
      canned.restore();
      delete process.env[LIVE_AGENTS_ENV];
    }
  });

  it('sends the request the adapter described, and nothing of its own', async () => {
    const canned = installCannedFetch(ENVELOPE);
    try {
      process.env[LIVE_AGENTS_ENV] = LIVE_AGENTS_TOKEN;
      const request = roleRequest();
      await new LiveAgentRunner({
        endpoint: 'https://unused.invalid/v1',
        apiKey: 'sk-canned',
        adapter: SYNTHETIC_ADAPTER_V1,
      }).run(request);

      expect(canned.calls).toHaveLength(1);
      const spec = SYNTHETIC_ADAPTER_V1.buildRequest(request, {
        endpoint: 'https://unused.invalid/v1',
        apiKey: 'sk-canned',
      });
      const sent = canned.calls[0]!;
      expect(sent.url).toBe(spec.url);
      expect(sent.init.method).toBe(spec.method);
      expect(sent.init.headers).toEqual(spec.headers);
      expect(sent.init.body).toBe(spec.body);

      // The provider-shaped things this file used to hard-code are gone: the
      // header this adapter chose is its own, and `x-api-key` is nowhere.
      expect(Object.keys(sent.init.headers as Record<string, string>)).toContain(
        'x-test-provider-key',
      );
      expect(Object.keys(sent.init.headers as Record<string, string>)).not.toContain('x-api-key');
    } finally {
      canned.restore();
      delete process.env[LIVE_AGENTS_ENV];
    }
  });

  it('the canned fetch is really what answered — the trap would have fired otherwise', async () => {
    // The control for the two tests above: they assert what came back from a
    // stub, so something must show the stub is on the same path the real runner
    // uses. Removing it puts the trap back, and the trap fires.
    const trap = installNetworkTrap();
    process.env[LIVE_AGENTS_ENV] = LIVE_AGENTS_TOKEN;
    try {
      await expect(
        new LiveAgentRunner({
          endpoint: 'https://unused.invalid/v1',
          apiKey: 'k',
          adapter: SYNTHETIC_ADAPTER_V1,
        }).run(roleRequest()),
      ).rejects.toThrow(/NETWORK TRAP/);
      expect(trap.calls).toEqual(['https://unused.invalid/v1']);
    } finally {
      delete process.env[LIVE_AGENTS_ENV];
      trap.restore();
    }
  });
});
