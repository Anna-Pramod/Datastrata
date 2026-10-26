/**
 * What `/healthz` reports: whether this deployment can answer, and what it is answering from (DP1 plan, Task 8; PLT-6, its DP1
 * part).
 *
 * **Why a 200 from `/api/check` is not enough.** The runtime reads its knowledge and its verification state from disk, through
 * computed paths no build tracer can follow, so what reaches a deployment is whatever `verification-runtime-inputs.mjs` declared
 * and the tracing honoured. A member that does not arrive is fatal only for some: the ledger reads as *empty* when absent, and an
 * artifact built without it loads cleanly, answers 200 and reports every requirement unsigned. The standalone gate catches that
 * locally, by agreement against a fixture; on the host nothing would, unless the deployment says what it holds. So the report
 * carries a digest of each runtime-input directory, which Task 13's check 5 compares with the same digest computed in a clean
 * clone of the release commit, and refuses unless three things hold:
 *
 * ```
 * the pack       loaded with its integrity, by the same call the site makes (`loadVerifiedCsrdPack`)
 * the inputs     every runtime-input directory readable, each reported as {files, sha256}
 * the engine     a fixed synthetic check gives the cells the authored oracle states
 * ```
 *
 * **The directories are named the way the readers name them, never from the tracing globs.** A digest over the files the
 * declaration lists would agree with the artifact by construction, and a missing member would vanish from both sides at once
 * (evidence standard, failure mode 1). So the four directories are hand-named here (plan §10, "The agreement check's directory
 * list"), each resolved through the reading code's own resolution: `lib/pack.ts`'s `packDirOf`, `corpusDirOf` and
 * `verificationDirOf`, and, for the source register, the loader's `defaultSourceRegisterDir`, which the engine does not export and
 * whose `src/` this phase does not change, so it is mirrored below with the loader cited. Every file beneath each directory counts,
 * so a file present in the repository and absent from the artifact changes the digest, whether or not anything declared it.
 *
 * **Except three files, by name.** The repository holds three files in these directories that no reader opens and the tracing
 * never ships: the requirement note `verification/CSRD-S-001.md`, the draft watch-sweep prompt `monitoring/automation-prompt.md`
 * (which the gate's artifact-hygiene rule keeps out of the artifact), and `corpus/.gitkeep`. Counting them would make the hosted
 * digest differ from the clean clone's for ever, and check 5 could never pass. They are left out by exact path rather than by a
 * pattern such as `*.md`, so the check stays failing-safe: any other file added to these directories later, traced or not, still
 * changes the digest.
 *
 * **The digest is the one `shasum` writes.** One line per counted file, `<sha256>  <path relative to the directory>\n`, sorted by
 * path in code-unit order (the order `LC_ALL=C sort` gives these ASCII paths), and the sha256 of the lines concatenated; `files`
 * is the number of lines. A clean clone can recompute it with standard tools and nothing from this repository.
 *
 * **Never fold a directory path for the build tracer.** `@vercel/nft` folds `join(process.cwd(), …)`, and a folded path that is
 * a directory is emitted whole into `.next/standalone` (`lib/pack.ts`, `candidatePackManifests`). Were one of these directories
 * foldable, everything in it would ship whether declared or not, the digest could never show a missing member, and the gate's
 * artifact-hygiene guard would fail. So every directory walked here is derived from the engine root handed in, which the route
 * takes from `engineRoot()` at request time, and this module holds no literal path, no working directory and no clock.
 *
 * **Refused, never downgraded.** Each part's failure is caught and becomes that part's `null` or `refused`, never a message:
 * `engineRoot()`'s error carries absolute paths, and an integrity failure carries paths and details, and none of it may reach the
 * body or the log. The 503 body is the same shape as the 200, with `status: refused`.
 *
 * **`healthReport` is pure.** It is handed what the route observed, including the two host variables as the route read them, and
 * decides; `gatherHealth` does the I/O for one engine root, so a fixture repository and the real one run the same production path,
 * as `loadVerifiedCsrdPack(root)` does.
 */

