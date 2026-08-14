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

export interface SourceRegister {
  program: string;
  /** ISO date the register was last edited by a human. */
  updated: string;
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
