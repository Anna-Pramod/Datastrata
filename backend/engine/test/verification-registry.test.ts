/**
 * Version-integrity registry — tests.
 *
 * The registry's whole job is to make a version number mean one thing
 * permanently. That is only true if two properties hold together: the loader
 * refuses a requirement whose content no longer matches the hash recorded
 * against its declared version, and the registry itself refuses to have an
 * existing (id, version) pair rebound to different content. Either one alone
 * is bypassable — the first by rewriting the registry, the second by never
 * checking it — so both are pinned here.
 *
 * The error-message assertions check that every offender is named, not that a
 * throw happened. A check that fails without saying which of sixteen
 * requirements moved sends the reader to read all sixteen.
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  assertVersionIntegrity,
  parseVersionRegistry,
  registerVersion,
  VersionIntegrityError,
  type VersionRegistry,
} from '../src/verification/registry';
import { requirementSchema } from '../src/knowledge/schema';
import { loadPack } from '../src/knowledge/loader';
import type { Requirement } from '../src/types';

const here = dirname(fileURLToPath(import.meta.url));

function requirement(overrides: Partial<Requirement> = {}): Requirement {
  return {
    id: 'REQ-TEST',
    title: 'Test requirement',
    program: 'TEST',
    decisionArea: 'Test area',
    plainEnglish: 'Test requirement plain English.',
    scopeType: 'legal_entity',
    relationshipClass: 'direct_legal',
    severity: 'medium',
    kind: 'boolean',
    condition: { op: 'exists', fact: 'entity.turnover' },
    legalStatus: 'in_force',
    derivedStatus: 'draft',
    statusReasons: [],
    sources: ['SRC-TEST'],
    version: 1,
    ...overrides,
  };
}

/** A stand-in content hash: deterministic, and obviously a function of content. */
const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_C = 'c'.repeat(64);

/** A `hashOf` that reads a per-requirement answer from a lookup table. */
function hasher(table: Record<string, string>): (r: Requirement) => string {
  return (r) => table[r.id] ?? HASH_C;
}

// ---------------------------------------------------------------------------
// parseVersionRegistry
// ---------------------------------------------------------------------------

describe('parseVersionRegistry', () => {
  it('accepts an empty registry', () => {
    expect(parseVersionRegistry({})).toEqual({});
  });

  it('accepts requirement ids mapping version strings to hashes', () => {
    const raw = { 'REQ-1': { '1': HASH_A, '2': HASH_B }, 'REQ-2': { '1': HASH_C } };
    expect(parseVersionRegistry(raw)).toEqual(raw);
  });

  it('retains every historical mapping rather than only the latest', () => {
    const parsed = parseVersionRegistry({ 'REQ-1': { '1': HASH_A, '2': HASH_B, '3': HASH_C } });
    expect(Object.keys(parsed['REQ-1'] ?? {})).toEqual(['1', '2', '3']);
  });

  it('rejects a version key that is not a positive integer', () => {
    expect(() => parseVersionRegistry({ 'REQ-1': { '0': HASH_A } })).toThrow();
    expect(() => parseVersionRegistry({ 'REQ-1': { '1.5': HASH_A } })).toThrow();
    expect(() => parseVersionRegistry({ 'REQ-1': { latest: HASH_A } })).toThrow();
  });

  it('rejects a value that is not a lowercase sha256 hex digest', () => {
    expect(() => parseVersionRegistry({ 'REQ-1': { '1': 'not-a-hash' } })).toThrow();
    expect(() => parseVersionRegistry({ 'REQ-1': { '1': HASH_A.toUpperCase() } })).toThrow();
  });

  it('rejects a non-object', () => {
    expect(() => parseVersionRegistry([])).toThrow();
    expect(() => parseVersionRegistry(null)).toThrow();
    expect(() => parseVersionRegistry('{}')).toThrow();
  });
});

// ---------------------------------------------------------------------------
// registerVersion
// ---------------------------------------------------------------------------

