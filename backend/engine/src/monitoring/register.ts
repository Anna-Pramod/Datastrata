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
import type { RegisterSource, SourceRegister, SourceTier, TierPolicy } from './types';

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

const sourceRegister = z
  .object({
    program: z.string().min(1),
    updated: z.string().min(1),
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

  if (problems.length > 0) throw new RegisterIntegrityError(problems);
  return reg;
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

  // The firewall. sources.json is the citation record; a surface that may not
  // be cited must not appear there, or corroboration could be bypassed.
  const uncitable = new Map<string, string>();
  for (const s of register.sources) {
    if (!TIER_POLICY[s.tier].citable) uncitable.set(hostOf(s.url), `${s.id} (${s.tier})`);
  }
  for (const ps of pack.sources) {
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
 * Every host the pack cites must be a registered, citable surface.
 *
 * The firewall in verifyRegisterIntegrity is a blacklist — it catches a pack
 * citing a host the register already knows is a tracker. This is the whitelist
 * half: a cited host the register has never heard of is also a failure, which
 * is what makes product law 9 true rather than aspirational.
 */
export function verifyCitationCoverage(register: SourceRegister, pack: KnowledgePack): void {
  const citable = new Set(
    register.sources.filter((s) => TIER_POLICY[s.tier].citable).map((s) => hostOf(s.url)),
  );
  const problems = pack.sources
    .filter((ps) => !citable.has(hostOf(ps.url)))
    .map((ps) => `${ps.id} cites ${hostOf(ps.url)}, which is not a citable surface in the register`);
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
  }
  return reg;
}

export type { RegisterSource, SourceRegister, SourceTier, TierPolicy };
