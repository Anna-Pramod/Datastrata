/**
 * The source-id derivation, tested directly.
 *
 * **This file is contextual evidence, not wiring evidence.** It proves what
 * `sourceIdsOf` computes; it cannot prove that the production path asks it.
 * `docs/superpowers/TEST-EVIDENCE-STANDARD.md` names that gap explicitly — a
 * checker that reproduces the mechanism it checks agrees with its systematic
 * errors, and a helper tested in isolation says nothing about whether any
 * caller reaches it. The wiring is established by mutating the body to `[]` and
 * confirming the **run-level** suites red: `pipeline-source-completeness.test.ts`
 * (gap sets and zero-request halts) and the reader's request counts. That
 * mutation, not this file, is the teeth for Task 1.
 *
 * What is worth testing here is the part the identity body still has a choice
 * about: order, and whether the authored array escapes.
 */

import { describe, expect, it } from 'vitest';
import { sourceIdsOf } from '../src/knowledge/provenance';
import { fixtureRequirement } from './pipeline-fixtures';

describe('sourceIdsOf', () => {
  it('reports the cited sources in authored order', () => {
    const requirement = fixtureRequirement({ sources: ['SRC-100', 'SRC-900'] });
    expect(sourceIdsOf(requirement)).toEqual(['SRC-100', 'SRC-900']);
  });

  it('preserves a permutation rather than sorting it', () => {
    // The discriminating case, and the one property this file genuinely owns.
    //
    // Order is meaning: it is the order gaps are reported in when the corpus
    // serves none of the sources. But no run-level test pins that *through this
    // derivation* — `pipeline-reader.test.ts:324-330` pins gap ordering by
    // handing `unservedSourceGaps` a literal array, and the shared fixture
    // cites a single source (`pipeline-fixtures.ts:182`), so a sorting body
    // would leave both green.
    //
    // It would not go entirely undetected: five real requirements cite their
    // sources unsorted (CSRD-S-001 cites SRC-004 before SRC-001), so sorting
    // would move `requirementInputSha256` and redden the canonical suite. That
    // red names a hash, not an ordering — failure mode 2 in the evidence
    // standard — so the property is asserted here, where the message says what
    // actually broke.
    const requirement = fixtureRequirement({ sources: ['SRC-900', 'SRC-100'] });
    expect(sourceIdsOf(requirement)).toEqual(['SRC-900', 'SRC-100']);
  });

  it('hands back a copy, so a caller cannot edit the authored requirement', () => {
    const requirement = fixtureRequirement({ sources: ['SRC-100', 'SRC-900'] });
    const derived = sourceIdsOf(requirement);

    derived.sort();
    derived.push('SRC-000');

    expect(requirement.sources).toEqual(['SRC-100', 'SRC-900']);
    // And the next caller is unaffected by what the first one did to its copy.
    expect(sourceIdsOf(requirement)).toEqual(['SRC-100', 'SRC-900']);
  });

  it('reports an empty citation list as empty rather than refusing', () => {
    // `sources: []` is unreachable from a loaded pack — `min(1)` in
    // knowledge/schema.ts forbids it — but the reader boundary has a live
    // branch for it (`reader.ts`: a requirement citing no sources at all), and
    // that branch reaches this derivation. Refusing here would convert a
    // deliberate halt into a crash.
    expect(sourceIdsOf(fixtureRequirement({ sources: [] }))).toEqual([]);
  });
});
