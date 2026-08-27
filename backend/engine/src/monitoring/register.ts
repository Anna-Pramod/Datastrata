/**
 * Surface register loader + firewall.
 *
 * Corroboration is structural here, not procedural: a surface's tier decides
 * whether it may ever be cited, and the integrity check proves no pack cites a
 * surface that may not be. Nobody has to remember the rule.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import type { KnowledgePack } from '../types';
import { sourceIdsOf } from '../knowledge/provenance';
import type { RegisterSource, SourceAuthority, SourceRegister, SourceTier, TierPolicy } from './types';

export const TIER_POLICY: Record<SourceTier, TierPolicy> = {
  legal_record: { sufficientAlone: 'yes', citable: true, mustCorroborateWith: [] },
  official_body: { sufficientAlone: 'non_binding_only', citable: true, mustCorroborateWith: [] },
  tracker: { sufficientAlone: 'no', citable: false, mustCorroborateWith: ['legal_record'] },
  news: { sufficientAlone: 'no', citable: false, mustCorroborateWith: ['legal_record'] },
};

const tier = z.enum(['legal_record', 'official_body', 'tracker', 'news']);
const cadence = z.enum(['daily', 'daily_until_effective', 'weekly', 'monthly']);

const registerSource = z
  .object({
    id: z.string().regex(/^W-\d{3}$/, 'source id must be W-NNN'),
    tier,
    name: z.string().min(1),
    authority: z.string().min(1),
    url: z.string().url(),
    feed: z.string().url().nullable(),
    feedNote: z.string().min(1),
    governs: z.string().min(1),
    cadence,
    affectsRequirements: z.array(z.string()),
    expectedProvenance: z.array(z.string()),
    mustCorroborateWith: z.array(tier),
    lastSeen: z.string().nullable(),
    discoveredBy: z.string().min(1),
    tierRationale: z.string().min(1),
    onEvent: z.string().optional(),
  })
  .strict();

const sourceAuthority = z
  .object({
    sourceId: z.string().regex(/^SRC-\d{3}$/, 'authority sourceId must be SRC-NNN'),
    tier,
    rationale: z.string().min(1),
  })
  .strict();

const sourceRegister = z
  .object({
    program: z.string().min(1),
    updated: z.string().min(1),
    governingAuthorities: z.array(sourceAuthority),
    sources: z.array(registerSource).min(1),
  })
  .strict();

export class RegisterIntegrityError extends Error {
  constructor(public problems: string[]) {
    super(`Source register failed integrity checks:\n - ${problems.join('\n - ')}`);
  }
}

/** Structural validation + checks that need nothing outside the register. */
export function parseSourceRegister(raw: unknown): SourceRegister {
  const reg = sourceRegister.parse(raw) as SourceRegister;

  const problems: string[] = [];
  const seen = new Set<string>();
  for (const s of reg.sources) {
    if (seen.has(s.id)) problems.push(`${s.id}: duplicate source id`);
    seen.add(s.id);

    // mustCorroborateWith is stored per row so it is visible when reading the
    // register, but it is not a free choice — the tier decides it.
    const expected = TIER_POLICY[s.tier].mustCorroborateWith;
    const actual = s.mustCorroborateWith;
    const same = expected.length === actual.length && expected.every((t) => actual.includes(t));
    if (!same) {
      problems.push(
        `${s.id}: tier ${s.tier} requires mustCorroborateWith [${expected.join(', ')}], found [${actual.join(', ')}]`,
      );
    }
  }

  // Exactly one governing authority per source, checked rather than assumed.
  // "Exactly one" is the whole property this record exists to provide, so it is
  // asserted here rather than left to the shape of the data — an object keyed by
  // sourceId would collapse a duplicated key in `JSON.parse` and the second
  // statement would vanish where nothing could see it.
  const claimed = new Set<string>();
  for (const a of reg.governingAuthorities) {
    if (claimed.has(a.sourceId)) {
      problems.push(`${a.sourceId}: more than one governing authority — a source may have only one`);
    }
    claimed.add(a.sourceId);
  }

  if (problems.length > 0) throw new RegisterIntegrityError(problems);
  return reg;
}

