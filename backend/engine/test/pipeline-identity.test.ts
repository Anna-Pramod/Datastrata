/**
 * `pipelineVersion` is derived, one input at a time — and unpromoted by
 * construction.
 *
 * **One input per case, deliberately.** A builder that hashed only the lens set
 * would pass a test that varied several inputs at once, and the pass would look
 * like evidence. So each case below moves exactly one of the things §5.1 says
 * the identity pins, and one case moves nothing at all and asserts the digest is
 * byte-identical.
 *
 * **The prompt-file cases move real bytes on disk.** `promptSha256` is the hash
 * of the file, so a case that varied a hash string would test the digest while
 * skipping the claim — that the repository can independently reproduce what the
 * identity pins. The prompt files are copied into a temporary directory, one is
 * edited, and the set is re-read through the same loader.
 */

import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { readdirSync } from 'node:fs';
import {
  buildPipelineIdentity,
  PIPELINE_IDENTITY_SCHEME,
  RESULT_SCHEMA_VERSION,
  type PipelineIdentityInput,
} from '../src/pipeline/identity';
import { buildRunId } from '../src/pipeline/run-identity';
import {
  defaultPromptPath,
  loadHistoricalPromptSet,
  loadPromptSet,
  MissingPromptFileError,
  promptHashes,
  PROMPT_FILENAMES,
  PROMPT_ROOT,
} from '../src/pipeline/prompts';
import { DEFAULT_ROLE_CONFIG } from '../src/pipeline/config';
import { CLOSURE_POLICY_V0 } from '../src/corpus/closure';
import { sha256Hex } from '../src/corpus/hash';
import { isPromoted, type PromotionRecord } from '../src/verification/promotions';
import { verificationResultSchema } from '../src/verification/result';
import { CLOSURE_RENDERER_VERSION } from '../src/pipeline/entitlement';
import { EntitledClosure } from '../src/pipeline/entitlement';
import { pipelineVersionFor } from '../src/pipeline/orchestrate';
import { CLAUDE_CODE_CLI_ADAPTER, CLAUDE_CODE_CLI_IDENTITY, CLAUDE_CODE_CLI_V2_ADAPTER, CLAUDE_CODE_CLI_V3_ADAPTER } from '../src/pipeline/claude-code-cli';
import type { RoleConfig } from '../src/pipeline/config';
import type { InvocationIdentity } from '../src/pipeline/provider-adapter';
import { readWorld, type VerifyPaths } from '../src/cli/sign';
import { sourceIdsOf } from '../src/knowledge/provenance';
import { engineRoot } from './replay-fixtures';
import { SUBSCRIPTION_ROLE_CONFIG, SUBSCRIPTION_ROLE_CONFIG_V1, SUBSCRIPTION_ROLE_CONFIG_V3, subscriptionRoleConfigFor, SubscriptionRouteMismatchError } from './live-capture';

const prompts = loadPromptSet();

/**
 * The prompt directory, derived from a resolved *file* path.
 *
 * `src/pipeline/prompts.ts` deliberately holds no directory path — a statically
 * foldable directory is what `@vercel/nft` emits recursively. Deriving it here
 * is safe because test code is never traced into the artifact.
 */
function promptDir(): string {
  return dirname(defaultPromptPath('reader'));
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
    providerAdapter: DEFAULT_ROLE_CONFIG.providerAdapter,
    closurePolicy: CLOSURE_POLICY_V0,
  };
}

/** A copy of the real prompt directory, with one file's bytes changed. */
function promptDirWithEdit(filename: string, edit: (text: string) => string): string {
  const dir = mkdtempSync(join(tmpdir(), 'datastrata-prompts-'));
  cpSync(promptDir(), dir, { recursive: true });
  const path = join(dir, filename);
  writeFileSync(path, edit(readFileSync(path, 'utf8')), 'utf8');
  return dir;
}

