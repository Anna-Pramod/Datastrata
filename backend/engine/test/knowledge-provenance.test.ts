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
 * mutation, not this file, is the teeth for the seam.
 *
 * What is worth testing here is what the derivation still has a choice about:
 * order, and whether anything authored escapes into a caller's hands.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sourceIdsOf } from '../src/knowledge/provenance';
import { loadPack, PackIntegrityError, SourceRegisterMissingError } from '../src/knowledge/loader';
import { RegisterIntegrityError } from '../src/monitoring/register';
import { installRealRegister } from './world-register';
import { requirementSchema } from '../src/knowledge/schema';
import { requirementSha256 } from '../src/verification/canonical';
import { citing, fixtureRequirement } from './pipeline-fixtures';

const engineRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('sourceIdsOf', () => {
  it('reports the cited sources in authored order', () => {
    const requirement = fixtureRequirement({ provenance: citing('SRC-100', 'SRC-900') });
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
    // A sorting body would not go entirely undetected — `requirementInputSha256`
    // hashes `provenance` verbatim, so reordering entries moves it and reddens
    // the canonical suite. But that red names a hash, not an ordering (failure
    // mode 2), so the property is asserted here, where the message says what
    // actually broke.
    const requirement = fixtureRequirement({ provenance: citing('SRC-900', 'SRC-100') });
    expect(sourceIdsOf(requirement)).toEqual(['SRC-900', 'SRC-100']);
  });

  it('hands back a fresh array, so a caller cannot edit the authored requirement', () => {
    const requirement = fixtureRequirement({ provenance: citing('SRC-100', 'SRC-900') });
    const derived = sourceIdsOf(requirement);

    derived.sort();
    derived.push('SRC-000');

    // The authored provenance is untouched …
    expect(requirement.provenance.map((e) => e.sourceId)).toEqual(['SRC-100', 'SRC-900']);
    // … and the next caller is unaffected by what the first one did to its copy.
    expect(sourceIdsOf(requirement)).toEqual(['SRC-100', 'SRC-900']);
  });

  it('reports an empty citation list as empty rather than refusing', () => {
    // An empty provenance is unreachable from a loaded pack — `.min(1)` in
    // knowledge/schema.ts forbids it — but the reader boundary has a live
    // branch for a requirement citing nothing (`reader.ts`), and that branch
    // reaches this derivation. Refusing here would convert a deliberate halt
    // into a crash.
    expect(sourceIdsOf(fixtureRequirement({ provenance: [] }))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The authored-field refusal, on the production load path
// ---------------------------------------------------------------------------

/**
 * A leftover authored `sources` or `provisions` must stop the pack loading.
 *
 * **Wiring evidence, unlike the block above.** `refuseAuthoredDerivedFields` is
 * the guard that keeps `provenance` the single authored declaration: with
 * `sources` derived, a record still carrying an authored one would present two
 * authorities for the same fact and nothing to say which wins. `requirementSchema`
 * cannot catch it — it is not `.strict()`, so zod silently drops the field and
 * the content hash is taken over what survives, leaving the stale value
 * invisible to every later check.
 *
 * These go through `loadPack` over a real pack on disk, not through the guard
 * directly, because the property at issue is that **production loading calls
 * it**. Recorded 2026-08-27: the guard had no test of any kind, and deleting
 * its call from `loadPack` left all 1451 engine tests green. A helper tested in
 * isolation would have left that mutant alive too.
 */
describe('a requirement that still authors a derived field', () => {
  let root = '';

  beforeEach(() => {
    // A complete runtime world: the pack two levels down so `<root>/monitoring`
    // is what `defaultSourceRegisterDir` resolves to, and the real register
    // installed there. `loadPack` refuses without it, so a world missing one
    // would red these tests for the wrong reason entirely.
    root = mkdtempSync(join(tmpdir(), 'authored-derived-'));
    mkdirSync(join(root, 'knowledge'), { recursive: true });
    cpSync(join(engineRoot, 'knowledge', 'csrd'), join(root, 'knowledge', 'csrd'), { recursive: true });
    installRealRegister(root);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  /** Puts `field` back onto the first authored record, as a stale edit would. */
  function reauthor(field: string, value: unknown): void {
    const path = join(root, 'knowledge', 'csrd', 'requirements.json');
    const records = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>[];
    records[0]![field] = value;
    writeFileSync(path, `${JSON.stringify(records, null, 2)}\n`, 'utf8');
  }

  const load = () =>
    loadPack(join(root, 'knowledge', 'csrd'), {
      versionRegistryDir: join(engineRoot, 'verification', 'requirement-versions'),
    });

  it('loads cleanly before the field is put back — the control', () => {
    // Without this, every refusal below could be a pack that fails to load for
    // some unrelated reason, which is the mutation-kills-for-the-wrong-reason
    // trap the evidence standard names.
    expect(() => load()).not.toThrow();
  });

  it('refuses an authored `sources`, naming the requirement and the field', () => {
    reauthor('sources', ['SRC-001']);
    // The specific guard, not merely "something threw". Both halves are named
    // so a different integrity failure cannot pass as this one.
    expect(() => load()).toThrow(PackIntegrityError);
    expect(() => load()).toThrow(/CSRD-S-001/);
    expect(() => load()).toThrow(/authored `sources`/);
  });

  it('refuses an authored `provisions`, the field the migration replaced', () => {
    reauthor('provisions', 'Accounting Directive Art. 19a');
    expect(() => load()).toThrow(PackIntegrityError);
    expect(() => load()).toThrow(/authored `provisions`/);
  });

  it('refuses even though the value agrees with the derivation', () => {
    // The case that makes this about *authority* rather than about staleness. A
    // correct-looking duplicate is still a second declaration of a derived
    // fact, and a guard that only caught disagreeing values would let the
    // two-authorities shape back in and fail only once they drifted.
    const authored = JSON.parse(
      readFileSync(join(root, 'knowledge', 'csrd', 'requirements.json'), 'utf8'),
    ) as { provenance: { sourceId: string }[] }[];
    reauthor('sources', authored[0]!.provenance.map((entry) => entry.sourceId));
    expect(() => load()).toThrow(/authored `sources`/);
  });
});

// ---------------------------------------------------------------------------
// Requirement-side citability, on the production load path
// ---------------------------------------------------------------------------

/**
 * A requirement may not rest on a source the register will not let it cite.
 *
 * **Wiring evidence.** `verifyRequirementCitability` asks the question the
 * pack-side firewall does not: not "is this host known" but "may this source
 * back a determination at all". A tracker reports that something happened; it
 * is not the text, and provenance resting on one would cite a notice board.
 *
 * Through `loadPack`, for the same reason as the block above and recorded the
 * same day: deleting the call from `loadPack` left all 1451 engine tests green.
 * The check ran only where nothing production reaches.
 *
 * Every fixture below moves exactly one thing from a world that loads cleanly,
 * and the version registry is recomputed so the load cannot fail for the
 * unrelated reason the evidence standard warns about — a `VersionIntegrityError`
 * arriving first would red these tests while proving nothing about citability.
 */
describe('a requirement resting on a source the register will not let it cite', () => {
  let root = '';
  let registerDir = '';
  let registryDir = '';

  /** The authority rows the real register carries, plus whatever a case adds. */
  function writeRegister(extra: Record<string, unknown>[]): void {
    const register = JSON.parse(
      readFileSync(join(engineRoot, 'monitoring', 'source-register.json'), 'utf8'),
    ) as { governingAuthorities: Record<string, unknown>[] };
    register.governingAuthorities = [...register.governingAuthorities, ...extra];
    writeFileSync(
      join(registerDir, 'source-register.json'),
      `${JSON.stringify(register, null, 2)}\n`,
      'utf8',
    );
  }

  /** Points the first requirement's provenance at `sourceId`, digest and all. */
  function citeInstead(sourceId: string): void {
    const path = join(root, 'csrd', 'requirements.json');
    const records = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>[];
    records[0]!['provenance'] = [{ sourceId, locators: [{ kind: 'whole_document' }] }];
    writeFileSync(path, `${JSON.stringify(records, null, 2)}\n`, 'utf8');

    const registryPath = join(registryDir, 'csrd.json');
    const registry = JSON.parse(readFileSync(registryPath, 'utf8')) as Record<
      string,
      Record<string, string>
    >;
    const parsed = requirementSchema.parse(records[0]);
    registry[parsed.id]![String(parsed.version)] = requirementSha256(parsed as never);
    writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`, 'utf8');
  }

  const load = () =>
    loadPack(join(root, 'csrd'), { versionRegistryDir: registryDir, sourceRegisterDir: registerDir });

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'citability-'));
    registerDir = join(root, 'monitoring');
    registryDir = join(root, 'requirement-versions');
    mkdirSync(registerDir, { recursive: true });
    mkdirSync(registryDir, { recursive: true });
    cpSync(join(engineRoot, 'knowledge', 'csrd'), join(root, 'csrd'), { recursive: true });
    cpSync(
      join(engineRoot, 'verification', 'requirement-versions', 'csrd.json'),
      join(registryDir, 'csrd.json'),
    );
    writeRegister([]);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('loads cleanly as authored — the control', () => {
    expect(() => load()).not.toThrow();
  });

  it('still loads when the re-authoring keeps a citable authority — the discriminator', () => {
    // Proves the refusals below are about the *tier*, not about re-authoring
    // provenance or about recomputing the digest. Without this, a loader that
    // refused every edited pack would look like a working citability check.
    writeRegister([
      { sourceId: 'SRC-015', tier: 'legal_record', rationale: 'Fixture: a citable authority.' },
    ]);
    citeInstead('SRC-015');
    expect(() => load()).not.toThrow();
  });

  it('accepts an official_body authority — the tier that discriminates the policy', () => {
    // **The control that separates "citable" from "is legal_record".**
    // `TIER_POLICY` marks both `legal_record` and `official_body` citable, and
    // every governing authority in the real register is `legal_record`, so a
    // suite whose only positive control is `legal_record` passes identically
    // against `governing.tier !== 'legal_record'` — an implementation that
    // silently rejects the standards-body tier. This is the case that fails
    // under that mutation, and the plan asked for it by name.
    writeRegister([
      {
        sourceId: 'SRC-015',
        tier: 'official_body',
        rationale: 'Fixture: a standards body publishing in its own right.',
      },
    ]);
    citeInstead('SRC-015');
    expect(() => load()).not.toThrow();
  });

  it('refuses provenance backed only by a tracker', () => {
    writeRegister([
      { sourceId: 'SRC-015', tier: 'tracker', rationale: 'Fixture: a watch surface, not the text.' },
    ]);
    citeInstead('SRC-015');
    expect(() => load()).toThrow(RegisterIntegrityError);
    expect(() => load()).toThrow(/non-citable tier/);
    expect(() => load()).toThrow(/SRC-015/);
  });

  it('refuses provenance backed by a source with no governing authority at all', () => {
    // The whitelist half: silence is not permission.
    citeInstead('SRC-010');
    expect(() => load()).toThrow(RegisterIntegrityError);
    expect(() => load()).toThrow(/no governing authority/);
  });
});

// ---------------------------------------------------------------------------
// The register is a required runtime input, not an optional one
// ---------------------------------------------------------------------------

/**
 * A pack whose source register is missing must refuse to load.
 *
 * **The rule this file exists to hold, and the one it originally got wrong.**
 * Requirement-side citability was guarded by `existsSync`, so a pack loaded
 * where no register sat was answered as though every citation were permitted.
 * That is precisely the shape `assertRequirementVersions` rejects for the
 * version registry — *an integrity check that can be switched off by deleting a
 * file is not an integrity check* — and it was not hypothetical: `monitoring/`
 * was not in the deployable closure, so the deployed site skipped citability
 * entirely while the loader's own comment claimed it ran there.
 *
 * **Missing register and unclassified source are different states.** A missing
 * register is a missing integrity dependency and refuses before any policy
 * runs. A present register that happens to carry no governing authority for
 * some source is the settled fallback path, asserted separately above. The
 * tests below keep them apart by asserting the *error type* rather than merely
 * that something threw.
 */
describe('a pack whose source register is absent', () => {
  let root = '';

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'no-register-'));
    mkdirSync(join(root, 'knowledge'), { recursive: true });
    cpSync(join(engineRoot, 'knowledge', 'csrd'), join(root, 'knowledge', 'csrd'), { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  const load = () =>
    loadPack(join(root, 'knowledge', 'csrd'), {
      versionRegistryDir: join(engineRoot, 'verification', 'requirement-versions'),
    });

  it('refuses, naming the missing integrity dependency', () => {
    expect(existsSync(join(root, 'monitoring', 'source-register.json'))).toBe(false);
    expect(() => load()).toThrow(SourceRegisterMissingError);
    // The path and the pack, so an operator reading the failure knows what did
    // not reach the artifact rather than that something was wrong.
    expect(() => load()).toThrow(/source-register\.json/);
    expect(() => load()).toThrow(/csrd/);
  });

  it('positive control: the identical world loads once the register is installed', () => {
    // Same pack, same registry, one file added. Without this the refusal above
    // would be satisfied by a world that could not load for any reason at all.
    installRealRegister(root);
    expect(() => load()).not.toThrow();
  });

  it('is a different failure from an unclassified source in a present register', () => {
    // The discrimination that keeps this test honest. Both states refuse; they
    // must not be interchangeable, or a missing register could pass as a
    // citability rejection and the fail-closed rule would be unfalsifiable.
    expect(() => load()).toThrow(SourceRegisterMissingError);

    // With the register present, a source it does not classify refuses — but as
    // a RegisterIntegrityError, from the policy rather than from the dependency.
    installRealRegister(root);
    const path = join(root, 'knowledge', 'csrd', 'requirements.json');
    const records = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>[];
    records[0]!['provenance'] = [{ sourceId: 'SRC-010', locators: [{ kind: 'whole_document' }] }];
    writeFileSync(path, `${JSON.stringify(records, null, 2)}\n`, 'utf8');

    const registryDir = join(root, 'rv');
    mkdirSync(registryDir, { recursive: true });
    const registry = JSON.parse(
      readFileSync(join(engineRoot, 'verification', 'requirement-versions', 'csrd.json'), 'utf8'),
    ) as Record<string, Record<string, string>>;
    const parsed = requirementSchema.parse(records[0]);
    registry[parsed.id]![String(parsed.version)] = requirementSha256(parsed as never);
    writeFileSync(join(registryDir, 'csrd.json'), `${JSON.stringify(registry, null, 2)}\n`, 'utf8');

    const withRegister = () =>
      loadPack(join(root, 'knowledge', 'csrd'), { versionRegistryDir: registryDir });
    expect(withRegister).toThrow(RegisterIntegrityError);
    expect(withRegister).not.toThrow(SourceRegisterMissingError);
  });
});