/**
 * A source's governing authority, or a refusal.
 *
 * The one derivation. Reading a tier off a surface row that happens to name the
 * source in `expectedProvenance` is what this replaces: rows describe surfaces,
 * several may watch one source, and two of them disagree about tier by design
 * (W-004 official_body, W-005 legal_record, both watching SRC-007/SRC-008).
 */
export class NoGoverningAuthorityError extends Error {
  constructor(readonly sourceId: string) {
    super(
      `${sourceId} has no governing authority in the source register: a cited source must have exactly one statement of what it is and whether it may be cited — add an authorities entry rather than inferring a tier from whichever surface happens to watch it`,
    );
    this.name = 'NoGoverningAuthorityError';
  }
}

export function governingAuthorityFor(register: SourceRegister, sourceId: string): SourceAuthority {
  const found = register.governingAuthorities.find((a) => a.sourceId === sourceId);
  if (found === undefined) throw new NoGoverningAuthorityError(sourceId);
  return found;
}

/** Whether this source's governing authority permits it to be cited. */
export function isCitableSource(register: SourceRegister, sourceId: string): boolean {
  return TIER_POLICY[governingAuthorityFor(register, sourceId).tier].citable;
}

/**
 * Host comparison is deliberately coarse. A tracker hosted on a domain that
 * also serves citable content will trip this check — which is the intended
 * outcome: a human adjudicates rather than the tool guessing.
 */
function hostOf(url: string): string {
  return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
}

/**
 * Cross-validate the register against a loaded pack. Separate from parsing
 * because the register is meaningful on its own; only these checks need a pack.
 */
export function verifyRegisterIntegrity(register: SourceRegister, pack: KnowledgePack): void {
  const problems: string[] = [];
  const reqIds = new Set(pack.requirements.map((r) => r.id));
  const srcIds = new Set(pack.sources.map((s) => s.id));

  if (register.program !== pack.program) {
    problems.push(
      `register program ${register.program} does not match pack program ${pack.program} — this register cannot be cross-validated against this pack`,
    );
  }

  for (const s of register.sources) {
    for (const r of s.affectsRequirements) {
      if (!reqIds.has(r)) problems.push(`${s.id}: affects unknown requirement ${r}`);
    }
    for (const p of s.expectedProvenance) {
      if (!srcIds.has(p)) problems.push(`${s.id}: expectedProvenance cites unknown source ${p}`);
    }
  }

  for (const a of register.governingAuthorities) {
    if (!srcIds.has(a.sourceId)) {
      problems.push(`authority for ${a.sourceId}: pack ${pack.id} carries no such source`);
    }
  }

  // The firewall. sources.json is the citation record; a surface that may not
  // be cited must not appear there, or corroboration could be bypassed.
  const uncitable = new Map<string, string>();
  for (const s of register.sources) {
    if (!TIER_POLICY[s.tier].citable) uncitable.set(hostOf(s.url), `${s.id} (${s.tier})`);
  }
  // Scoped to sources a requirement actually cites, and to sources the register
  // has not classified.
  //
  // Both narrowings are the same correction. The check compares *hosts*, and a
  // host is shared: `eur-lex.europa.eu` carries the Official Journal and the
  // national transposition listing alike. Once one surface there is a tracker,
  // the unnarrowed check condemns every EUR-Lex source in the catalogue — the
  // host-coincidence defect of §19.2 running backwards, an unrelated row
  // *denying* authority rather than conferring it.
  //
  // What the firewall exists to stop is corroboration being bypassed by citing
  // a surface too weak to carry a determination. A catalogue entry no
  // requirement cites carries no determination, and a source the register has
  // classified is answered by that classification. What is left is the honest
  // residue: a cited source the register has never placed. Spec §19 replaces
  // the host rule outright at Task 5.
  const cited = new Set(pack.requirements.flatMap((r) => sourceIdsOf(r)));
  for (const ps of pack.sources) {
    if (!cited.has(ps.id)) continue;
    if (register.governingAuthorities.some((auth) => auth.sourceId === ps.id)) continue;

    const owner = uncitable.get(hostOf(ps.url));
    if (owner) {
      problems.push(
        `${ps.id} cites ${hostOf(ps.url)}, which the register lists as ${owner} — a non-citable tier must never appear in sources.json`,
      );
    }
  }

  if (problems.length > 0) throw new RegisterIntegrityError(problems);
}