describe('prompt files and their hashes', () => {
  it('hashes the file’s bytes, not an inline string', () => {
    for (const [role, filename] of Object.entries(PROMPT_FILENAMES)) {
      const path = join(promptDir(), filename);
      const onDisk = sha256Hex(readFileSync(path));
      expect(prompts[role as keyof typeof prompts].sha256).toBe(onDisk);
      expect(prompts[role as keyof typeof prompts].text).toBe(readFileSync(path, 'utf8'));
    }
  });

  it('resolves each file individually, never through a directory path', () => {
    // The `lib/pack.ts` incident: nft folds a computed path, and a folded path
    // that is a *directory* is emitted recursively — seventy files shipped
    // where eighteen were declared, with every gate green
    // (docs/superpowers/CHECKPOINT-public-resolver-seam.md).
    for (const [role, filename] of Object.entries(PROMPT_FILENAMES)) {
      const path = defaultPromptPath(role as keyof typeof PROMPT_FILENAMES);
      expect(path.endsWith(`/${filename}`)).toBe(true);
      expect(readFileSync(path, 'utf8').length).toBeGreaterThan(0);
    }
    // The construct itself is absent from the module, not merely unused today.
    const source = readFileSync('src/pipeline/prompts.ts', 'utf8').replace(
      /\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,
      '',
    );
    expect(source).not.toMatch(/dirname\s*\(\s*fileURLToPath/);
    expect(source).not.toContain('defaultPromptDir');
    // Positive control: the pattern does match the construct it forbids.
    expect(/dirname\s*\(\s*fileURLToPath/.test('dirname(fileURLToPath(import.meta.url))')).toBe(true);
  });

  it('the artifact-hygiene denylist forbids the prompt directory from shipping', () => {
    // The engine suite cannot see the built artifact — that is
    // `npm run test:standalone`'s job, and the guard runs there. What is
    // reachable from here is that the denylist names the directory at all,
    // asserted in the same style as the transcript-root check.
    const guard = readFileSync(join('..', '..', 'scripts', 'standalone-harness.mjs'), 'utf8');
    expect(guard).toContain("label: 'backend/engine/prompts/**'");
    expect(guard).toContain(`path === '${PROMPT_ROOT}' || path.startsWith('${PROMPT_ROOT}/')`);
  });

  it('refuses to derive an identity when a prompt file is missing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'datastrata-prompts-empty-'));
    expect(() => loadPromptSet(dir)).toThrow(MissingPromptFileError);
    // Positive control: the same loader over a complete directory succeeds, so
    // the refusal above is about the missing file and not about the loader.
    expect(readdirSync(promptDir()).sort()).toEqual(
      Object.values(PROMPT_FILENAMES).sort(),
    );
    expect(() => loadPromptSet(promptDir())).not.toThrow();
  });
});

describe('pipelineVersion is derived', () => {
  it('is a prefixed digest, not a label', () => {
    const version = buildPipelineIdentity(baseline());
    expect(version).toMatch(new RegExp(`^pipeline-${PIPELINE_IDENTITY_SCHEME}-[0-9a-f]{64}$`));
  });

  it('varying nothing leaves it byte-identical', () => {
    expect(buildPipelineIdentity(baseline())).toBe(buildPipelineIdentity(baseline()));
    // and a second, independently constructed baseline agrees
    expect(buildPipelineIdentity({ ...baseline() })).toBe(buildPipelineIdentity(baseline()));
  });

  const before = buildPipelineIdentity(baseline());

  it('moves when the reader prompt file’s bytes move', () => {
    const dir = promptDirWithEdit(PROMPT_FILENAMES.reader, (text) => `${text}\nOne more sentence.\n`);
    const edited = loadPromptSet(dir);
    expect(edited.reader.sha256).not.toBe(prompts.reader.sha256);
    expect(edited.prosecutor.sha256).toBe(prompts.prosecutor.sha256);
    expect(edited.adjudicator.sha256).toBe(prompts.adjudicator.sha256);
    expect(buildPipelineIdentity({ ...baseline(), promptSha256: promptHashes(edited) })).not.toBe(before);
  });

  it('moves when the adjudicator prompt file’s bytes move', () => {
    const dir = promptDirWithEdit(PROMPT_FILENAMES.adjudicator, (text) => text.replace('Role:', 'ROLE:'));
    const edited = loadPromptSet(dir);
    expect(edited.adjudicator.sha256).not.toBe(prompts.adjudicator.sha256);
    expect(edited.reader.sha256).toBe(prompts.reader.sha256);
    expect(buildPipelineIdentity({ ...baseline(), promptSha256: promptHashes(edited) })).not.toBe(before);
  });

  it('moves when the prosecutor prompt file’s bytes move', () => {
    const dir = promptDirWithEdit(PROMPT_FILENAMES.prosecutor, (text) => `${text}\nOne more lens note.\n`);
    const edited = loadPromptSet(dir);
    expect(edited.prosecutor.sha256).not.toBe(prompts.prosecutor.sha256);
    expect(edited.reader.sha256).toBe(prompts.reader.sha256);
    expect(edited.adjudicator.sha256).toBe(prompts.adjudicator.sha256);
    expect(buildPipelineIdentity({ ...baseline(), promptSha256: promptHashes(edited) })).not.toBe(before);
  });

  it('moves when the reader model identifier moves', () => {
    const input = baseline();
    expect(
      buildPipelineIdentity({
        ...input,
        models: { ...input.models, reader: `${input.models.reader}-next` },
      }),
    ).not.toBe(before);
  });

  it('moves when the prosecutor model identifier moves', () => {
    const input = baseline();
    expect(
      buildPipelineIdentity({
        ...input,
        models: { ...input.models, prosecutor: `${input.models.prosecutor}-next` },
      }),
    ).not.toBe(before);
  });

  it('moves when the adjudicator model identifier moves', () => {
    const input = baseline();
    expect(
      buildPipelineIdentity({
        ...input,
        models: { ...input.models, adjudicator: `${input.models.adjudicator}-next` },
      }),
    ).not.toBe(before);
  });

  it('moves when the prosecutor count moves', () => {
    const input = baseline();
    expect(
      buildPipelineIdentity({
        ...input,
        roleConfig: { ...input.roleConfig, prosecutorCount: input.roleConfig.prosecutorCount + 1 },
      }),
    ).not.toBe(before);
  });

  it('moves when the lens set moves', () => {
    const input = baseline();
    expect(
      buildPipelineIdentity({
        ...input,
        roleConfig: { ...input.roleConfig, lenses: [...input.roleConfig.lenses, 'wrong_currency'] },
      }),
    ).not.toBe(before);
  });

  it('moves when only the lens *order* moves', () => {
    // §5.1 pins ordering, so prosecutor i taking a different lens is a
    // different pipeline even when the same lenses run.
    const input = baseline();
    const reversed = [...input.roleConfig.lenses].reverse();
    expect(reversed).toHaveLength(input.roleConfig.lenses.length);
    expect([...reversed].sort()).toEqual([...input.roleConfig.lenses].sort());
    expect(
      buildPipelineIdentity({ ...input, roleConfig: { ...input.roleConfig, lenses: reversed } }),
    ).not.toBe(before);
  });

  it('moves when the role order moves', () => {
    const input = baseline();
    expect(
      buildPipelineIdentity({
        ...input,
        roleConfig: { ...input.roleConfig, order: ['adjudicator', 'prosecutor', 'reader'] },
      }),
    ).not.toBe(before);
  });

  it('moves when the provider adapter’s semantic identity moves', () => {
    // Here as well as in `provider-adapter.test.ts`, because this is where the
    // "every identity input has a teeth case" list lives, and an input added to
    // the payload without a case in this describe is an input nobody would
    // notice going missing from it.
    expect(
      buildPipelineIdentity({
        ...baseline(),
        providerAdapter: { id: 'some-provider', version: '1' },
      }),
    ).not.toBe(
      buildPipelineIdentity({
        ...baseline(),
        providerAdapter: { id: 'some-provider', version: '2' },
      }),
    );
  });

  it('moves when the result schema version moves', () => {
    // This probed a single hard-coded '1.1.0'. The 1.0.0 → 1.1.0 schema bump made
    // that value equal `RESULT_SCHEMA_VERSION`, so the assertion became "this
    // identity differs from itself" and **failed** — an ordinary red the
    // migration had to answer, not a vacuity that passed unnoticed.
    //
    // Rewritten to probe both directions from the live version, which no future
    // bump can defeat: whatever `RESULT_SCHEMA_VERSION` becomes, a version below
    // it and a version above it must both yield a different identity. The guard
    // on the line below is what keeps '1.0.0' a real probe rather than the
    // baseline in disguise, and it will fail loudly if the schema ever returns
    // to 1.0.0.
    expect(RESULT_SCHEMA_VERSION).not.toBe('1.0.0');
    for (const version of ['1.0.0', '2.0.0']) {
      expect(buildPipelineIdentity({ ...baseline(), resultSchemaVersion: version })).not.toBe(before);
    }
  });

  it('moves when the closure policy’s reference depth moves', () => {
    const input = baseline();
    expect(
      buildPipelineIdentity({
        ...input,
        closurePolicy: { ...input.closurePolicy, referenceDepth: 2 },
      }),
    ).not.toBe(before);
  });

  it('moves when the closure policy’s reference kinds move', () => {
    const input = baseline();
    expect(
      buildPipelineIdentity({
        ...input,
        closurePolicy: { ...input.closurePolicy, referenceKinds: [] },
      }),
    ).not.toBe(before);
  });

  it('moves when the closure policy’s structural kinds move', () => {
    const input = baseline();
    expect(
      buildPipelineIdentity({
        ...input,
        closurePolicy: {
          ...input.closurePolicy,
          structuralKinds: input.closurePolicy.structuralKinds.slice(0, -1),
        },
      }),
    ).not.toBe(before);
  });

  it('reads the result schema version off the schema rather than restating it', () => {
    expect(RESULT_SCHEMA_VERSION).toBe(verificationResultSchema.shape.resultSchemaVersion.value);
  });
});

describe('unpromoted by construction', () => {
  const version = buildPipelineIdentity(baseline());

  it('a derived identity is unpromoted against an empty ledger', () => {
    expect(isPromoted([], version)).toBe(false);
  });

  it('positive control: a promotion record for that exact identity answers true', () => {
    // Constructed here and discarded. B2 writes no promotion record, ever —
    // without this control the assertion above would be equally green against
    // an `isPromoted` that is unconditionally false.
    const control: PromotionRecord[] = [
      { pipelineVersion: version, by: 'test control', on: '2026-08-21' },
    ];
    expect(isPromoted(control, version)).toBe(true);
  });

  it('a near-miss record does not promote it', () => {
    const control: PromotionRecord[] = [
      { pipelineVersion: `${version}-rc1`, by: 'test control', on: '2026-08-21' },
    ];
    expect(isPromoted(control, version)).toBe(false);
  });
});

describe('the run identity', () => {
  const run = {
    pipelineVersion: buildPipelineIdentity(baseline()),
    packId: 'testpack',
    requirementId: 'TEST-R-001',
    requirementInputSha256: 'a'.repeat(64),
    renderedConditionSha256: 'b'.repeat(64),
    corpusClosureSha256: 'c'.repeat(64),
  };

  it('is stable across identical runs — no clock in it', () => {
    expect(buildRunId(run)).toBe(buildRunId({ ...run }));
    expect(buildRunId(run)).toMatch(/^run-v1-[0-9a-f]{64}$/);
  });

  it('moves when the question moves', () => {
    const before = buildRunId(run);
    expect(buildRunId({ ...run, requirementId: 'TEST-R-002' })).not.toBe(before);
    expect(buildRunId({ ...run, corpusClosureSha256: 'd'.repeat(64) })).not.toBe(before);
    expect(buildRunId({ ...run, pipelineVersion: `${run.pipelineVersion}x` })).not.toBe(before);
  });
});

/**
 * The two identities the `@2` migration must leave where they are, pinned
 * before it starts (plan 2026-09-25, Task 0).
 *
 * **Literals, not recomputations.** Every case above compares one derivation
 * with another, so a change that moved every identity at once — an encoding,
 * a prompt, a default — would leave them all green. These two compare the
 * production derivation with a string written down on the day it was taken,
 * so anything that moves either identity is a red someone has to answer.
 *
 * **The production path, end to end.** The closure is S-002's, built the way
 * `verify run` and the capture harness build it (`readWorld`, then
 * `EntitledClosure.forSources`) over the repository's own pack, corpus and
 * registry, all read and none written; the prompts are the real files; the
 * digest is `pipelineVersionFor`'s. The subscription configuration is written
 * out here rather than imported from the capture harness, which the migration
 * repoints to `@2`; the configurations the harness exports are then held to
 * the literals, and to the written-out configurations (Task 5a).
 *
 * **What the closure contributes.** Only its policy (`CLOSURE_POLICY_V1`,
 * `forSources`' default) reaches the identity; which documents S-002 entitles
 * is pinned by the run identity's `corpusClosureSha256`, not here. That is
 * also why the HTTP digest over S-002's closure equals the value S-001's
 * recording carries.
 *
 * **The HTTP literal is not today's output.** It is the value the committed
 * S-001 recording was filed under, and a case below reads that recording to
 * say so, so the anchor holds independently of anything this file computes.
 */
describe('the identities the @2 migration must not move', () => {
  /**
   * What `pipelineVersionFor` returned for `claude-code-cli@1` on 2026-09-25,
   * before the migration — the identity the S-002 capture package prepared on
   * 2026-09-24 states as its expected `pipelineVersion`.
   */
  const SUBSCRIPTION_V1_PIPELINE_VERSION = 'pipeline-v3-fd3ed34d558145c09ef7105506c76767d1dc335ce2d82d57fbc6e2c148509ae5';
  /** What the committed S-001 recording was filed under. */
  const HTTP_PIPELINE_VERSION = 'pipeline-v3-06789a364d220899535cbf0cc40fcd5b816becf4328be70b795f54340d4ad7c0';

  /** Today's subscription configuration, written out: the default with the `@1` adapter selected. */
  const subscriptionV1Config: RoleConfig = { ...DEFAULT_ROLE_CONFIG, providerAdapter: CLAUDE_CODE_CLI_IDENTITY };

  /** The repository's own world, as `firstLiveCasePaths` in the capture harness names it. Read only. */
  const paths: VerifyPaths = {
    packDir: join(engineRoot, 'knowledge', 'csrd'),
    corpusDir: join(engineRoot, 'corpus'),
    verificationDir: join(engineRoot, 'verification'),
  };

  let closure: EntitledClosure | undefined;
  /** S-002's entitled closure through the production path, loaded once. */
  function s002Closure(): EntitledClosure {
    if (closure === undefined) {
      const world = readWorld(paths, 'csrd', 'CSRD-S-002');
      // Not a control: `readWorld` selects by id and throws for an unknown one.
      // Stated so a reader sees which requirement the closure is built for.
      expect(world.requirement.id).toBe('CSRD-S-002');
      closure = EntitledClosure.forSources(world.corpus, world.sourceRegister, world.pack, sourceIdsOf(world.requirement));
    }
    return closure;
  }

  it('the @1 adapter identity is claude-code-cli version 1', () => {
    expect(CLAUDE_CODE_CLI_IDENTITY).toEqual({ id: 'claude-code-cli', version: '1' });
  });

  /**
   * Every literal in this block was taken over the v1 prompt set — the set
   * every recording before 2026-10-18 was made under — so each is asserted
   * over `loadHistoricalPromptSet('v1')`: the kept files, byte for byte. The
   * current set (v2, whose prosecutor and adjudicator changed) derives other
   * identities, pinned in the v2 block at the end of this file.
   */
  const v1 = loadHistoricalPromptSet('v1');

  it('the HTTP identity over the v1 prompts and the S-002 closure is the literal', () => {
    expect(
      pipelineVersionFor({ prompts: v1, config: DEFAULT_ROLE_CONFIG, closure: s002Closure() }),
    ).toBe(HTTP_PIPELINE_VERSION);
  });

  it('the @1 subscription identity over the v1 prompts and the S-002 closure is the literal', () => {
    expect(
      pipelineVersionFor({ prompts: v1, config: subscriptionV1Config, closure: s002Closure() }),
    ).toBe(SUBSCRIPTION_V1_PIPELINE_VERSION);
  });

  it('SUBSCRIPTION_ROLE_CONFIG_V1, as the capture harness exports it, gives the @1 literal and is the configuration written out above, with no invocation key at all', () => {
    // Moved here from Task 3, where the export did not exist yet (a parent decision).
    expect(
      pipelineVersionFor({ prompts: v1, config: SUBSCRIPTION_ROLE_CONFIG_V1, closure: s002Closure() }),
    ).toBe(SUBSCRIPTION_V1_PIPELINE_VERSION);
    expect(SUBSCRIPTION_ROLE_CONFIG_V1).toEqual(subscriptionV1Config);
    expect('invocation' in SUBSCRIPTION_ROLE_CONFIG_V1).toBe(false);
  });

  it('the HTTP literal is the pipelineVersion the committed S-001 recording carries', () => {
    const recording = JSON.parse(
      readFileSync(
        join(
          engineRoot,
          'test',
          'verification-transcripts',
          'csrd',
          'CSRD-S-001',
          'run-v1-8717925d731334f6162bdc2fd35a230d3bde7a5d1dc66588db5f5544a0748310.json',
        ),
        'utf8',
      ),
    ) as { runId: string; pipelineVersion: string };
    // Positive control: the file read is the recording named, not another one.
    expect(recording.runId).toBe('run-v1-8717925d731334f6162bdc2fd35a230d3bde7a5d1dc66588db5f5544a0748310');
    expect(recording.pipelineVersion).toBe(HTTP_PIPELINE_VERSION);
  });

  it('the two configurations differ in the adapter alone, and the two literals differ', () => {
    // The first and last conjuncts guard this block's own definitions, not
    // code under src/: the first holds by the spread above, and the last
    // compares two literals — with the two digest cases it says the adapter
    // moves the identity. The middle one is the only conjunct src/ can fail:
    // it reds if the `@1` identity ever equals the HTTP adapter's.
    const { providerAdapter: httpAdapter, ...httpRest } = DEFAULT_ROLE_CONFIG;
    const { providerAdapter: subscriptionAdapter, ...subscriptionRest } = subscriptionV1Config;
    expect(subscriptionRest).toEqual(httpRest);
    expect(subscriptionAdapter).not.toEqual(httpAdapter);
    expect(SUBSCRIPTION_V1_PIPELINE_VERSION).not.toBe(HTTP_PIPELINE_VERSION);
  });

  /**
   * The identity the migration does move: `claude-code-cli@2` on
   * `claude-opus-5-5`, with its invocation declared (plan 2026-09-25, Task 3,
   * D-3). Every value here is a literal, never read off the `@2` profile or
   * adapter.
   */
  describe('the @2 subscription identity, which the invocation moves', () => {
    /**
     * `@2`'s thirteen launch controls, written out with their keys sorted, as
     * the hand-written derivation below emits them in this order (the spend
     * controls' identity extension).
     */
    const CONTROLS_V2: Readonly<Record<string, string>> = {
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
    };
    const INVOCATION_V2: InvocationIdentity = {
      effort: 'high',
      maxOutputTokens: 64000,
      executable: { version: '2.1.295', sha256: '494870c9763b5ea370b6165e7e04af589a7b2472bf0de18ffb25477f8230bdf6' },
      controls: CONTROLS_V2,
    };
    const OPUS_5_5 = { reader: 'claude-opus-5-5', prosecutor: 'claude-opus-5-5', adjudicator: 'claude-opus-5-5' };
    const subscriptionV2Config: RoleConfig = {
      ...DEFAULT_ROLE_CONFIG,
      models: OPUS_5_5,
      providerAdapter: { id: 'claude-code-cli', version: '2' },
      invocation: INVOCATION_V2,
    };

    /**
     * What `pipelineVersionFor` returned for the configuration above, over the
     * real prompts and S-002's closure, taken from this code on 2026-10-15 by
     * a placeholder run when the launch controls joined the invocation
     * (`impl-placeholder-identity.20261015T141601Z.log` in
     * `pilot-evidence/2026-10-15-opus55-spend-controls/`). It replaces
     * `pipeline-v3-68c4d29b…a19a`, taken the same way earlier that day when
     * the pin moved from 2.1.280 to 2.1.295, which the configuration without
     * its controls still derives (below); the 2.1.280 value, taken on
     * 2026-09-25, was `pipeline-v3-e0570a08…f690`. Corroborated by the
     * hand-written derivation below, which reaches the same string without
     * the builder and reproduces both literals above.
     */
    const SUBSCRIPTION_V2_PIPELINE_VERSION = 'pipeline-v3-737f8d5015ea4249eef93cfa66c0b1b9bbb323fd633e7d5a71c26f453f8ce90e';

    const versionOf = (config: RoleConfig): string =>
      pipelineVersionFor({ prompts: v1, config, closure: s002Closure() });

    /**
     * What `pipelineVersionFor` returned for the configuration above before
     * the launch controls joined the invocation: the 2.1.295 identity this
     * file pinned on 2026-10-15 (`CHECKPOINT-opus55-pin-2.1.295.md`). The
     * same configuration with its controls removed must still derive it,
     * which shows the controls are the only change the extension made.
     */
    const SUBSCRIPTION_V2_PIPELINE_VERSION_WITHOUT_CONTROLS = 'pipeline-v3-68c4d29bd770f9e7bc78f24cb2da97892a9da8f7c0bcabb499dff5301806a19a';

    /**
     * SHA-256 of each prompt file's bytes, read and hashed here: the files
     * `prompts.ts` names, read without an encoding, as it reads them — but
     * through neither its loader nor `sha256Hex`.
     */
    function promptFileSha256(
      set: 'v1' | 'v2' | 'current' = 'v1',
    ): Record<'reader' | 'prosecutor' | 'adjudicator', string> {
      const dir = set === 'current' ? join(engineRoot, 'prompts', 'verification') : join(engineRoot, 'prompts', 'history', set);
      const of = (file: string): string => createHash('sha256').update(readFileSync(join(dir, file))).digest('hex');
      return { reader: of('reader.md'), prosecutor: of('prosecutor.md'), adjudicator: of('adjudicator.md') };
    }

    /**
     * The identity over S-002's closure, derived without the code under test:
     * the canonical payload written by hand, keys sorted and no whitespace,
     * hashed with `node:crypto`. Everything but the prompts, the models, the
     * adapter and the invocation is a literal: the lens set and order of
     * `DEFAULT_ROLE_CONFIG`, result schema 1.3.0, closure renderer 1.1.0, and
     * `CLOSURE_POLICY_V1`, the policy `forSources` builds S-002's closure
     * under.
     *
     * The launch controls, where the invocation declares them, are written
     * first inside it ("controls" sorts before "effort"), each entry in the
     * literal's own key order: nothing here sorts them, so the literal is
     * written with its keys sorted by hand, and a literal out of order would
     * derive another string rather than agree by the builder's own sort.
     */
    function handWrittenIdentity(values: {
      models: { reader: string; prosecutor: string; adjudicator: string };
      providerAdapter: { id: string; version: string };
      invocation?: InvocationIdentity;
      promptSet?: 'v1' | 'v2' | 'current';
    }): string {
      const prompt = promptFileSha256(values.promptSet ?? 'v1');
      const invocation = values.invocation;
      const controls = invocation?.controls;
      const json =
        '{"closurePolicy":{"expansion":"served_sources_in_force","referenceDepth":1,"referenceKinds":["references"],' +
        '"structuralKinds":["amends","amendedBy","consolidates","definesTermsFor"]},' +
        '"closureRendererVersion":"1.1.0",' +
        (invocation === undefined
          ? ''
          : '"invocation":{' +
            (controls === undefined ? '' : `"controls":{${Object.entries(controls).map(([name, value]) => `"${name}":"${value}"`).join(',')}},`) +
            `"effort":"${invocation.effort}","executable":{"sha256":"${invocation.executable.sha256}",` +
            `"version":"${invocation.executable.version}"},"maxOutputTokens":${invocation.maxOutputTokens}` +
            // The permission mode, where declared (`@3`): "permissionMode" sorts last inside the invocation.
            (invocation.permissionMode === undefined ? '' : `,"permissionMode":"${invocation.permissionMode}"`) +
            '},') +
        `"models":{"adjudicator":"${values.models.adjudicator}","prosecutor":"${values.models.prosecutor}","reader":"${values.models.reader}"},` +
        `"prompts":{"adjudicator":"${prompt.adjudicator}","prosecutor":"${prompt.prosecutor}","reader":"${prompt.reader}"},` +
        `"providerAdapter":{"id":"${values.providerAdapter.id}","version":"${values.providerAdapter.version}"},` +
        '"resultSchemaVersion":"1.3.0",' +
        '"roleConfig":{"lenses":["missing_criterion","wrong_conjunction","wrong_threshold_or_units","wrong_measurement_period",' +
        '"wrong_scope_type_or_addressee","superseded_or_miscited_provision","missing_exclusion"],' +
        '"order":["reader","prosecutor","adjudicator"],"prosecutorCount":7},' +
        '"scheme":"v3"}';
      return `pipeline-v3-${createHash('sha256').update(json, 'utf8').digest('hex')}`;
    }

    const OPUS_5 = { reader: 'claude-opus-5', prosecutor: 'claude-opus-5', adjudicator: 'claude-opus-5' };

    it('the hand-writer reproduces the HTTP literal and the @1 literal (its positive controls)', () => {
      expect(handWrittenIdentity({ models: OPUS_5, providerAdapter: { id: 'anthropic-messages', version: '1' } })).toBe(
        HTTP_PIPELINE_VERSION,
      );
      expect(handWrittenIdentity({ models: OPUS_5, providerAdapter: { id: 'claude-code-cli', version: '1' } })).toBe(
        SUBSCRIPTION_V1_PIPELINE_VERSION,
      );
    });

    it('the @2 identity over the v1 prompts and the S-002 closure is the literal', () => {
      expect(versionOf(subscriptionV2Config)).toBe(SUBSCRIPTION_V2_PIPELINE_VERSION);
    });

    it('SUBSCRIPTION_ROLE_CONFIG, as the capture harness exports it, gives the @2 literal and is the configuration written out above', () => {
      expect(versionOf(SUBSCRIPTION_ROLE_CONFIG)).toBe(SUBSCRIPTION_V2_PIPELINE_VERSION);
      expect(SUBSCRIPTION_ROLE_CONFIG).toEqual(subscriptionV2Config);
    });

    it('subscriptionRoleConfigFor maps each subscription adapter, by identity, to the literal configuration it must return, and refuses any other by name', () => {
      expect(subscriptionRoleConfigFor(CLAUDE_CODE_CLI_V2_ADAPTER)).toEqual(subscriptionV2Config);
      expect(subscriptionRoleConfigFor(CLAUDE_CODE_CLI_ADAPTER)).toEqual(subscriptionV1Config);
      expect('invocation' in subscriptionRoleConfigFor(CLAUDE_CODE_CLI_ADAPTER)).toBe(false);
      // By identity, not by object: a bare identity of each version is answered the same way.
      expect(subscriptionRoleConfigFor({ identity: { id: 'claude-code-cli', version: '2' } })).toEqual(subscriptionV2Config);
      expect(subscriptionRoleConfigFor({ identity: { id: 'claude-code-cli', version: '1' } })).toEqual(subscriptionV1Config);
      // `@3` has its own entry (plan 2026-10-17): its configuration, never `@2`'s.
      expect(subscriptionRoleConfigFor(CLAUDE_CODE_CLI_V3_ADAPTER)).toBe(SUBSCRIPTION_ROLE_CONFIG_V3);
      expect(subscriptionRoleConfigFor({ identity: { id: 'claude-code-cli', version: '3' } })).toBe(SUBSCRIPTION_ROLE_CONFIG_V3);
      expect(subscriptionRoleConfigFor({ identity: { id: 'claude-code-cli', version: '3' } })).not.toEqual(subscriptionV2Config);
      for (const [identity, key] of [
        [{ id: 'anthropic-messages', version: '1' }, 'anthropic-messages@1'],
        [{ id: 'claude-code-cli', version: '4' }, 'claude-code-cli@4'],
      ] as const) {
        expect(() => subscriptionRoleConfigFor({ identity }), key).toThrow(SubscriptionRouteMismatchError);
        expect(() => subscriptionRoleConfigFor({ identity }), key).toThrow(`the adapter handed in is ${key}`);
      }
    });

    it('and the hand-written derivation, independent of the builder, is the same literal', () => {
      expect(
        handWrittenIdentity({
          models: OPUS_5_5,
          providerAdapter: { id: 'claude-code-cli', version: '2' },
          invocation: INVOCATION_V2,
        }),
      ).toBe(SUBSCRIPTION_V2_PIPELINE_VERSION);
    });

    it('the hand-writer over the kept v2 prompt files reproduces the v2 @2 and @3 literals (the r2 capture ran under the @3 one), and over the current (v3) files the v3 literals the builder derives in the block at the end of this file', () => {
      expect(
        handWrittenIdentity({ models: OPUS_5_5, providerAdapter: { id: 'claude-code-cli', version: '2' }, invocation: INVOCATION_V2, promptSet: 'v2' }),
      ).toBe('pipeline-v3-9599bc1e617321fb8cae51bddaf8fe0d34445d97358290c0c4f32554084ce4a4');
      expect(
        handWrittenIdentity({
          models: OPUS_5_5,
          providerAdapter: { id: 'claude-code-cli', version: '3' },
          invocation: { ...INVOCATION_V2, permissionMode: 'default' },
          promptSet: 'v2',
        }),
      ).toBe('pipeline-v3-3d7265b786fff38fb3a12d7f01e3b75d219653611ddbc079bfd7c874a6bca750');
      expect(
        handWrittenIdentity({ models: OPUS_5_5, providerAdapter: { id: 'claude-code-cli', version: '2' }, invocation: INVOCATION_V2, promptSet: 'current' }),
      ).toBe('pipeline-v3-c3a654feeb5bed7787695fe69591834b62118efa1cf7d2f6e686215f975987d8');
      expect(
        handWrittenIdentity({
          models: OPUS_5_5,
          providerAdapter: { id: 'claude-code-cli', version: '3' },
          invocation: { ...INVOCATION_V2, permissionMode: 'default' },
          promptSet: 'current',
        }),
      ).toBe('pipeline-v3-55f2fd84f3774b9a7e7aab64d44e842021406b4ad9d018d0aae81882bfec742b');
    });

    it('a ceiling of 63,999 is a different pipeline', () => {
      const lower = versionOf({ ...subscriptionV2Config, invocation: { ...INVOCATION_V2, maxOutputTokens: 63999 } });
      expect(lower).toMatch(/^pipeline-v3-[0-9a-f]{64}$/);
      expect(lower).not.toBe(versionOf(subscriptionV2Config));
    });

    it('the same configuration with the invocation removed is a different pipeline', () => {
      const { invocation: _removed, ...withoutInvocation } = subscriptionV2Config;
      expect('invocation' in withoutInvocation).toBe(false);
      expect(versionOf(withoutInvocation)).not.toBe(versionOf(subscriptionV2Config));
    });

    // The launch controls (the spend controls' identity extension): the positive control that they are the only change,
    // then each way one map can differ from another, and the one way it cannot.
    it('the same configuration with its controls removed derives exactly the identity pinned before the controls joined it', () => {
      const { controls: _removed, ...withoutControls } = INVOCATION_V2;
      expect('controls' in withoutControls).toBe(false);
      expect(versionOf({ ...subscriptionV2Config, invocation: withoutControls })).toBe(SUBSCRIPTION_V2_PIPELINE_VERSION_WITHOUT_CONTROLS);
      expect(handWrittenIdentity({ models: OPUS_5_5, providerAdapter: { id: 'claude-code-cli', version: '2' }, invocation: withoutControls })).toBe(
        SUBSCRIPTION_V2_PIPELINE_VERSION_WITHOUT_CONTROLS,
      );
    });

    const { CLAUDE_CODE_DISABLE_REFUSAL_RETRY: _dropped, ...ONE_REMOVED } = CONTROLS_V2;
    it.each([
      ['one value changes (CLAUDE_CODE_MAX_RETRIES "1")', { ...CONTROLS_V2, CLAUDE_CODE_MAX_RETRIES: '1' }],
      ['one entry is added (CLAUDE_CODE_DISABLE_1M_CONTEXT "1")', { ...CONTROLS_V2, CLAUDE_CODE_DISABLE_1M_CONTEXT: '1' }],
      ['one entry is removed (CLAUDE_CODE_DISABLE_REFUSAL_RETRY)', ONE_REMOVED],
    ] as const)('the identity moves when %s', (_what, controls) => {
      // Against the builder's own digest of the unmoved configuration, not only the literal: a builder that dropped the
      // controls would derive one digest for every map, all different from the literal.
      const moved = versionOf({ ...subscriptionV2Config, invocation: { ...INVOCATION_V2, controls } });
      expect(moved).toMatch(/^pipeline-v3-[0-9a-f]{64}$/);
      expect(moved).not.toBe(versionOf(subscriptionV2Config));
      expect(moved).not.toBe(SUBSCRIPTION_V2_PIPELINE_VERSION);
    });

    it('the identity does not move when only the order of the controls\' keys does', () => {
      const reordered = Object.fromEntries(Object.entries(CONTROLS_V2).reverse());
      // Positive control: the order really differs, and the entries do not.
      expect(Object.keys(reordered)).not.toEqual(Object.keys(CONTROLS_V2));
      expect(reordered).toEqual(CONTROLS_V2);
      expect(versionOf({ ...subscriptionV2Config, invocation: { ...INVOCATION_V2, controls: reordered } })).toBe(SUBSCRIPTION_V2_PIPELINE_VERSION);
    });

    it('differs from both identities the migration must not move', () => {
      // Both conjuncts guard this block's own constants, not code under src/:
      // each compares two literals, and no src/ defect can red either. The
      // digest cases above, which hold `pipelineVersionFor` to each literal,
      // carry the evidence that the invocation moves the identity.
      expect(SUBSCRIPTION_V2_PIPELINE_VERSION).not.toBe(HTTP_PIPELINE_VERSION);
      expect(SUBSCRIPTION_V2_PIPELINE_VERSION).not.toBe(SUBSCRIPTION_V1_PIPELINE_VERSION);
    });

    /**
     * `claude-code-cli@3`: `@2` requesting `--permission-mode default`. Its
     * identity differs from `@2`'s in the adapter's version and in the
     * invocation's permission mode, and in nothing else. Every value is a
     * literal written here.
     */
    describe('the @3 subscription identity, which the version and the permission mode move', () => {
      /** `@3`'s invocation: `@2`'s, written out above, and the permission mode it requests. */
      const INVOCATION_V3: InvocationIdentity = { ...INVOCATION_V2, permissionMode: 'default' };
      const subscriptionV3Config: RoleConfig = {
        ...subscriptionV2Config,
        providerAdapter: { id: 'claude-code-cli', version: '3' },
        invocation: INVOCATION_V3,
      };
      /**
       * What `pipelineVersionFor` returned for the configuration above, over
       * the real prompts and S-002's closure. It was taken from this code on
       * 2026-10-17 by a placeholder run
       * (`task4-placeholder-identity.20261017T165440Z.log` in
       * `pilot-evidence/2026-10-17-opus55-cli-v3-permission-mode/`). There
       * the builder over this configuration, the builder over the harness's
       * export and the hand-written derivation all received this value.
       */
      const SUBSCRIPTION_V3_PIPELINE_VERSION = 'pipeline-v3-ecb06a30764aff78ecf25bde4a8c3e25fcf4d827ce336a5cd757863ae8eb332d';

      it('the @3 identity over the v1 prompts and the S-002 closure is the literal', () => {
        expect(versionOf(subscriptionV3Config)).toBe(SUBSCRIPTION_V3_PIPELINE_VERSION);
      });

      it('SUBSCRIPTION_ROLE_CONFIG_V3, as the capture harness exports it, gives the @3 literal and is the configuration written out above; @3\'s adapter declares that invocation', () => {
        expect(versionOf(SUBSCRIPTION_ROLE_CONFIG_V3)).toBe(SUBSCRIPTION_V3_PIPELINE_VERSION);
        expect(SUBSCRIPTION_ROLE_CONFIG_V3).toEqual(subscriptionV3Config);
        expect(CLAUDE_CODE_CLI_V3_ADAPTER.invocation).toEqual(INVOCATION_V3);
      });

      it('and the hand-written derivation, independent of the builder, is the same literal', () => {
        expect(handWrittenIdentity({ models: OPUS_5_5, providerAdapter: { id: 'claude-code-cli', version: '3' }, invocation: INVOCATION_V3 })).toBe(
          SUBSCRIPTION_V3_PIPELINE_VERSION,
        );
      });

      it('control (i): the exported @3 configuration with version "2" and no permission mode derives exactly @2\'s literal, so the version and the mode are its only differences', () => {
        const { permissionMode: _removed, ...withoutMode } = SUBSCRIPTION_ROLE_CONFIG_V3.invocation!;
        expect('permissionMode' in withoutMode).toBe(false);
        expect(versionOf({ ...SUBSCRIPTION_ROLE_CONFIG_V3, providerAdapter: { id: 'claude-code-cli', version: '2' }, invocation: withoutMode })).toBe(
          SUBSCRIPTION_V2_PIPELINE_VERSION,
        );
      });

      it('control (ii): each difference moves the identity on its own: the version without the mode, and the mode without the version, are two further pipelines', () => {
        const { permissionMode: _removed, ...withoutMode } = INVOCATION_V3;
        const versionOnly = versionOf({ ...subscriptionV3Config, invocation: withoutMode });
        const modeOnly = versionOf({ ...subscriptionV3Config, providerAdapter: { id: 'claude-code-cli', version: '2' } });
        for (const moved of [versionOnly, modeOnly]) {
          expect(moved).toMatch(/^pipeline-v3-[0-9a-f]{64}$/);
          expect(moved).not.toBe(SUBSCRIPTION_V2_PIPELINE_VERSION);
          expect(moved).not.toBe(SUBSCRIPTION_V3_PIPELINE_VERSION);
        }
        expect(versionOnly).not.toBe(modeOnly);
        // The hand-writer reaches both without the builder.
        expect(handWrittenIdentity({ models: OPUS_5_5, providerAdapter: { id: 'claude-code-cli', version: '3' }, invocation: withoutMode })).toBe(versionOnly);
        expect(handWrittenIdentity({ models: OPUS_5_5, providerAdapter: { id: 'claude-code-cli', version: '2' }, invocation: INVOCATION_V3 })).toBe(modeOnly);
      });

      it('control (iii): @2\'s configuration, as the harness exports it, still derives @2\'s literal, and @2\'s adapter declares no permission mode', () => {
        expect(versionOf(SUBSCRIPTION_ROLE_CONFIG)).toBe(SUBSCRIPTION_V2_PIPELINE_VERSION);
        expect('permissionMode' in CLAUDE_CODE_CLI_V2_ADAPTER.invocation!, "@2's invocation declares a permission mode").toBe(false);
      });
    });
  });
});

// ---------------------------------------------------------------------------
// The current (v3) prompt set: new identities; the v1 and v2 ones kept
// ---------------------------------------------------------------------------

describe('the v3 prompt set derives new identities over the S-002 closure, and the kept v1 and v2 sets still derive the historical ones', () => {
  const paths: VerifyPaths = {
    packDir: join(engineRoot, 'knowledge', 'csrd'),
    corpusDir: join(engineRoot, 'corpus'),
    verificationDir: join(engineRoot, 'verification'),
  };
  const world = readWorld(paths, 'csrd', 'CSRD-S-002');
  const closure = EntitledClosure.forSources(world.corpus, world.sourceRegister, world.pack, sourceIdsOf(world.requirement));
  const current = loadPromptSet();
  const v1 = loadHistoricalPromptSet('v1');
  const v2 = loadHistoricalPromptSet('v2');

  /**
   * Taken from `pipelineVersionFor` over the current prompt files on
   * 2026-10-18, once, after the v3 quote-hash instruction was written into
   * all three prompts (`CHECKPOINT-opus55-s002-capture-r2.md`, the repair
   * that followed r2), and corroborated above by the hand-written derivation
   * over the same files.
   */
  const V3_PROMPTS = {
    http: 'pipeline-v3-5fe9a880f0cc7ebe5200dddcdc0a4140506b34f465fd886b019d3c370ec7590b',
    at1: 'pipeline-v3-c5938591581a75c0a36e8827ef4e8c3408c256f429c7b472a5fbbe3e51a46481',
    at2: 'pipeline-v3-c3a654feeb5bed7787695fe69591834b62118efa1cf7d2f6e686215f975987d8',
    at3: 'pipeline-v3-55f2fd84f3774b9a7e7aab64d44e842021406b4ad9d018d0aae81882bfec742b',
  };
  /**
   * The v2 values: taken the same way on 2026-10-18 after the v2 prosecutor
   * and adjudicator were written (`HANDOFF-2026-10-18-s002-scope-vs-timing.md`);
   * the r2 capture's pre-flight printed the `at3` one. The v1 values beside
   * them are the ones pinned above and the ones the recordings carry.
   */
  const V2_PROMPTS = {
    http: 'pipeline-v3-a0f59e79d11d451d9993f253eb4f2efe665a8bdbd9d8a57339d2dfccea59fbe2',
    at1: 'pipeline-v3-a408775f89d1c930d1ddd6e856c0e3d4c7bd4ab5ce888b5bdae3f200be74b13c',
    at2: 'pipeline-v3-9599bc1e617321fb8cae51bddaf8fe0d34445d97358290c0c4f32554084ce4a4',
    at3: 'pipeline-v3-3d7265b786fff38fb3a12d7f01e3b75d219653611ddbc079bfd7c874a6bca750',
  };
  const V1_PROMPTS = {
    http: 'pipeline-v3-06789a364d220899535cbf0cc40fcd5b816becf4328be70b795f54340d4ad7c0',
    at1: 'pipeline-v3-fd3ed34d558145c09ef7105506c76767d1dc335ce2d82d57fbc6e2c148509ae5',
    at2: 'pipeline-v3-737f8d5015ea4249eef93cfa66c0b1b9bbb323fd633e7d5a71c26f453f8ce90e',
    at3: 'pipeline-v3-ecb06a30764aff78ecf25bde4a8c3e25fcf4d827ce336a5cd757863ae8eb332d',
  };

  it.each([
    ['http', DEFAULT_ROLE_CONFIG],
    ['at1', SUBSCRIPTION_ROLE_CONFIG_V1],
    ['at2', SUBSCRIPTION_ROLE_CONFIG],
    ['at3', SUBSCRIPTION_ROLE_CONFIG_V3],
  ] as const)('%s: the current set derives the v3 literal, the kept v2 set the v2 one, the kept v1 set the historical one', (key, config) => {
    expect(pipelineVersionFor({ prompts: current, config, closure })).toBe(V3_PROMPTS[key]);
    expect(pipelineVersionFor({ prompts: v2, config, closure })).toBe(V2_PROMPTS[key]);
    expect(pipelineVersionFor({ prompts: v1, config, closure })).toBe(V1_PROMPTS[key]);
    expect(new Set([V1_PROMPTS[key], V2_PROMPTS[key], V3_PROMPTS[key]]).size).toBe(3);
  });

  it('v2 differs from v1 in the prosecutor and adjudicator digests only, the reader being the same file; v3 differs from v2 in all three', () => {
    expect(promptHashes(v2).reader).toBe(promptHashes(v1).reader);
    expect(promptHashes(v2).prosecutor).not.toBe(promptHashes(v1).prosecutor);
    expect(promptHashes(v2).adjudicator).not.toBe(promptHashes(v1).adjudicator);
    for (const role of ['reader', 'prosecutor', 'adjudicator'] as const) {
      expect(promptHashes(current)[role], role).not.toBe(promptHashes(v2)[role]);
    }
  });
});
