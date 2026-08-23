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
    // hands in `sources: []` to exercise the refusal — so the guard is over
    // the shared baseline, which is what nine test files inherit.
    expect(() => fixtureRequirement()).not.toThrow();
    expect(fixtureRequirement({ sources: [] }).sources).toEqual([]);
  });

  it('can be taken through both production hashes', () => {
    // The defect's symptom, inverted: `requirementSha256` parses through
    // `requirementSchema`, so on the old fixture it threw rather than
    // returning a digest. That it returns one now is the repair, observed at
    // the call site that found the defect.
    const requirement = fixtureRequirement() as Requirement;
    expect(requirementSha256(requirement)).toMatch(/^[0-9a-f]{64}$/);

    // `requirementInputSha256` covers provisions, sources and the logical
    // payload — neither corrected field reaches it. This digest is therefore
    // the one the fixture had *before* the correction, and its stillness is
    // what proves the repair moved only what it should have.
    expect(requirementInputSha256(requirement)).toBe(
      'd5ec1d9dd79d8256ead631d47ad6d78b6be7d844be125e8cfc800ca9ae623e49',
    );
  });
});