/**
 * Every source a requirement's provenance names must be one the register
 * permits it to cite.
 *
 * The pack-side firewall above asks whether a *catalogue entry* may be cited.
 * This asks the question that actually decides a determination: a requirement
 * authored against a tracker would open an entitled closure over a surface the
 * register says carries no normative text, and the run would proceed as though
 * it did.
 *
 * Scoped to `governingAuthorities`, which is the one statement of what a source
 * is — not to whichever watch surface happens to name it, because several may
 * and two of them disagree by design.
 */
export function verifyRequirementCitability(register: SourceRegister, pack: KnowledgePack): void {
  const problems: string[] = [];
  for (const requirement of pack.requirements) {
    for (const sourceId of sourceIdsOf(requirement)) {
      const governing = register.governingAuthorities.find((a) => a.sourceId === sourceId);
      if (governing === undefined) {
        problems.push(
          `${requirement.id}: cites ${sourceId}, which has no governing authority in the source register`,
        );
        continue;
      }
      if (!TIER_POLICY[governing.tier].citable) {
        problems.push(
          `${requirement.id}: cites ${sourceId}, whose governing authority is ${governing.tier} — a non-citable tier may never back a requirement's provenance`,
        );
      }
    }
  }
  if (problems.length > 0) throw new RegisterIntegrityError(problems);
}

/**
 * Every host the pack cites must be a registered, citable surface.
 *
 * The firewall in verifyRegisterIntegrity is a blacklist — it catches a pack
 * citing a host the register already knows is a tracker. This is the whitelist
 * half: a cited host the register has never heard of is also a failure, which
 * is what makes product law 9 true rather than aspirational.
 */
export function verifyCitationCoverage(register: SourceRegister, pack: KnowledgePack): void {
  const citableHosts = new Set(
    register.sources.filter((s) => TIER_POLICY[s.tier].citable).map((s) => hostOf(s.url)),
  );

  const problems: string[] = [];
  for (const ps of pack.sources) {
    const governing = register.governingAuthorities.find((a) => a.sourceId === ps.id);

    // Where the register states what the source *is*, that governs. The host
    // rule below is what this replaces for such a source: it answers from
    // whichever surface happens to share a domain, which for a source watched by
    // two surfaces of different tiers was never an answer at all.
    if (governing !== undefined) {
      if (!TIER_POLICY[governing.tier].citable) {
        problems.push(
          `${ps.id} appears in sources.json, but its governing authority is ${governing.tier}, which may never be cited`,
        );
      }
      continue;
    }

    // Fallback, unchanged, for catalogue entries that have no governing
    // authority yet. It stays until every entry has one; spec §19 replaces the
    // host rule outright at Task 5.
    if (!citableHosts.has(hostOf(ps.url))) {
      problems.push(`${ps.id} cites ${hostOf(ps.url)}, which is not a citable surface in the register`);
    }
  }

  if (problems.length > 0) throw new RegisterIntegrityError(problems);
}

/**
 * Read and validate `source-register.json` from a directory. When a pack is
 * supplied, also cross-validate the register against it (referential
 * integrity, the citation firewall, and citation coverage) before returning —
 * the same discipline `loadPack` already applies unconditionally, made the
 * default here rather than something a caller has to remember to opt into.
 */
export function loadSourceRegister(dir: string, pack?: KnowledgePack): SourceRegister {
  const reg = parseSourceRegister(JSON.parse(readFileSync(join(dir, 'source-register.json'), 'utf8')));
  if (pack) {
    verifyRegisterIntegrity(reg, pack);
    verifyCitationCoverage(reg, pack);
    verifyRequirementCitability(reg, pack);
  }
  return reg;
}

export type { RegisterSource, SourceRegister, SourceTier, TierPolicy };
