/**
 * The standing validity invariant over this suite's shared fixtures.
 *
 * Task 5b found `fixtureRequirement()` carrying `relationshipClass: 'direct'`
 * and `severity: 'blocking'` — neither is a member of the production enums.
 * It survived because nothing in the pipeline had ever taken a requirement
 * through `requirementSchema`: `requirementInputSha256` reads four authored
 * fields directly, and only `requirementSha256` parses. Assembly was the first
 * caller to need one, so it was the first to notice.
 *
 * A fixture the production schema rejects is not a smaller version of the real
 * thing; it is a different thing, and every property proved over it is proved
 * over something that could never be authored. This file makes that a standing
 * assertion rather than a discovery.
 */

import { describe, expect, it } from 'vitest';

import { requirementSchema } from '../src/knowledge/schema';
import { requirementInputSha256, requirementSha256 } from '../src/verification/canonical';
import type { Requirement } from '../src/types';
import { SHARED_REQUIREMENT_FIXTURES, fixtureRequirement } from './pipeline-fixtures';

describe('shared requirement fixtures are valid under the production schema', () => {
  it('lists at least one fixture, so the table below is not vacuously green', () => {
    expect(Object.keys(SHARED_REQUIREMENT_FIXTURES).length).toBeGreaterThan(0);
  });

  for (const [name, requirement] of Object.entries(SHARED_REQUIREMENT_FIXTURES)) {
    it(`${name}() parses through requirementSchema`, () => {
      const parsed = requirementSchema.safeParse(requirement);

      // Name the offending fields rather than asserting a bare boolean: the
      // failure this guards against is an authored value drifting out of an
      // enum, and "expected true, got false" would not say which one.
      const failures = parsed.success
        ? []
        : parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
      expect(failures).toEqual([]);
      expect(parsed.success).toBe(true);
    });
  }

  it('is reached from the ordinary call path, not only from this file', () => {
    // `fixtureRequirement()` parses its own base, so every consumer exercises
    // the gate. Overrides stay unparsed by design — `pipeline-reader.test.ts`
    // hands in an empty provenance to exercise the refusal — so the guard is over
    // the shared baseline, which is what nine test files inherit.
    expect(() => fixtureRequirement()).not.toThrow();
    expect(fixtureRequirement({ provenance: [] }).provenance).toEqual([]);
  });

  it('can be taken through both production hashes', () => {
    // The defect's symptom, inverted: `requirementSha256` parses through
    // `requirementSchema`, so on the old fixture it threw rather than
    // returning a digest. That it returns one now is the repair, observed at
    // the call site that found the defect.
    const requirement = fixtureRequirement() as Requirement;
    expect(requirementSha256(requirement)).toMatch(/^[0-9a-f]{64}$/);

    // A **frozen regression pin**, and nothing more than that.
    //
    // This literal is the provenance-era digest of this fixture, recorded once.
    // Its whole value is its *stillness*: if the payload's shape moves, or the
    // fixture's provenance changes, or `canonicalJson` starts ordering keys
    // differently, this line reddens and names the digest.
    //
    // It deliberately does **not** claim to establish that the payload shape is
    // *correct* — that is `verification-canonical.test.ts`'s job, and mutant
    // M-P1 (drop `provenance` from the hash) is what proves those assertions
    // live. Recorded 2026-08-27: this assertion briefly recomputed its own
    // expected value as `sha256Hex(canonicalJson({ provenance,
    // logicalPayloadSha256 }))` — the producer's own body on both sides, so
    // both moved together and it could no longer fail for any change to
    // `canonicalJson` or `logicalPayloadSha256`. A regression pin whose
    // expected side is computed is not a pin.
    expect(requirementInputSha256(requirement)).toBe(
      'a415715ce5573ea4daa8ac237d68ca53437f1fb49512b48ae33510a6a9596039',
    );
  });
});