import 'server-only';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import type { KnowledgePack } from '@datastrata/engine';
import type { CheckerAnswers } from '@/lib/check-answers';
import { buildCheckTimeline, CHECK_START_YEARS, type CheckCell } from '@/lib/check-timeline';
import { corpusDirOf, loadVerifiedCsrdPack, packDirOf, verificationDirOf } from '@/lib/pack';

// ---------------------------------------------------------------------------
// The deployment's identity
// ---------------------------------------------------------------------------

/**
 * The commit the platform says this deployment was built from (`VERCEL_GIT_COMMIT_SHA`), or `unknown`.
 *
 * Only a value of exactly 40 lowercase hexadecimal characters is believed. Anything else is `unknown`: never echoed, trimmed or
 * repaired, and never guessed from git or a build-time constant, because a release that is not the platform's word for the commit
 * would make Task 13's "release equals the commit" pass for the wrong reason. The log line takes its `release` from this function
 * too, so the two can never disagree.
 */
export function releaseOf(value: string | undefined): string {
  return value !== undefined && /^[0-9a-f]{40}$/.test(value) ? value : 'unknown';
}

/**
 * The platform's identifier for this deployment (`VERCEL_DEPLOYMENT_ID`), or `unknown`.
 *
 * Not a secret: the framework sends it to every browser for skew protection (`HOST-VARIABLES-SOURCE.md`). Believed only as 1 to
 * 64 characters of `[A-Za-z0-9_-]`, the set the platform documents, so nothing else the variable might hold is ever repeated.
 */
export function deploymentOf(value: string | undefined): string {
  return value !== undefined && /^[A-Za-z0-9_-]{1,64}$/.test(value) ? value : 'unknown';
}

// ---------------------------------------------------------------------------
// The runtime-input directories and their digests
// ---------------------------------------------------------------------------

/** The four runtime-input directories, hand-named (plan §10), in the order the report gives them. */
export const RUNTIME_INPUT_KEYS = ['knowledge', 'corpus', 'verification', 'monitoring'] as const;
export type RuntimeInputKey = (typeof RUNTIME_INPUT_KEYS)[number];

/** Files the repository holds in those directories that no reader opens and the tracing never ships, relative to the engine root. */
export const UNSHIPPED_FILES: readonly string[] = ['verification/CSRD-S-001.md', 'monitoring/automation-prompt.md', 'corpus/.gitkeep'];

/**
 * Each directory, resolved the way the code that reads it resolves it, under the engine root handed in.
 *
 * `monitoring` mirrors the loader's `defaultSourceRegisterDir(packDir)`, `join(packDir, '..', '..', 'monitoring')`
 * (`backend/engine/src/knowledge/loader.ts`), which is where `loadPack` looks for `source-register.json` when no directory is
 * passed, as the site never passes one.
 */
export function runtimeInputDirectories(root: string): Record<RuntimeInputKey, string> {
  const knowledge = packDirOf(root);
  return {
    knowledge,
    corpus: corpusDirOf(root),
    verification: verificationDirOf(root),
    monitoring: join(knowledge, '..', '..', 'monitoring'),
  };
}

export interface DirectoryDigest {
  files: number;
  sha256: string;
}

const sha256Of = (bytes: Buffer | string): string => createHash('sha256').update(bytes).digest('hex');

/**
 * The digest of one runtime-input directory under `root`, or a throw when it is not readable.
 *
 * Readable means the directory exists, is a directory, and every counted file in it can be read. Links are followed, as the
 * readers' `readFileSync` follows them (the test fixtures link the real knowledge, corpus and registry); a link that does not
 * resolve, a link back into its own ancestry, an unreadable file, or anything that is neither a file nor a directory throws,
 * because a digest of what could be seen would not be a digest of what is there. An empty directory is readable: `files: 0`.
 */