describe('registerVersion', () => {
  it('adds a new requirement and a new version', () => {
    const one = registerVersion({}, 'REQ-1', 1, HASH_A);
    expect(one).toEqual({ 'REQ-1': { '1': HASH_A } });
    const two = registerVersion(one, 'REQ-1', 2, HASH_B);
    expect(two).toEqual({ 'REQ-1': { '1': HASH_A, '2': HASH_B } });
  });

  it('is pure — the input registry is not mutated', () => {
    const before: VersionRegistry = { 'REQ-1': { '1': HASH_A } };
    const after = registerVersion(before, 'REQ-1', 2, HASH_B);
    expect(before).toEqual({ 'REQ-1': { '1': HASH_A } });
    expect(after).not.toBe(before);
  });

  it('refuses to rebind an existing (id, version) to a different hash', () => {
    const before: VersionRegistry = { 'REQ-1': { '1': HASH_A } };
    expect(() => registerVersion(before, 'REQ-1', 1, HASH_B)).toThrow(/REQ-1/);
    expect(() => registerVersion(before, 'REQ-1', 1, HASH_B)).toThrow(/version 1/);
  });

  it('re-registering the same (id, version) with the same hash is a no-op', () => {
    const before: VersionRegistry = { 'REQ-1': { '1': HASH_A } };
    const after = registerVersion(before, 'REQ-1', 1, HASH_A);
    expect(after).toEqual(before);
  });

  it('rejects a version that is not an integer >= 1', () => {
    expect(() => registerVersion({}, 'REQ-1', 0, HASH_A)).toThrow();
    expect(() => registerVersion({}, 'REQ-1', 1.5, HASH_A)).toThrow();
    expect(() => registerVersion({}, 'REQ-1', -1, HASH_A)).toThrow();
  });

  it('rejects a hash that is not a lowercase sha256 hex digest', () => {
    expect(() => registerVersion({}, 'REQ-1', 1, 'nope')).toThrow();
  });
});

// ---------------------------------------------------------------------------
// assertVersionIntegrity
// ---------------------------------------------------------------------------

