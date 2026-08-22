/**
 * A repository the site can actually be pointed at, with verification state in
 * it.
 *
 * The real repository holds no signatures — deliberately, since the operational
 * signing gate is still closed. So every property the public resolver seam
 * claims is unobservable over it: a resolver that is never invoked reads
 * nothing, and a coverage test run against that would record only the *loader's*
 * reads while claiming to have measured the resolver's. That is failure mode 7
 * from the evidence standard, and a fixture with a governing signature over a
 * pinned result is what closes it.
 *
 * **It is a repository, not a mock.** The layout below is the production layout
 * — `backend/engine/{knowledge,corpus,verification}` beneath a root a process
 * can `chdir` into — so `lib/pack.ts` discovers it through the shipped
 * `CANDIDATE_ROOTS` probe and loads it through the shipped `loadPack`. Nothing
 * here replaces a production function. Authored knowledge, the corpus and the
 * version registry are symlinked to the real ones rather than copied, so the
 * fixture cannot drift from the content it claims to be about; only the
 * verification state — the ledger and the pinned results — is written.
 *
 * **The signatures are computed, never canned.** Every pinned hash comes from
 * the same producers the sign CLI uses, over the real requirement, the real
 * closure and the result file actually written. A fixture whose hashes were
 * typed by hand would be fresh only by coincidence, and would stop being fresh
 * the first time a normalizer, a renderer or a canonical form moved — for
 * reasons having nothing to do with what the test is about.
 */

import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { computeClosure, docsForSources, loadCorpus, loadPack } from '@datastrata/engine';
import type { KnowledgePack, LoadedCorpus, VerificationResult } from '@datastrata/engine';
import {
  requirementInputSha256,
  requirementSha256,
} from '../../../backend/engine/src/verification/canonical';
import {
  candidateConditionSha256,
  candidateRenderedConditionSha256,
} from '../../../backend/engine/src/verification/sign';
import { resultSha256 } from '../../../backend/engine/src/verification/result';
import { entryId, type SigningEntry, type UnsignedLedgerEntry } from '../../../backend/engine/src/verification/ledger';

/** The engine this repository's checkout actually holds. */
export const REAL_ENGINE_ROOT = resolve(process.cwd(), '..', '..', 'backend', 'engine');

export interface FixtureOptions {
  /**
   * Which requirements receive a governing signature. Defaults to every
   * requirement in the pack, which is what clears `containsDraftContent`.
   */
  requirementIds?: string[];
  /**
   * Pin a `normalizerVersion` the corpus no longer runs, so
   * `deriveStaleness` reports `normalizer_changed` and the resolver has to
   * renormalise the **retained raw bytes** to decide whether it is real.
   */
  pinNormalizerVersion?: string;
  /**
   * Pin a normalized hash the raw bytes cannot reproduce. Only meaningful
   * beside `pinNormalizerVersion`: it is what makes the renormalisation branch
   * *fail* to clear the reason, and is the counterexample proving the branch
   * decided something rather than merely ran.
   */
  pinUnreproducibleNormalizedHash?: boolean;
  /** Pin a `resultSha256` the written result does not hash to — `stale_result`. */
  driftResult?: boolean;
  /** Write no result file at all, leaving a signature over nothing — an integrity failure. */
  omitResults?: boolean;
}

export interface FixtureRepository {
  /** A working directory whose `backend/engine` the shipped probe finds. */
  repoRoot: string;
  /** `<repoRoot>/backend/engine`, the root `loadVerifiedCsrdPack` is given. */
  engineRoot: string;
  /** Every requirement carrying a governing signature. */
  signedIds: string[];
  /** Every requirement in the pack. */
  allIds: string[];
}

const PACK_ID = 'csrd';
const HASH_THAT_IS_NOT_THE_RESULT = 'f'.repeat(64);
const HASH_THAT_RAW_BYTES_CANNOT_REPRODUCE = 'e'.repeat(64);

/** A structurally valid result. Cross-field consistency is the sign gate's job, not this file's. */
function resultFor(
  pack: KnowledgePack,
  requirement: KnowledgePack['requirements'][number],
  corpus: LoadedCorpus,
  closure: { sha256: string; docIds: readonly string[] },
): VerificationResult {
  return {
    packId: pack.id,
    requirementId: requirement.id,
    requirementVersion: requirement.version,
    resultSchemaVersion: '1.2.0',
    pipelineVersion: 'fixture-pipeline-0.1.0',
    rendererVersion: 'fixture-renderer-0.1.0',
    requirementInputSha256: requirementInputSha256(requirement),
    conditionSha256: candidateConditionSha256(requirement),
    renderedConditionSha256: candidateRenderedConditionSha256(requirement, {
      factTypes: pack.factTypes,
      catalogues: pack.catalogues,
    }),
    corpusClosureSha256: closure.sha256,
    corpus: closure.docIds.map((docId) => {
      const document = corpus.document(docId);
      return {
        docId,
        versionLabel: document.versionLabel,
        sha256Raw: document.sha256Raw,
        sha256Normalized: document.sha256Normalized,
        normalizerVersion: document.normalizerVersion,
      };
    }),
    reading: { elements: [] },
    coverage: { cells: [] },
    challenges: [],
    openQuestions: [],
    gaps: [],
  };
}

