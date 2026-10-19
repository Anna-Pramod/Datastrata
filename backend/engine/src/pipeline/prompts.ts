/**
 * Prompt files, and the hash that pins them.
 *
 * §5.1 pins **per-role prompt file hashes** into `pipelineVersion`. That word
 * "file" is the whole requirement: an identity that pins something the
 * repository cannot independently reproduce is a claim rather than a pin.
 * Anyone holding this repository at a given commit can run `shasum -a 256` over
 * `prompts/verification/reader.md` and get the number the identity was built
 * from. A hash of an inline template string, or a hash handed in as metadata
 * beside one, buys nothing: the value would be whatever the process that
 * produced it decided, and there would be no artifact to check it against.
 *
 * **A prompt assembled at runtime hashes the file, not the assembly.** The
 * prompt a role actually sends is the file plus the run's interpolated inputs.
 * Hashing that would produce a different `pipelineVersion` for every
 * requirement, which would make the identity a run identity and destroy its
 * one job — saying which pipeline this was. So the file is what is hashed, and
 * the interpolated inputs are transcript content (`transcript.ts`).
 *
 * **Bytes, not decoded text.** `readFileSync` without an encoding, hashed as a
 * buffer. A prompt file is a text file today, and hashing a decoded-then-
 * re-encoded rendition would make byte sequences that decode identically
 * collide — the same reasoning `corpus/store.ts` applies to `sha256Raw`.
 *
 * **Each prompt file is resolved individually, and never through a directory
 * path.** `@vercel/nft` statically folds a computed path, and a folded path that
 * turns out to be a *directory* is emitted **recursively**. That is not
 * hypothetical here: the public resolver seam's Task 1 shipped seventy files
 * where eighteen were declared because `lib/pack.ts` handed the tracer a
 * statically foldable path to the engine directory, and every gate stayed green
 * because everything the runtime needed was present
 * (`docs/superpowers/CHECKPOINT-public-resolver-seam.md`). Nothing outside
 * `src/pipeline/` imports this module today, but a barrel export is one line,
 * and the leak would be silent. So there is no `defaultPromptDir()`: each role's
 * default is a literal `new URL('…/reader.md', import.meta.url)`, which folds to
 * a single file. `backend/engine/prompts/**` is additionally in
 * `FORBIDDEN_IN_ARTIFACT` (`scripts/standalone-harness.mjs`), so a leak fails the
 * deployment gate rather than passing it quietly.
 *
 * This module reads files, which is why it lives under `src/pipeline/` and not
 * under `src/verification/`.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256Hex } from '../corpus/hash';
import { ROLE_NAMES, type RoleName } from './roles';

/** The file each role's prompt lives in, relative to the prompt directory. */
export const PROMPT_FILENAMES: Readonly<Record<RoleName, string>> = {
  reader: 'reader.md',
  prosecutor: 'prosecutor.md',
  adjudicator: 'adjudicator.md',
};

/**
 * Where the repository keeps them, relative to `backend/engine`.
 *
 * A label, not a path anything resolves: it is what the artifact-hygiene
 * denylist names and what a report cites. Resolving it against this module's
 * location is the construct that folds to a directory, and that is exactly what
 * this file does not do.
 */
export const PROMPT_ROOT = 'prompts';
export const PROMPT_DIR = `${PROMPT_ROOT}/verification`;

/** One role's prompt: the text it sends, and the hash the identity pins. */
export interface RolePrompt {
  role: RoleName;
  path: string;
  text: string;
  /** SHA-256 of the file's bytes. */
  sha256: string;
}

export type PromptSet = Readonly<Record<RoleName, RolePrompt>>;

/**
 * A prompt file is missing.
 *
 * Its own error rather than an `ENOENT` escaping, because a missing prompt is
 * not an I/O accident: it means the identity cannot be derived, so no run may
 * proceed and nothing may claim a `pipelineVersion`.
 */
export class MissingPromptFileError extends Error {
  constructor(
    readonly role: RoleName,
    readonly path: string,
  ) {
    super(
      `no prompt file for the ${role} role at ${path}: pipelineVersion pins per-role prompt file hashes, so a run cannot derive its identity without it`,
    );
    this.name = 'MissingPromptFileError';
  }
}

/**
 * The repository's own path for one role's prompt file.
 *
 * Three literal `new URL(...)` specifiers, each naming a **file**. Written out
 * rather than built from `PROMPT_DIR` and `PROMPT_FILENAMES` because a computed
 * specifier is the thing that folds: a tracer resolving
 * `new URL(\`../../prompts/verification/\${role}.md\`, import.meta.url)` cannot
 * know `role`, and the safe assumption it falls back on is the enclosing
 * directory. Three lines of duplication buy a fold that is a file every time.
 */
