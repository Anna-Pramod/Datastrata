/**
 * Installing a source register into a temporary world.
 *
 * Since D1(a) Task 4, `loadPack` refuses when no source register is present:
 * requirement-side citability is checked against it on every load, and a check
 * that skips itself when its input is missing is not a check. That made every
 * temp world in the suite incomplete — they copied `knowledge/` and `corpus/`
 * and nothing else, which had been fine only because the check quietly did
 * nothing without one.
 *
 * The register lives at `<worldRoot>/monitoring/source-register.json`, because
 * `defaultSourceRegisterDir` resolves `<packDir>/../../monitoring`. A world
 * whose pack sits at `<root>/knowledge/<packId>` therefore needs it at
 * `<root>/monitoring`.
 *
 * **One helper rather than a copy in each suite**, so the worlds cannot drift
 * into disagreeing about what a runtime world contains — and so that the day
 * the register gains a required field, there is one place to change.
 *
 * **Authority semantics are the caller's, not this module's.** `installReal`
 * copies the committed register verbatim, so a real-pack world gets the real
 * authorities. `installSynthetic` takes the authorities the test means to
 * assert. Neither hands out `legal_record` by default: giving every synthetic
 * source the most permissive tier to make a suite green would erase exactly the
 * distinction the citability tests exist to draw.
 *
 * **Not Task 5.** This is about whether a *source* may be cited. Whether a
 * corpus artefact is an authorised origin for the source it claims to serve is
 * `AuthorisedCorpus`, and nothing here decides it.
 */

import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const engineRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

/** `<worldRoot>/monitoring`, which is what `defaultSourceRegisterDir` finds. */
export function registerDirFor(worldRoot: string): string {
  return join(worldRoot, 'monitoring');
}

/** The committed register, copied — for worlds built from the real CSRD pack. */
export function installRealRegister(worldRoot: string): string {
  const dir = registerDirFor(worldRoot);
  mkdirSync(dir, { recursive: true });
  cpSync(join(engineRoot, 'monitoring', 'source-register.json'), join(dir, 'source-register.json'));
  return dir;
}

/** One governing authority, as a caller means it. */
export interface SyntheticAuthority {
  sourceId: string;
  tier: 'legal_record' | 'official_body' | 'tracker' | 'news';
  rationale?: string;
}

/**
 * A minimal valid register carrying exactly the authorities a test intends.
 *
 * `sources` needs at least one row to satisfy the schema, so a single inert
 * `legal_record` watch surface is written on a host nothing else in the suite
 * cites. It exists to make the document well-formed, not to grant anything:
 * `verifyRequirementCitability` reads `governingAuthorities` only.
 */
export interface SyntheticOrigin {
  sourceId: string;
  kind: 'exact' | 'path_prefix';
  url: string;
}

export function installSyntheticRegister(
  worldRoot: string,
  authorities: readonly SyntheticAuthority[],
  origins: readonly SyntheticOrigin[] = [],
  program = 'SYN',
): string {
  const dir = registerDirFor(worldRoot);
  mkdirSync(dir, { recursive: true });
  const register = {
    program,
    updated: '2026-08-27',
    // Artefact-origin declarations, where the world holds documents. A world
    // whose corpus claims a source must declare an origin for it: since T5.4
    // every production root authorises the corpus, so an undeclared source is
    // refused at load rather than ignored.
    authorisedOrigins: origins.map((o) => ({
      sourceId: o.sourceId,
      origins: [{ kind: o.kind, url: o.url }],
      rationale: `Fixture origin for ${o.sourceId}.`,
    })),
    governingAuthorities: authorities.map((a) => ({
      sourceId: a.sourceId,
      tier: a.tier,
      rationale: a.rationale ?? `Fixture authority for ${a.sourceId}.`,
    })),
    sources: [
      {
        id: 'W-001',
        tier: 'legal_record' as const,
        name: 'Fixture watch surface',
        authority: 'Fixture authority',
        url: 'https://example.invalid/fixture',
        feed: null,
        feedNote: 'Inert fixture row; the schema requires at least one surface.',
        governs: 'Nothing — present so the register document is well-formed.',
        cadence: 'weekly' as const,
        affectsRequirements: [],
        expectedProvenance: [],
        mustCorroborateWith: [],
        lastSeen: null,
        discoveredBy: 'test fixture',
        tierRationale: 'Fixture row, not consulted by requirement-side citability.',
      },
    ],
  };
  writeFileSync(join(dir, 'source-register.json'), `${JSON.stringify(register, null, 2)}\n`, 'utf8');
  return dir;
}