describe('assertVersionIntegrity', () => {
  it('passes when every requirement matches the hash recorded for its version', () => {
    const reqs = [requirement({ id: 'REQ-1', version: 1 }), requirement({ id: 'REQ-2', version: 3 })];
    const registry: VersionRegistry = { 'REQ-1': { '1': HASH_A }, 'REQ-2': { '1': HASH_A, '2': HASH_B, '3': HASH_C } };
    expect(() => assertVersionIntegrity(reqs, registry, hasher({ 'REQ-1': HASH_A, 'REQ-2': HASH_C }))).not.toThrow();
  });

  it('fails, naming the requirement, when content moved without a version bump', () => {
    const reqs = [requirement({ id: 'REQ-1', version: 1 })];
    const registry: VersionRegistry = { 'REQ-1': { '1': HASH_A } };
    let caught: unknown;
    try {
      assertVersionIntegrity(reqs, registry, hasher({ 'REQ-1': HASH_B }));
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(VersionIntegrityError);
    const problems = (caught as VersionIntegrityError).problems;
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('REQ-1');
    expect(problems[0]).toContain('version 1');
  });

  it('fails, naming the requirement, when a version was bumped but never registered', () => {
    const reqs = [requirement({ id: 'REQ-1', version: 2 })];
    const registry: VersionRegistry = { 'REQ-1': { '1': HASH_A } };
    let caught: unknown;
    try {
      assertVersionIntegrity(reqs, registry, hasher({ 'REQ-1': HASH_B }));
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(VersionIntegrityError);
    const problems = (caught as VersionIntegrityError).problems;
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('REQ-1');
    expect(problems[0]).toContain('version 2');
  });

  it('fails when a requirement has no registry entry at all', () => {
    const reqs = [requirement({ id: 'REQ-NEW', version: 1 })];
    expect(() => assertVersionIntegrity(reqs, {}, hasher({}))).toThrow(VersionIntegrityError);
  });

  it('names every offender, not the first', () => {
    const reqs = [
      requirement({ id: 'REQ-1', version: 1 }),
      requirement({ id: 'REQ-2', version: 1 }),
      requirement({ id: 'REQ-3', version: 4 }),
    ];
    const registry: VersionRegistry = { 'REQ-1': { '1': HASH_A }, 'REQ-2': { '1': HASH_A }, 'REQ-3': { '1': HASH_A } };
    let caught: unknown;
    try {
      // REQ-1 is clean; REQ-2 has moved; REQ-3 declares an unregistered version.
      assertVersionIntegrity(reqs, registry, hasher({ 'REQ-1': HASH_A, 'REQ-2': HASH_B, 'REQ-3': HASH_C }));
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(VersionIntegrityError);
    const problems = (caught as VersionIntegrityError).problems;
    expect(problems).toHaveLength(2);
    expect(problems.join('\n')).toContain('REQ-2');
    expect(problems.join('\n')).toContain('REQ-3');
    expect(problems.join('\n')).not.toContain('REQ-1');
  });

  it('reports every offender in the thrown message as well as in .problems', () => {
    const reqs = [requirement({ id: 'REQ-2', version: 1 }), requirement({ id: 'REQ-3', version: 1 })];
    const registry: VersionRegistry = { 'REQ-2': { '1': HASH_A }, 'REQ-3': { '1': HASH_A } };
    expect(() => assertVersionIntegrity(reqs, registry, hasher({ 'REQ-2': HASH_B, 'REQ-3': HASH_C }))).toThrow(
      /REQ-2[\s\S]*REQ-3/,
    );
  });

  it('checks the declared version, not merely the most recent hash on record', () => {
    // REQ-1 declares version 1 while its content is version 2's content. A
    // "latest hash we saw" check would pass this; keying by version does not.
    const reqs = [requirement({ id: 'REQ-1', version: 1 })];
    const registry: VersionRegistry = { 'REQ-1': { '1': HASH_A, '2': HASH_B } };
    expect(() => assertVersionIntegrity(reqs, registry, hasher({ 'REQ-1': HASH_B }))).toThrow(VersionIntegrityError);
  });
});

// ---------------------------------------------------------------------------
// The loader schema's `version` field
// ---------------------------------------------------------------------------

describe('the authored requirement schema', () => {
  it('accepts an integer version >= 1', () => {
    expect(requirementSchema.parse(requirement({ version: 1 })).version).toBe(1);
    expect(requirementSchema.parse(requirement({ version: 7 })).version).toBe(7);
  });

  it('rejects version 0', () => {
    expect(() => requirementSchema.parse(requirement({ version: 0 }))).toThrow();
  });

  it('rejects a non-integer version', () => {
    expect(() => requirementSchema.parse(requirement({ version: 1.5 }))).toThrow();
  });

  it('rejects a missing version', () => {
    const { version: _dropped, ...withoutVersion } = requirement();
    expect(() => requirementSchema.parse(withoutVersion)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// The loader wiring
//
// The pure function above can be perfect and still never run. These tests
// exercise `loadPack` itself, because the gate only bites if the loader calls
// it — and "we wrote the check" is exactly the kind of claim that survives a
// refactor which quietly stopped invoking it.
// ---------------------------------------------------------------------------

describe('loadPack version integrity', () => {
  const packDir = join(here, '..', 'knowledge', 'csrd');

  it('loads the real pack: every requirement matches its registered version', () => {
    expect(() => loadPack(packDir)).not.toThrow();
  });

  it('refuses to load when the registry file is absent', () => {
    const empty = mkdtempSync(join(tmpdir(), 'registry-absent-'));
    try {
      expect(() => loadPack(packDir, { versionRegistryDir: empty })).toThrow(VersionIntegrityError);
      expect(() => loadPack(packDir, { versionRegistryDir: empty })).toThrow(/no version registry/);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });

  it('refuses to load, naming the requirement, when a recorded hash does not match', () => {
    const dir = mkdtempSync(join(tmpdir(), 'registry-doctored-'));
    try {
      const real = JSON.parse(
        readFileSync(join(here, '..', 'verification', 'requirement-versions', 'csrd.json'), 'utf8'),
      ) as VersionRegistry;
      const doctored: VersionRegistry = { ...real, 'CSRD-S-001': { '1': 'd'.repeat(64) } };
      writeFileSync(join(dir, 'csrd.json'), JSON.stringify(doctored));
      expect(() => loadPack(packDir, { versionRegistryDir: dir })).toThrow(/CSRD-S-001/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