export function defaultPromptPath(role: RoleName): string {
  switch (role) {
    case 'reader':
      return fileURLToPath(new URL('../../prompts/verification/reader.md', import.meta.url));
    case 'prosecutor':
      return fileURLToPath(new URL('../../prompts/verification/prosecutor.md', import.meta.url));
    case 'adjudicator':
      return fileURLToPath(new URL('../../prompts/verification/adjudicator.md', import.meta.url));
  }
}

/**
 * Reads one role's prompt file and hashes its bytes.
 *
 * `path` defaults to the repository's own file for that role. A caller with a
 * directory in hand — a test over an edited copy — passes the joined path
 * itself, so no directory is ever resolved inside this module.
 */
export function loadRolePrompt(role: RoleName, path: string = defaultPromptPath(role)): RolePrompt {
  let bytes: Uint8Array;
  try {
    bytes = readFileSync(path);
  } catch {
    throw new MissingPromptFileError(role, path);
  }
  return { role, path, text: new TextDecoder().decode(bytes), sha256: sha256Hex(bytes) };
}

/**
 * Reads all three, so a run cannot start holding two of them.
 *
 * With no argument each file is read from its own literal path. With a
 * directory — which only a test ever supplies — the join happens here, at a
 * call site the tracer never sees a constant for.
 */
export function loadPromptSet(dir?: string): PromptSet {
  const set = {} as Record<RoleName, RolePrompt>;
  for (const role of ROLE_NAMES) {
    set[role] = loadRolePrompt(
      role,
      dir === undefined ? defaultPromptPath(role) : join(dir, PROMPT_FILENAMES[role]),
    );
  }
  return set;
}

// ---------------------------------------------------------------------------
// Versioned prompt sets
// ---------------------------------------------------------------------------

/**
 * The prompt set the repository ships today, and the earlier sets it keeps.
 *
 * A recording binds the prompt it was made under twice over: `promptSha256`
 * on every exchange, and the prompt's text inside the `requestSha256` digest
 * (`request-identity.ts`). So a recording made under an earlier set can be
 * replayed only against that set — and never by rewriting the recording,
 * weakening the digest, or re-recording it live. Each superseded set is
 * therefore kept byte for byte under `prompts/history/<version>/` — beside
 * `prompts/verification/`, never inside it, so that directory still holds
 * exactly the three current files —
 * and `loadHistoricalPromptSet` reads it the way `loadPromptSet` reads the
 * current one: three literal file paths, no directory resolution (the tracer
 * rule in this file's header applies to these paths too).
 *
 * The version label is for people; the identity is the digests. Two sets with
 * one differing file are two pipelines, and `pipelineVersion` says so without
 * reading the label.
 *
 *     v1  the set every recording before 2026-10-18 was made under: the S-001
 *         replay fixtures, the two probes, the rehearsal and the S-002 capture
 *     v2  the set the second S-002 capture (r2, 2026-10-18) ran under: the
 *         prosecutor and the adjudicator distinguish a challenge the closure
 *         can carry from a document a judgment genuinely needs; the reader is
 *         byte-identical to v1 (`HANDOFF-2026-10-18-s002-scope-vs-timing.md`)
 *     v3  the set the third S-002 capture (r3, 2026-10-18) ran under: every
 *         role is told to copy a quote's `sha256Normalized` from its
 *         document's fence line, after r2 returned 120 quotes with the field
 *         empty and was refused at assembly
 *         (`CHECKPOINT-opus55-s002-capture-r2.md`); all three files change,
 *         the reader included
 *     v4  the set the fourth S-002 capture (r4, 2026-10-19) ran under: the
 *         one-line delivery instruction every earlier set ended with ("Output
 *         the JSON object and nothing else.") is replaced by a paragraph
 *         naming the StructuredOutput tool — call it exactly once where it is
 *         offered, output the JSON object directly where it is not — after
 *         r3's prosecutor answered as a fenced text block, never called the
 *         tool, and the launch failed under the committed zero
 *         structured-output retries (`CHECKPOINT-opus55-s002-capture-r3.md`);
 *         nothing else in the three files changes, and the HTTP route, which
 *         offers no tool, keeps its direct JSON
 *     v5  the set in `prompts/verification/` today: every prompt gains the
 *         section "A relationship between documents carries its edge id" and
 *         a `relationships` entry under "What you are given" — the roles are
 *         shown the closure's edges under `# Entitled relationships`
 *         (closure-renderer grammar 1.2.0, `entitlement.ts`) and may name
 *         only those ids, copied character for character, falling back to
 *         quote evidence where no listed edge carries the relationship —
 *         after r4's reader named four edge ids the corpus does not hold and
 *         the record was filed with its evidence validation failed
 *         (`CHECKPOINT-opus55-s002-capture-r4.md`); each v5 file is its v4
 *         file with the section and the entry inserted and nothing else
 */
