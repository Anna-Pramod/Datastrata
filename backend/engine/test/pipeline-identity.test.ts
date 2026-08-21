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

  it('moves when the result schema version moves', () => {
    expect(buildPipelineIdentity({ ...baseline(), resultSchemaVersion: '1.1.0' })).not.toBe(before);
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