export function directoryDigest(root: string, dir: string): DirectoryDigest {
  if (!statSync(dir).isDirectory()) throw new Error('not a directory');
  const base = relative(root, dir).split(sep).join('/');
  const unshipped = new Set(UNSHIPPED_FILES);
  const counted: { path: string; sha256: string }[] = [];

  const visit = (current: string, at: string, ancestors: readonly string[]): void => {
    const real = realpathSync(current);
    if (ancestors.includes(real)) throw new Error('a directory link that loops');
    const within = [...ancestors, real];
    for (const name of readdirSync(current)) {
      const path = at === '' ? name : `${at}/${name}`;
      const full = join(current, name);
      const stats = statSync(full);
      if (stats.isDirectory()) visit(full, path, within);
      else if (!stats.isFile()) throw new Error('neither a file nor a directory');
      else if (!unshipped.has(`${base}/${path}`)) counted.push({ path, sha256: sha256Of(readFileSync(full)) });
    }
  };
  visit(dir, '', []);

  counted.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const lines = counted.map(({ path, sha256 }) => `${sha256}  ${path}\n`).join('');
  return { files: counted.length, sha256: sha256Of(lines) };
}

// ---------------------------------------------------------------------------
// The fixed synthetic check
// ---------------------------------------------------------------------------

export interface HealthCheckCase {
  id: string;
  assessmentDate: string;
  answers: CheckerAnswers;
  routes: readonly { id: string; lines: readonly { kind: string; requirement: string; cells: readonly string[] }[] }[];
}

/**
 * One case of `test/checker-cases.json`, held here because `lib/` does not import from `test/` (a test holds the two equal).
 *
 * `eu-no-group-settled`: a German company with no group, over both thresholds and not a public-interest entity. It is small (two
 * rows, three lines), it is settled in every year, and its cells take three states, `does_not_apply` for 2025 and 2026 and
 * `applies` from 2027 on the individual route, and `requires_review` with its reason and need on the national line, so a column
 * run for the wrong year, a state moved or the national line lost is seen. Its date is the file's, never the clock.
 */
export const HEALTH_CHECK_CASE: HealthCheckCase = {
  id: 'eu-no-group-settled',
  assessmentDate: '2026-10-23',
  answers: { country: 'DE', group: 'none', organisation: 'private_limited', employees: 'over_1100', turnover: 'over_500m', pie: 'no' },
  routes: [
    {
      id: 'individual',
      lines: [
        { kind: 'first_application', requirement: 'CSRD-S-017', cells: ['does_not_apply', 'does_not_apply', 'applies', 'applies'] },
        { kind: 'duty', requirement: 'CSRD-S-020', cells: ['does_not_apply', 'does_not_apply', 'applies', 'applies'] },
      ],
    },
    {
      id: 'national',
      lines: [
        {
          kind: 'national',
          requirement: 'CSRD-S-013',
          cells: [
            'requires_review national_law_unresolved entity.governing_member_state',
            'requires_review national_law_unresolved entity.governing_member_state',
            'requires_review national_law_unresolved entity.governing_member_state',
            'requires_review national_law_unresolved entity.governing_member_state',
          ],
        },
      ],
    },
  ],
};

/**
 * A cell as `checker-cases.json` writes it: `<state> [<reason> [<firstNeed>[:<needReason>]]]`. The first need's own reason is
 * written only where the expected cell writes one, so the comparison asserts exactly what the case states (the file's `$format`).
 */
function inCaseEncoding(cell: CheckCell, expected: string): string {
  const parts: string[] = [cell.state];
  if (cell.reason !== undefined) parts.push(cell.reason);
  const first = cell.needs?.[0];
  if (first !== undefined) parts.push((expected.split(' ')[2] ?? '').includes(':') ? `${first.factType}:${first.reason}` : first.factType);
  return parts.join(' ');
}

/**
 * Whether the timeline over `pack`, for the fixed case's answers at its date, gives exactly the case's rows, lines and cells.
 * A throw from the timeline is not caught here: `gatherHealth` turns it into the engine part's failure.
 */
export function fixedCheckHolds(pack: KnowledgePack): boolean {
  const timeline = buildCheckTimeline(pack, HEALTH_CHECK_CASE.answers, HEALTH_CHECK_CASE.assessmentDate);
  const years = JSON.stringify(CHECK_START_YEARS);
  const got = timeline.routes.map((route, r) => ({
    id: route.id,
    lines: route.lines.map((line, l) => ({
      kind: line.kind,
      requirement: line.requirement,
      cells: line.cells.map((cell, y) => inCaseEncoding(cell, HEALTH_CHECK_CASE.routes[r]?.lines[l]?.cells[y] ?? '')),
    })),
  }));
  const inYearOrder = timeline.routes.every((route) => route.lines.every((line) => JSON.stringify(line.cells.map((cell) => cell.startYear)) === years));
  return inYearOrder && JSON.stringify(got) === JSON.stringify(HEALTH_CHECK_CASE.routes);
}