export const CURRENT_PROMPT_SET_VERSION = 'v5';

export type HistoricalPromptSetVersion = 'v1' | 'v2' | 'v3' | 'v4';

export const HISTORICAL_PROMPT_SET_VERSIONS: readonly HistoricalPromptSetVersion[] = ['v1', 'v2', 'v3', 'v4'];

/**
 * A prompt-set version the repository does not keep.
 *
 * Its own error, thrown at runtime, because the alternative was observed:
 * while v3 was being kept, `loadHistoricalPromptSet('v3')` fell through
 * `historicalPromptPath` to `undefined`, and `loadRolePrompt`'s default path
 * then read the CURRENT prompt file. A recording would have been replayed
 * against a prompt it was not made under and refused later for the wrong
 * reason — or, for a recording made under the current set, not refused at
 * all. The type union stops a literal at compile time; a value that reaches
 * this function through a cast or a parsed string must be stopped here, by
 * name, before any file is read.
 */
export class UnknownPromptSetVersionError extends Error {
  constructor(readonly version: string) {
    super(
      `no kept prompt set for version ${JSON.stringify(version)}: the kept sets are ${HISTORICAL_PROMPT_SET_VERSIONS.join(', ')} (under prompts/history/) and the current set is ${CURRENT_PROMPT_SET_VERSION} (prompts/verification/, read by loadPromptSet)`,
    );
    this.name = 'UnknownPromptSetVersionError';
  }
}

/** A superseded set's file for one role: literal paths, for the same reason `defaultPromptPath` uses them. */
export function historicalPromptPath(version: HistoricalPromptSetVersion, role: RoleName): string {
  switch (version) {
    case 'v1':
      switch (role) {
        case 'reader':
          return fileURLToPath(new URL('../../prompts/history/v1/reader.md', import.meta.url));
        case 'prosecutor':
          return fileURLToPath(new URL('../../prompts/history/v1/prosecutor.md', import.meta.url));
        case 'adjudicator':
          return fileURLToPath(new URL('../../prompts/history/v1/adjudicator.md', import.meta.url));
      }
    case 'v2':
      switch (role) {
        case 'reader':
          return fileURLToPath(new URL('../../prompts/history/v2/reader.md', import.meta.url));
        case 'prosecutor':
          return fileURLToPath(new URL('../../prompts/history/v2/prosecutor.md', import.meta.url));
        case 'adjudicator':
          return fileURLToPath(new URL('../../prompts/history/v2/adjudicator.md', import.meta.url));
      }
    case 'v3':
      switch (role) {
        case 'reader':
          return fileURLToPath(new URL('../../prompts/history/v3/reader.md', import.meta.url));
        case 'prosecutor':
          return fileURLToPath(new URL('../../prompts/history/v3/prosecutor.md', import.meta.url));
        case 'adjudicator':
          return fileURLToPath(new URL('../../prompts/history/v3/adjudicator.md', import.meta.url));
      }
    case 'v4':
      switch (role) {
        case 'reader':
          return fileURLToPath(new URL('../../prompts/history/v4/reader.md', import.meta.url));
        case 'prosecutor':
          return fileURLToPath(new URL('../../prompts/history/v4/prosecutor.md', import.meta.url));
        case 'adjudicator':
          return fileURLToPath(new URL('../../prompts/history/v4/adjudicator.md', import.meta.url));
      }
    default: {
      // Exhaustive over the union for the compiler, and a refusal for a value the compiler never saw.
      const unknown: never = version;
      throw new UnknownPromptSetVersionError(String(unknown));
    }
  }
}

/**
 * A superseded prompt set, read from its kept files.
 *
 * For replaying a recording against the contract it was made under: the
 * `pipelineVersion` and `runId` the recording carries derive from these
 * digests, so `bind` selects it and `run` re-derives each exchange's
 * `requestSha256` from the same prompt text. Nothing about the recording is
 * touched; the question is asked exactly as it was asked.
 */
export function loadHistoricalPromptSet(version: HistoricalPromptSetVersion): PromptSet {
  const set = {} as Record<RoleName, RolePrompt>;
  for (const role of ROLE_NAMES) set[role] = loadRolePrompt(role, historicalPromptPath(version, role));
  return set;
}

/** The per-role hashes, in the shape the identity builder takes. */
export function promptHashes(prompts: PromptSet): Readonly<Record<RoleName, string>> {
  return {
    reader: prompts.reader.sha256,
    prosecutor: prompts.prosecutor.sha256,
    adjudicator: prompts.adjudicator.sha256,
  };
}
