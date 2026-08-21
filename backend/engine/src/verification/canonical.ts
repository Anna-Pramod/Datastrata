/**
 * Canonical hashing of the logical payload.
 *
 * A signature (later work) pins hashes of what was checked against the law
 * on a given date, so that a material change afterwards is detected as
 * stale rather than silently standing over something it never covered.
 * This module decides what counts as material.
 *
 * Two properties are required and pull in different directions:
 *  - Key order must not matter. `Condition` and `Requirement` values move
 *    through JSON (files on disk, network responses) that does not promise
 *    field order, and the same encoding read twice must hash the same.
 *  - Array order MUST matter. `all[a, b]` and `all[b, a]` are logically
 *    equivalent but are not the same encoding, and a signature pins the
 *    encoding that was read, not its semantic equivalence class.
 *
 * The serialisation is `JSON.stringify` over a structure walked once to
 * sort every plain object's keys, leaving arrays untouched. `JSON.stringify`
 * escapes string content (quotes, delimiters, control characters) rather
 * than concatenating it, so a fact id or free-text value containing what
 * would otherwise be a field delimiter cannot shift a field boundary and
 * collide two structurally different conditions onto one hash. That exact
 * defect — delimiter-joining free text — reached Critical in B1a's closure
 * hash; this module does not repeat it.
 *
 * A case `label` is deliberately excluded from `logicalPayloadSha256`: it is
 * presentation (what a reader sees), not payload (what the engine selects).
 * Covering it would make a wording-only edit register as a changed
 * encoding and invalidate a signature over logic that never moved — the
 * alarm-fatigue failure this split exists to prevent. A label edit still
 * moves the rendered-text hash a later task pins, which is the correct,
 * weaker signal.
 */

import type { AuthoredRequirement, Condition, Requirement } from '../types';
import { sha256Hex } from '../corpus/hash';
import { requirementSchema } from '../knowledge/schema';

/** The subset of JSON values this module ever produces. */
type Canonical = null | boolean | number | string | Canonical[] | { [key: string]: Canonical };

/**
 * Recursively sorts object keys and leaves array order untouched. `undefined`
 * values are dropped, matching `JSON.stringify`'s own handling of an
 * `undefined` object property — so an absent optional field and one
 * explicitly set to `undefined` serialise identically, and there is exactly
 * one canonical text for a given logical value.
 */
function canonicalize(value: unknown): Canonical {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item));
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const sorted: { [key: string]: Canonical } = {};
    for (const key of Object.keys(record).sort()) {
      const v = record[key];
      if (v === undefined) continue;
      sorted[key] = canonicalize(v);
    }
    return sorted;
  }
  // string, number, boolean
  return value as Canonical;
}

/**
 * The one canonical serialisation in this system: key-sorted, array-order-
 * preserving, JSON-escaped text for any JSON-shaped value.
 *
 * Every hash below is `sha256Hex(canonicalJson(...))` of something, and the
 * ledger's `entryId` and the verification result's `resultSha256` join them.
 * That is deliberate and worth stating, because the alternative is not
 * hypothetical: this module previously reached for the private `canonicalize`
 * helper and called `JSON.stringify` at each site, which is a serialiser
 * defined four times over. Two canonical serialisers that disagree by one
 * character are two different answers to "is this still what was signed", and
 * the disagreement surfaces as a signature that mysteriously fails to verify
 * rather than as a diff anyone can read.
 *
 * `undefined` is dropped from objects and rendered as `null` elsewhere,
 * matching `JSON.stringify`'s own handling — so an absent optional field and
 * one explicitly set to `undefined` produce identical text, and a logical
 * value has exactly one canonical encoding.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

/**
 * Canonical text for a `Condition` tree: key-sorted, array-order-preserving
 * JSON. Two conditions differing only in JSON key order produce identical
 * text; two differing only in the order of an `of`/`set`/`prefixes`/`years`
 * array do not.
 */
export function canonicalizeCondition(condition: Condition): string {
  return canonicalJson(condition);
}

/** SHA-256 of `canonicalizeCondition(condition)`. */
export function conditionSha256(condition: Condition): string {
  return sha256Hex(canonicalizeCondition(condition));
}

/**
 * The logical payload a requirement's determination is computed from.
 *  - `boolean` requirements: the `condition`.
 *  - `selection` requirements: the ordered `cases[]` (each case's `when`
 *    and `value` — never `label`, which is presentation) and `defaultValue`.
 *
 * Reordering cases, changing an emitted value, or changing the default are
 * each semantic edits, and each moves this hash; relabelling a case does
 * not.
 *
 * The payload also carries an explicit `kind` discriminator (not required by
 * the spec, added here) so a boolean requirement's condition can never hash
 * identically to a selection requirement's single-case cases[]/defaultValue
 * shape by coincidence of structure.
 *
 * `AuthoredRequirement`, because the payload is authored logic and nothing the
 * loader attaches afterwards may reach it. Its two siblings below still take a
 * whole `Requirement`: `requirementSha256` parses through `requirementSchema`,
 * which strips the projected fields itself.
 */
export function logicalPayloadSha256(requirement: AuthoredRequirement): string {
  const payload =
    requirement.kind === 'boolean'
      ? { kind: 'boolean', condition: requirement.condition }
      : {
          kind: 'selection',
          cases: (requirement.cases ?? []).map((c) => ({ when: c.when, value: c.value })),
          defaultValue: requirement.defaultValue,
        };
  return sha256Hex(canonicalJson(payload));
}

/**
 * Covers exactly the verification input: the provision citation, the cited
 * `sources[]`, and `logicalPayloadSha256`. Nothing else — per spec §4.2 this
 * must move when the verification input changes and stay still when an
 * unrelated field (e.g. `caution`) is edited.
 */
export function requirementInputSha256(requirement: Requirement): string {
  return sha256Hex(
    canonicalJson({
      provisions: requirement.provisions,
      sources: requirement.sources,
      logicalPayloadSha256: logicalPayloadSha256(requirement),
    }),
  );
}

/**
 * Covers the *whole authored requirement*, and is the hash the version
 * registry binds a `version` to. It answers a different question from its
 * sibling above: `requirementInputSha256` asks "did the verification input
 * move?", and deliberately ignores `caution` so that editing a warning does
 * not invalidate a signature over logic that never changed. This one asks
 * "did anything the author wrote change without a version bump?", so the
 * warning counts. Both exist; neither replaces the other.
 *
 * The domain is `requirementSchema.parse()`'s output, never a hand-written
 * list of field names. That one choice buys both properties the registry
 * needs, and a whitelist buys neither:
 *
 *  - A field added to the authored schema enters the hash automatically. A
 *    list would keep producing the old digest, and a hash that fails to move
 *    is indistinguishable from content that did not change — so the omission
 *    would never announce itself.
 *  - A field the loader attaches after validation (`derivedStatus`,
 *    `statusReasons`) can never enter it, because zod strips undeclared keys
 *    before this function sees them. Were they covered, recomputing a derived
 *    status would read as a requirement revision and trip version integrity
 *    on every status change.
 *
 * Parsing rather than trusting also normalises the value: an absent optional
 * and one explicitly set to `undefined` hash alike, as does the same record
 * read from two different JSON encodings.
 */
export function requirementSha256(requirement: Requirement): string {
  return sha256Hex(canonicalJson(requirementSchema.parse(requirement)));
}
