/**
 * Surface register schema.
 *
 * `sources.json` in a knowledge pack is the citation record — official legal
 * instruments only. This is a different list: every surface we look at,
 * including ones that may never be cited. The tier decides which.
 */

/** Ordered by evidential weight, strongest first. */
export type SourceTier = 'legal_record' | 'official_body' | 'tracker' | 'news';

export type SourceCadence = 'daily' | 'daily_until_effective' | 'weekly' | 'monthly';

export interface RegisterSource {
  /** W-NNN. Stable across renames — briefs and state files reference it. */
  id: string;
  tier: SourceTier;
  name: string;
  /** Who operates the surface, in their own terms. */
  authority: string;
  /** Always populated, always clickable. Auditability is a product property. */
  url: string;
  /** Machine feed (RSS/API/SPARQL) if one exists, else null. */
  feed: string | null;
  /** Why `feed` is null, or what the feed is. Never blank. */
  feedNote: string;
  governs: string;
  cadence: SourceCadence;
  /** Requirement IDs this surface can affect — impact analysis is a lookup. */
  affectsRequirements: string[];
  /** SRC-NNN records a claim from here should trace back to. */
  expectedProvenance: string[];
  /** Derived from tier; stored so integrity checks can assert consistency. */
  mustCorroborateWith: SourceTier[];
  /** ISO date of the last successful read, or null if never read. */
  lastSeen: string | null;
  /** How this row entered the register. */
  discoveredBy: string;
  /** Why this tier was assigned. Required — tier is never inferred silently. */
  tierRationale: string;
  /** Optional instruction for the watch sweep when this surface moves. */
  onEvent?: string;
}

/**
 * What a *source* is, as distinct from where we watch it.
 *
 * A `RegisterSource` row describes a **surface** — a page, a feed, a daily
 * view — and its `tier` describes that surface. `expectedProvenance` then says
 * which SRC records a claim found there should trace back to. Those are watch
 * links, and several surfaces may legitimately watch one source: the two
 * delegated acts adopted on 3 July 2026 are watched both on the Commission's
 * status page (W-004, where scrutiny progress appears) and on the Official
 * Journal daily view (W-005, where publication — the legal event — will
 * appear). W-004's own `onEvent` says which of the two carries the event:
 * *"The proposal must cite the OJ record (W-005), not this page."*
 *
 * None of that says what **the source itself** is, and until this record
 * existed the register could not say. Reading a tier off whichever surface
 * happened to point at a source was an inference, not a statement — and for a
 * source watched by two surfaces of different tiers it was ambiguous.
 *
 * This is that statement: exactly one entry per `sourceId`, checked rather than
 * assumed, and the input `isCitableSource` answers from.
 *
 * **It does not yet displace the host-matching firewall.** `verifyCitationCoverage`
 * still decides, for a source with no governing authority, whether the pack may
 * cite it by matching its URL host against citable surface rows. That fallback
 * is the pre-existing behaviour and it stays until every catalogue entry has an
 * authority; where an authority *does* exist it governs, and the two are made
 * to agree rather than left to diverge. Spec §19 replaces the host rule
 * outright at Task 5.
 */
export interface SourceAuthority {
  /** SRC-NNN in the pack's citation record. */
  sourceId: string;
  /** The tier that governs whether this SOURCE may be cited. */
  tier: SourceTier;
  /**
   * Why this tier, stated about what the source **is** rather than about which
   * surface we happen to read it on.
   *
   * It may explain why an adjacent consideration does *not* move the tier — a
   * delegated act adopted and not yet effective is still a legal instrument —
   * but it is not the record of that consideration. Temporal legal status is a
   * separate axis, held in the pack's `sources.json` and, for an ingested
   * artefact, with the artefact (spec §7). Restating it as fact here would
   * create a second place to read it, which is the shape of problem this whole
   * record exists to remove.
   */
  rationale: string;
}

export interface SourceRegister {
  program: string;
  /** ISO date the register was last edited by a human. */
  updated: string;
  /** One governing authority per source. Surfaces are `sources`. */
  governingAuthorities: SourceAuthority[];
  sources: RegisterSource[];
}

export interface TierPolicy {
  /**
   * Whether a finding from this tier alone can justify a change proposal.
   * `non_binding_only` covers facts like expected dates and guidance, never a
   * change to what the law requires.
   */
  sufficientAlone: 'yes' | 'no' | 'non_binding_only';
  /** Whether a surface at this tier may ever appear in a pack's sources.json. */
  citable: boolean;
  mustCorroborateWith: SourceTier[];
}