// ---------------------------------------------------------------------------
// The report
// ---------------------------------------------------------------------------

export interface PackIdentity {
  version: string;
  legalSnapshot: string;
}

/** What `gatherHealth` observed under one engine root. */
export interface RuntimeObservations {
  /** The pack's identity when it loaded with its integrity; `null` when it did not. */
  pack: PackIdentity | null;
  /** Each directory's digest; `null` for one that was not readable. */
  inputs: Record<RuntimeInputKey, DirectoryDigest | null>;
  /** Whether the fixed synthetic check gave its expected cells; `false` when it differed, threw, or had no pack to run on. */
  fixedCheck: boolean;
}

/** Everything the report is decided from: the observations, and the two host variables as the route read them, unvalidated. */
export interface HealthObservations extends RuntimeObservations {
  commitSha: string | undefined;
  deploymentId: string | undefined;
}

export interface HealthReport {
  status: 'ok' | 'refused';
  release: string;
  deployment: string;
  pack: PackIdentity | null;
  inputs: Record<RuntimeInputKey, DirectoryDigest | null>;
  engine: 'ok' | 'refused';
}

const NOTHING_READ: Record<RuntimeInputKey, null> = { knowledge: null, corpus: null, verification: null, monitoring: null };

/** `fn`'s value, or `null` when it throws. The error is dropped: its text names paths, and none may reach the body or the log. */
function orNull<T>(fn: () => T): T | null {
  try {
    return fn();
  } catch {
    return null;
  }
}

/**
 * The observations for one engine root: the pack loaded, each directory digested, the fixed check run. `null` means no engine
 * root could be found, so nothing beneath one was observed. Never throws: every failure is that part's.
 */
export function gatherHealth(root: string | null): RuntimeObservations {
  if (root === null) return { pack: null, inputs: { ...NOTHING_READ }, fixedCheck: false };

  const dirs = runtimeInputDirectories(root);
  const inputs: Record<RuntimeInputKey, DirectoryDigest | null> = {
    knowledge: orNull(() => directoryDigest(root, dirs.knowledge)),
    corpus: orNull(() => directoryDigest(root, dirs.corpus)),
    verification: orNull(() => directoryDigest(root, dirs.verification)),
    monitoring: orNull(() => directoryDigest(root, dirs.monitoring)),
  };

  // What `csrdPack()` calls for the real root: the verification-aware load, which refuses a damaged record.
  const pack = orNull(() => loadVerifiedCsrdPack(root));
  if (pack === null) return { pack: null, inputs, fixedCheck: false };

  return {
    pack: { version: pack.version, legalSnapshot: pack.legalSnapshot },
    inputs,
    fixedCheck: orNull(() => fixedCheckHolds(pack)) === true,
  };
}

/**
 * The health report, decided from the observations alone: no I/O, no environment, no clock.
 *
 * `ok` only when the pack loaded, every directory was readable and the engine is `ok`; the engine is `ok` only when the pack
 * loaded and the fixed check held. Each part is reported as it was observed, so a refusal says which part failed and that the
 * others did not.
 */
export function healthReport(observed: HealthObservations): HealthReport {
  const engine = observed.pack !== null && observed.fixedCheck ? 'ok' : 'refused';
  const inputs: Record<RuntimeInputKey, DirectoryDigest | null> = {
    knowledge: observed.inputs.knowledge,
    corpus: observed.inputs.corpus,
    verification: observed.inputs.verification,
    monitoring: observed.inputs.monitoring,
  };
  const readable = RUNTIME_INPUT_KEYS.every((key) => inputs[key] !== null);
  return {
    status: observed.pack !== null && readable && engine === 'ok' ? 'ok' : 'refused',
    release: releaseOf(observed.commitSha),
    deployment: deploymentOf(observed.deploymentId),
    pack: observed.pack,
    inputs,
    engine,
  };
}
