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
 *     v3  the set in `prompts/verification/` today: every role is told to
 *         copy a quote's `sha256Normalized` from its document's fence line,
 *         after r2 returned 120 quotes with the field empty and was refused
 *         at assembly (`CHECKPOINT-opus55-s002-capture-r2.md`); all three
 *         files change, the reader included
 */
export const CURRENT_PROMPT_SET_VERSION = 'v3';

export type HistoricalPromptSetVersion = 'v1' | 'v2';

export const HISTORICAL_PROMPT_SET_VERSIONS: readonly HistoricalPromptSetVersion[] = ['v1', 'v2'];

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
