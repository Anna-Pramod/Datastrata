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

/**
 * The declaration path, with a trailing slash removed except at the root.
 *
 * Trailing slashes are the one difference the URL parser does **not** settle.
 * It already lowercases the host and drops a default `:443`, which is why
 * declarations are compared as parsed values rather than as authored strings:
 * `https://EUR-LEX.EUROPA.EU:443/x` and `https://eur-lex.europa.eu/x` are the
 * same permission, and two rows saying so would be one permission counted
 * twice.
 */
function canonicalDeclarationPath(parsed: URL): string {
  const path = parsed.pathname;
  return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
}

/** The identity two declarations share when they authorise the same surface. */
function canonicalOriginKey(kind: string, url: string): string {
  const parsed = new URL(url);
  return `${kind} ${parsed.origin}${canonicalDeclarationPath(parsed)}`;
}

/**
 * One surface a source has authorised to serve its artefacts.
 *
 * **This is not `governingAuthorities`, and the separation is the design.**
 * `governingAuthorities` says what kind of authority the *source* is — whether
 * a determination may rest on it at all. This says which *origins* that source
 * has authorised to carry its documents. A source can be a `legal_record` and
 * still not have authorised the surface some artefact came from; a corpus may
 * legitimately hold documents for sources no requirement currently cites. The
 * two questions have different answers and different owners, so they have
 * different rows.
 *
 * **What a match proves, stated exactly.** That the source has authorised the
 * origin this document *records*. It does **not** prove the bytes were fetched
 * from there: a local actor able to edit the corpus can edit `url` and the
 * hashes together. That stronger authenticity claim is envelope E2's and is not
 * made here, or anywhere in Task 5.
 *
 * Two matchers, deliberately no more:
 *
 * - `exact` — the artefact is that one document. Same origin, same pathname.
 * - `path_prefix` — the artefact is any document beneath a declared path. Same
 *   origin, and the candidate pathname either equals the declared one or
 *   continues it after a `/`. The boundary is what stops `/eli/dir/2013/34`
 *   from authorising `/eli/dir/2013/345`.
 *
 * No regex, glob or host matcher. A host matcher would be the §19.2 defect
 * itself: twelve of seventeen CSRD sources share `eur-lex.europa.eu`, so host
 * authority is no authority. Queries and fragments do not participate — these
 * two matchers are about path identity. That is a statement about *these*
 * matchers, not a claim that queries are never semantic; a source whose
 * document identity genuinely depends on a query needs a new declared matcher
 * kind, not a loosening of these.
 */
const authorisedOrigin = z
  .object({
    kind: z.enum(['exact', 'path_prefix']),
    url: z.string().url(),
  })
  .strict()
  .superRefine((value, ctx) => {
    let parsed: URL;
    try {
      parsed = new URL(value.url);
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${value.url}: not a parseable URL` });
      return;
    }
    // A declaration is matched against by parsing, so it must itself be
    // unambiguous. Each of these would otherwise make one declaration mean two
    // things depending on who normalised it.
    if (parsed.protocol !== 'https:') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${value.url}: authorised origins must be https` });
    }
    if (parsed.username !== '' || parsed.password !== '') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${value.url}: authorised origins must not carry credentials` });
    }
    if (parsed.search !== '') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${value.url}: authorised origins must not carry a query — these matchers compare path identity` });
    }
    if (parsed.hash !== '') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${value.url}: authorised origins must not carry a fragment — these matchers compare path identity` });
    }
    // A prefix of `/` is the host, and host authority is the defect. Declared
    // that way, `SRC-001` would authorise every EUR-Lex artefact — the twelve
    // sources sharing that host included — which is precisely what naming a
    // source-scoped origin exists to prevent. `exact` is unaffected: it
    // authorises one path and cannot widen to the host by accident.
    if (value.kind === 'path_prefix' && canonicalDeclarationPath(parsed) === '/') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${value.url}: a path_prefix must name a path beneath the origin — a root prefix authorises the whole host`,
      });
    }
  });

/**
 * The origins one source has authorised, as a row.
 *
 * `rationale` follows this register's own convention rather than machine need:
 * every declarative row here states why it exists (`tierRationale`, `feedNote`,
 * `governs`, `discoveredBy`, and `governingAuthorities.rationale`). An origin
 * declaration is a standing permission, and a permission with no recorded
 * reason is the kind nobody later dares narrow.
 */
const sourceAuthorisedOrigins = z
  .object({
    sourceId: z.string().regex(/^SRC-\d{3}$/, 'authorisedOrigins sourceId must be SRC-NNN'),
    origins: z.array(authorisedOrigin).min(1, 'a source with no authorised origin authorises nothing — omit the row instead'),
    // Required and non-empty, and **never consulted when matching**. It exists
    // so a standing permission records why it was granted; a matcher that read
    // it would make prose operative.
    rationale: z.string().min(1),
  })
  .strict();

const sourceRegister = z
  .object({
    program: z.string().min(1),
    updated: z.string().min(1),
    governingAuthorities: z.array(sourceAuthority),
    // A sibling of `governingAuthorities`, never nested inside it: source
    // authority and serving-artefact authority are different axes (§19.2).
    authorisedOrigins: z.array(sourceAuthorisedOrigins),
    sources: z.array(registerSource).min(1),
  })
  .strict()
  .superRefine((value, ctx) => {
    // One row per source. Two rows would be two answers to one question, with
    // nothing to say which governs — the shape the provenance migration spent
    // Task 4 removing from requirements.
    const seen = new Set<string>();
    for (const row of value.authorisedOrigins) {
      if (seen.has(row.sourceId)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `authorisedOrigins: ${row.sourceId} is declared more than once` });
      }
      seen.add(row.sourceId);

      // Duplicates inside a row are not merely redundant: they make the row's
      // length stop meaning how many distinct surfaces are authorised.
      //
      // Compared on **canonical identity**, not the authored string. Host case
      // and a default `:443` are settled by the URL parser, and the trailing
      // slash is settled here; without that, four spellings of one permission
      // could sit in a row looking like four surfaces.
      const origins = new Set<string>();
      for (const origin of row.origins) {
        let key: string;
        try {
          key = canonicalOriginKey(origin.kind, origin.url);
        } catch {
          continue; // Unparseable is already refused by the origin schema.
        }
        if (origins.has(key)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: `authorisedOrigins ${row.sourceId}: ${key} is declared more than once` });
        }
        origins.add(key);
      }
    }
  });

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
