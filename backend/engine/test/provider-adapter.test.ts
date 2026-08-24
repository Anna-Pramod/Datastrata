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

import { describe, expect, it } from 'vitest';

import {
  createLiveAgentRunner,
  LiveAgentRunner,
  MissingProviderAdapterError,
  LIVE_AGENTS_ENV,
  LIVE_AGENTS_TOKEN,
} from '../src/pipeline/live-runner';
import { pipelineVersionFor, runVerificationPipeline } from '../src/pipeline/orchestrate';
import {
  ProviderAdapterMismatchError,
  ProviderAdapterNotSelectedError,
  UnverifiedProviderAdapterError,
} from '../src/pipeline/provider-adapter';
import { RoleOutputError, RoleTransportError } from '../src/pipeline/roles';
import type { AgentRunner } from '../src/pipeline/runner';
import { installNetworkTrap } from './helpers';
import { replayRunner, TranscriptRunMismatchError } from '../src/pipeline/replay';
import { runTranscriptSchema } from '../src/pipeline/transcript';
import {
  fixtureCorpus,
  fixtureRenderContext,
  fixtureRequirement,
  lensFromRequest,
  stubAdjudicatorOutput,
  stubProsecutorOutput,
  stubReaderOutput,
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
const GOLDEN_IDENTITY =
  'pipeline-v2-869e7385634f69f8720d8ae386253b39a69b531fb68df466ea19de4d22d984ea';

const prompts = loadPromptSet();
const corpus = fixtureCorpus();

/** One prosecutor, so a run needs three exchanges rather than five. */
const SINGLE_PROSECUTOR = { ...DEFAULT_ROLE_CONFIG, prosecutorCount: 1 };

/** Everything a run needs except its configuration and its capability. */
function pipelineInput() {
  return {
    packId: 'testpack',
    requirementId: 'TEST-R-001',
    requirement: fixtureRequirement(),
    renderContext: fixtureRenderContext(),
    closure: EntitledClosure.forSources(corpus, ['SRC-100']),
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
        resultSchemaVersion: '1.2.0',
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
        closure: EntitledClosure.forSources(corpus, ['SRC-100']),
      }),
    ).toThrow(InvalidProviderAdapterIdentityError);
    // Control: the same call with a clean identity produces one.
    expect(
      pipelineVersionFor({
        prompts,
        config: { ...SINGLE_PROSECUTOR, providerAdapter: SYNTHETIC_ADAPTER_V1.identity },
        closure: EntitledClosure.forSources(corpus, ['SRC-100']),
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

  it('the default configuration selects no provider, and says so', () => {
    expect(DEFAULT_ROLE_CONFIG.providerAdapter).toEqual(UNSELECTED_PROVIDER_ADAPTER);
    expect(isProviderAdapterSelected(DEFAULT_ROLE_CONFIG.providerAdapter)).toBe(false);
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
