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
import { CLAUDE_CODE_CLI_ADAPTER, CLAUDE_CODE_CLI_IDENTITY, CLAUDE_CODE_CLI_V2_ADAPTER } from '../src/pipeline/claude-code-cli';
import type { RoleConfig } from '../src/pipeline/config';
import type { InvocationIdentity } from '../src/pipeline/provider-adapter';
import { readWorld, type VerifyPaths } from '../src/cli/sign';
import { sourceIdsOf } from '../src/knowledge/provenance';
import { engineRoot } from './replay-fixtures';
import { SUBSCRIPTION_ROLE_CONFIG, SUBSCRIPTION_ROLE_CONFIG_V1, subscriptionRoleConfigFor, SubscriptionRouteMismatchError } from './live-capture';

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

  it('the HTTP identity over the real prompts and the S-002 closure is the literal', () => {
    expect(
      pipelineVersionFor({ prompts: loadPromptSet(), config: DEFAULT_ROLE_CONFIG, closure: s002Closure() }),
    ).toBe(HTTP_PIPELINE_VERSION);
  });

  it('the @1 subscription identity over the real prompts and the S-002 closure is the literal', () => {
    expect(
      pipelineVersionFor({ prompts: loadPromptSet(), config: subscriptionV1Config, closure: s002Closure() }),
    ).toBe(SUBSCRIPTION_V1_PIPELINE_VERSION);
  });

  it('SUBSCRIPTION_ROLE_CONFIG_V1, as the capture harness exports it, gives the @1 literal and is the configuration written out above, with no invocation key at all', () => {
    // Moved here from Task 3, where the export did not exist yet (a parent decision).
    expect(
      pipelineVersionFor({ prompts: loadPromptSet(), config: SUBSCRIPTION_ROLE_CONFIG_V1, closure: s002Closure() }),
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
    const INVOCATION_V2: InvocationIdentity = {
      effort: 'high',
      maxOutputTokens: 64000,
      executable: { version: '2.1.295', sha256: '494870c9763b5ea370b6165e7e04af589a7b2472bf0de18ffb25477f8230bdf6' },
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
     * a placeholder run when the pin moved from 2.1.280 to 2.1.295 (the
     * 2.1.280 value, taken the same way on 2026-09-25, was
     * `pipeline-v3-e0570a08…f690`). Corroborated by the hand-written
     * derivation below, which reaches the same string without the builder and
     * reproduces both literals above.
     */
    const SUBSCRIPTION_V2_PIPELINE_VERSION = 'pipeline-v3-68c4d29bd770f9e7bc78f24cb2da97892a9da8f7c0bcabb499dff5301806a19a';

    const versionOf = (config: RoleConfig): string =>
      pipelineVersionFor({ prompts: loadPromptSet(), config, closure: s002Closure() });

    /**
     * SHA-256 of each prompt file's bytes, read and hashed here: the files
     * `prompts.ts` names, read without an encoding, as it reads them — but
     * through neither its loader nor `sha256Hex`.
     */
    function promptFileSha256(): Record<'reader' | 'prosecutor' | 'adjudicator', string> {
      const of = (file: string): string =>
        createHash('sha256').update(readFileSync(join(engineRoot, 'prompts', 'verification', file))).digest('hex');
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
     */
    function handWrittenIdentity(values: {
      models: { reader: string; prosecutor: string; adjudicator: string };
      providerAdapter: { id: string; version: string };
      invocation?: InvocationIdentity;
    }): string {
      const prompt = promptFileSha256();
      const invocation = values.invocation;
      const json =
        '{"closurePolicy":{"expansion":"served_sources_in_force","referenceDepth":1,"referenceKinds":["references"],' +
        '"structuralKinds":["amends","amendedBy","consolidates","definesTermsFor"]},' +
        '"closureRendererVersion":"1.1.0",' +
        (invocation === undefined
          ? ''
          : `"invocation":{"effort":"${invocation.effort}","executable":{"sha256":"${invocation.executable.sha256}",` +
            `"version":"${invocation.executable.version}"},"maxOutputTokens":${invocation.maxOutputTokens}},`) +
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

    it('the @2 identity over the real prompts and the S-002 closure is the literal', () => {
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
      for (const [identity, key] of [
        [{ id: 'anthropic-messages', version: '1' }, 'anthropic-messages@1'],
        [{ id: 'claude-code-cli', version: '3' }, 'claude-code-cli@3'],
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

    it('differs from both identities the migration must not move', () => {
      // Both conjuncts guard this block's own constants, not code under src/:
      // each compares two literals, and no src/ defect can red either. The
      // digest cases above, which hold `pipelineVersionFor` to each literal,
      // carry the evidence that the invocation moves the identity.
      expect(SUBSCRIPTION_V2_PIPELINE_VERSION).not.toBe(HTTP_PIPELINE_VERSION);
      expect(SUBSCRIPTION_V2_PIPELINE_VERSION).not.toBe(SUBSCRIPTION_V1_PIPELINE_VERSION);
    });
  });
});