/**
 * Writes verification state into an engine root that already holds authored
 * knowledge, a corpus and a version registry.
 *
 * **Separated from `buildFixtureRepository` because Task 3 installs this state
 * into a real repository rather than a synthesised one.** The deployment
 * agreement gate clones the checkout, installs the ledger and the pinned results
 * *at the production paths* inside that clone, and only then runs `next build`
 * — so that the tracing mechanism, and nothing else, is what carries them into
 * the standalone artifact. Post-build injection would make an untraced member
 * appear present and would void the test entirely, so the fixture has to be able
 * to land before the build, in a tree Next will trace from.
 *
 * Nothing here is specific to a temporary directory: `engineRoot` is whichever
 * `backend/engine` the caller wants signed, and the paths written beneath it are
 * the ones `lib/pack.ts` reads in production.
 */
export function installVerificationState(
  engineRoot: string,
  options: FixtureOptions = {},
): { signedIds: string[]; allIds: string[] } {
  const verificationDir = join(engineRoot, 'verification');
  mkdirSync(verificationDir, { recursive: true });

  // Emptied first, so what this function writes is a function of its arguments
  // alone. Installing into a real repository means the target may already carry
  // state, and a fixture that silently accumulated a previous run's entries
  // would make the comparison it exists to support depend on history.
  writeFileSync(join(verificationDir, 'signatures.jsonl'), '', 'utf8');

  // Read through the engine, with no ledger, purely to obtain the authored
  // content every hash below is taken over.
  const pack = loadPack(join(engineRoot, 'knowledge', PACK_ID), {
    versionRegistryDir: join(verificationDir, 'requirement-versions'),
    ledgerPath: join(verificationDir, 'signatures.jsonl'),
  });
  const corpus = loadCorpus(join(engineRoot, 'corpus'));
  const renderContext = { factTypes: pack.factTypes, catalogues: pack.catalogues };

  const allIds = pack.requirements.map((r) => r.id);
  const signedIds = options.requirementIds ?? allIds;
  const entries: SigningEntry[] = [];

  for (const requirementId of signedIds) {
    const requirement = pack.requirements.find((r) => r.id === requirementId);
    if (requirement === undefined) throw new Error(`fixture: pack carries no requirement ${requirementId}`);

    const closure = computeClosure(corpus.index, docsForSources(corpus.index, requirement.sources));
    const result = resultFor(pack, requirement, corpus, closure);

    if (options.omitResults !== true) {
      const path = join(verificationDir, PACK_ID, requirementId, 'verification-result.json');
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
    }

    const fields = {
      kind: 'ratified' as const,
      packId: pack.id,
      packVersion: pack.version,
      requirementId,
      requirementVersion: requirement.version,
      requirementSha256: requirementSha256(requirement),
      requirementInputSha256: requirementInputSha256(requirement),
      conditionSha256: candidateConditionSha256(requirement),
      renderedConditionSha256: candidateRenderedConditionSha256(requirement, renderContext),
      rendererVersion: 'fixture-renderer-0.1.0',
      corpusClosureSha256: closure.sha256,
      corpus: closure.docIds.map((docId) => {
        const document = corpus.document(docId);
        return {
          docId,
          versionLabel: document.versionLabel,
          sha256Raw: document.sha256Raw,
          sha256Normalized:
            options.pinUnreproducibleNormalizedHash === true
              ? HASH_THAT_RAW_BYTES_CANNOT_REPRODUCE
              : document.sha256Normalized,
          normalizerVersion: options.pinNormalizerVersion ?? document.normalizerVersion,
        };
      }),
      resultSha256: options.driftResult === true ? HASH_THAT_IS_NOT_THE_RESULT : resultSha256(result),
      pipelineVersion: 'fixture-pipeline-0.1.0',
      by: 'A. Reviewer',
      on: '2026-08-21',
    };

    entries.push({ ...fields, entryId: entryId(fields as unknown as UnsignedLedgerEntry) });
  }

  writeFileSync(
    join(verificationDir, 'signatures.jsonl'),
    entries.length === 0 ? '' : `${entries.map((entry) => JSON.stringify(entry)).join('\n')}\n`,
    'utf8',
  );

  return { signedIds, allIds };
}

export function buildFixtureRepository(options: FixtureOptions = {}): FixtureRepository {
  const repoRoot = mkdtempSync(join(tmpdir(), 'public-resolver-seam-'));
  const engineRoot = join(repoRoot, 'backend', 'engine');
  mkdirSync(engineRoot, { recursive: true });

  // Symlinked, not copied: the fixture must be about the real content.
  symlinkSync(join(REAL_ENGINE_ROOT, 'knowledge'), join(engineRoot, 'knowledge'));
  symlinkSync(join(REAL_ENGINE_ROOT, 'corpus'), join(engineRoot, 'corpus'));
  const verificationDir = join(engineRoot, 'verification');
  mkdirSync(verificationDir, { recursive: true });
  symlinkSync(
    join(REAL_ENGINE_ROOT, 'verification', 'requirement-versions'),
    join(verificationDir, 'requirement-versions'),
  );

  const { signedIds, allIds } = installVerificationState(engineRoot, options);
  return { repoRoot, engineRoot, signedIds, allIds };
}
