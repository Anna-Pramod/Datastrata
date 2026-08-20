/**
 * The version-integrity registry.
 *
 * A signature pins `requirementVersion`, and that pin is worth nothing unless
 * a version number means one thing permanently. Nothing enforced that: an
 * unsigned requirement has no ledger entry to compare against, so content
 * could be edited without a bump and no artefact anywhere would disagree.
 *
 * This module is that missing artefact — a record of which content hash each
 * declared version originally named. It retains every historical mapping
 * rather than the latest pair, because "matches the most recent hash we saw"
 * is a weaker claim than "matches the hash recorded for version 3": the first
 * accepts an old version number being quietly reused for new content, which is
 * exactly the reuse a signature's version pin must be able to rule out.
 *
 * Two properties have to hold together, and this module supplies both:
 * `assertVersionIntegrity` refuses content that has drifted from its declared
 * version, and `registerVersion` refuses to rebind an existing (id, version)
 * pair to different content. Without the second, "permanent meaning" would be
 * documentation — a note asking people not to edit a JSON file — rather than
 * an API property. Repairs stay possible, but only by adding a version, which
 * is the visible, reviewable act it should be.
 *
 * The registry can stop a load and can never decide a status: it is
 * classified `integrity`, never `authority`. It holds no verdicts, only
 * hashes, and it is deliberately stored under `verification/` rather than
 * beside the authored regulatory content it polices.
 *
 * Pure by construction — no filesystem, no clock. Reading the registry file
 * belongs to the loader; this module only parses what it is handed.
 */

import { z } from 'zod';
import type { Requirement } from '../types';

/**
 * Requirement id → version (as a decimal string) → lowercase SHA-256 hex.
 *
 * Versions are string keys because JSON object keys are strings; representing
 * them as numbers would mean a parse step that could disagree with the file.
 */
export interface VersionRegistry {
  [requirementId: string]: { [version: string]: string };
}

/** A decimal integer >= 1, with no leading zeros — one spelling per version. */
const VERSION_KEY = /^[1-9][0-9]*$/;

/** Lowercase hex SHA-256. Case is pinned so one digest has one spelling. */
const SHA256_HEX = /^[0-9a-f]{64}$/;

export class VersionIntegrityError extends Error {
  constructor(public problems: string[]) {
    super(`Requirement version integrity failed:\n - ${problems.join('\n - ')}`);
    this.name = 'VersionIntegrityError';
  }
}

const versionRegistrySchema = z.record(
  z.string(),
  z.record(
    z.string().regex(VERSION_KEY, 'version keys must be decimal integers >= 1 with no leading zeros'),
    z.string().regex(SHA256_HEX, 'registry values must be lowercase hex SHA-256 digests'),
  ),
);

/**
 * Validates the on-disk registry shape. Version keys and digests are checked
 * rather than trusted: a key like `"latest"` or a digest with a `sha256:`
 * prefix would silently never match a computed hash, and the resulting failure
 * would read as "content changed" when the real fault is in the registry file.
 */
export function parseVersionRegistry(raw: unknown): VersionRegistry {
  return versionRegistrySchema.parse(raw);
}

/**
 * Binds `(requirementId, version)` to `sha256`, returning a new registry.
 *
 * Rebinding an existing pair to a *different* hash throws: that is the
 * operation which would give one version number two meanings. Re-registering
 * the identical hash is a no-op, so regenerating the registry from unchanged
 * content is safe and idempotent.
 */
export function registerVersion(
  registry: VersionRegistry,
  requirementId: string,
  version: number,
  sha256: string,
): VersionRegistry {
  if (!Number.isInteger(version) || version < 1) {
    throw new VersionIntegrityError([`${requirementId}: version must be an integer >= 1, got ${version}`]);
  }
  if (!SHA256_HEX.test(sha256)) {
    throw new VersionIntegrityError([`${requirementId}: version ${version} hash is not a lowercase sha256 hex digest`]);
  }

  const key = String(version);
  const existing = registry[requirementId]?.[key];
  if (existing !== undefined && existing !== sha256) {
    throw new VersionIntegrityError([
      `${requirementId}: version ${version} is already bound to ${existing} and cannot be rebound to ${sha256} — ` +
        'a version number has permanent meaning; bump the version instead',
    ]);
  }

  return {
    ...registry,
    [requirementId]: { ...(registry[requirementId] ?? {}), [key]: sha256 },
  };
}

/**
 * Fails when any requirement's current content hash differs from the hash
 * recorded against its declared `version`, or when its declared version has no
 * entry at all — content edited without a bump, and a bump without a
 * registration, are the same defect approached from opposite sides.
 *
 * Every offender is named. A pack edit typically touches several requirements
 * at once, and a check that reports only the first turns one repair into as
 * many read-fix-read cycles as there are offenders.
 *
 * `hashOf` is a parameter rather than an import so this module never needs to
 * know what "authored content" means; that definition lives with the pack
 * schema, and keeping it out of here is what keeps the registry decoupled from
 * both the filesystem and the shape of a requirement.
 */
export function assertVersionIntegrity(
  requirements: Requirement[],
  registry: VersionRegistry,
  hashOf: (r: Requirement) => string,
): void {
  const problems: string[] = [];

  for (const r of requirements) {
    const key = String(r.version);
    const recorded = registry[r.id]?.[key];
    const actual = hashOf(r);

    if (recorded === undefined) {
      problems.push(
        `${r.id}: declares version ${r.version}, which is not recorded in the registry — ` +
          `register ${actual} against it, or restore the version it was authored under`,
      );
      continue;
    }
    if (recorded !== actual) {
      problems.push(
        `${r.id}: content hashes to ${actual} but version ${r.version} is recorded as ${recorded} — ` +
          'the content changed without a version bump',
      );
    }
  }

  if (problems.length > 0) throw new VersionIntegrityError(problems);
}
