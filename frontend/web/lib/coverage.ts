/**
 * The coverage register: what the site may say about each regime, derived from
 * the record rather than written into copy.
 *
 * This replaces `regimes.ts`, which carried `encoded` and `watched` as authored
 * words. "Watched" had no register row, pack or check behind it, so the site
 * said it about six regimes on nobody's evidence. The proposal's four statuses
 * are each earned by a fact the record holds, in a fixed order of precedence:
 *
 * - `supported`: a knowledge pack exists and a release policy declares the
 *   regime and supports its requirement closure. No policy exists today, so
 *   this is unreachable, and it must stay unreachable until one does.
 * - `draft`: a knowledge pack exists but the closure is not supported — CSRD
 *   now, printed "Draft · evaluation only" with the signed count beside it.
 * - `monitored`: no pack, but the monitoring register has rows for the regime
 *   and every one of them was checked within its cadence. No scanner exists, so
 *   nothing earns this today.
 * - `planned`: everything else.
 *
 * The catalogue — the names of the seven regimes and what each decides — is the
 * only authored content here, and it decides no status. Pure and importable from the
 * client bundle: this module reads nothing. The site's inputs are assembled from
 * the pack and the register in `site-coverage.ts`, which is `server-only`.
 */

export type CoverageStatus = 'supported' | 'draft' | 'monitored' | 'planned';

/** The words the site prints for each status, fixed by the proposal (§1.2). */
export const COVERAGE_WORDS: Record<CoverageStatus, string> = {
  supported: 'Supported',
  draft: 'Draft · evaluation only',
  monitored: 'Monitored',
  planned: 'Planned',
};

export interface RegimeCatalogueEntry {
  id: string;
  short: string;
  name: string;
  /** What this regime decides for an exporter — one line, present tense. */
  decides: string;
}

export interface CoverageEntry extends RegimeCatalogueEntry {
  status: CoverageStatus;
  /** The fact the status rests on, in words a reader can check against the record. */
  detail: string;
}

export interface CoverageInputs {
  /** One row per regime that has a knowledge pack. */
  packs: Array<{
    regimeId: string;
    requirements: number;
    /** Requirements carrying a fresh governing signature: verified or ratified. */
    signed: number;
    /** The release policy's view of the regime, or `null` while no policy exists. */
    releasePolicy: { declares: boolean; closureSupported: boolean } | null;
  }>;
  /** One row per regime the monitoring register has surfaces for. */
  monitoring: Array<{ regimeId: string; sources: number; checkedWithinCadence: number }>;
}

/**
 * The seven regimes the site names. No entry carries a legal date: dates move
 * (EUDR has slipped twice) and a stale date on a compliance vendor's homepage
 * is worse than no date at all; dates belong inside a determination, where they
 * are cited and versioned.
 */
export const REGIME_CATALOGUE: readonly RegimeCatalogueEntry[] = [
  {
    id: 'csrd',
    short: 'CSRD',
    name: 'Corporate Sustainability Reporting Directive',
    decides: 'Whether you must publish a sustainability statement, under which standard, and with what assurance.',
  },
  {
    id: 'cbam',
    short: 'CBAM',
    name: 'Carbon Border Adjustment Mechanism',
    decides: 'Whether your goods carry an embedded-emissions reporting duty and a certificate obligation at the EU border.',
  },
  {
    id: 'brsr',
    short: 'BRSR Core',
    name: 'Business Responsibility & Sustainability Reporting (India)',
    decides: 'Whether an Indian listed entity, or its value chain, owes assured BRSR Core indicators.',
  },
  {
    id: 'ifrs',
    short: 'IFRS S1-S2',
    name: 'ISSB sustainability and climate disclosure standards',
    decides: 'Which jurisdictional adoption of the global baseline binds you, and from which reporting period.',
  },
  {
    id: 'csddd',
    short: 'CSDDD',
    name: 'Corporate Sustainability Due Diligence Directive',
    decides: 'Whether you owe risk-based human-rights and environmental due diligence across your chain of activities.',
  },
  {
    id: 'eudr',
    short: 'EUDR',
    name: 'EU Deforestation Regulation',
    decides: 'Whether a commodity you place on the EU market needs a due-diligence statement with plot geolocation.',
  },
  {
    id: 'espr',
    short: 'ESPR',
    name: 'Ecodesign for Sustainable Products Regulation',
    decides: 'Whether your product group falls under an ecodesign act and owes a Digital Product Passport.',
  },
];

type Pack = CoverageInputs['packs'][number];
type Monitoring = CoverageInputs['monitoring'][number];

/**
 * The status one regime earns, and the fact it earns it by.
 *
 * A pack decides before monitoring does: a regime the engine answers for is
 * draft or supported whatever its register says, because "monitored" is the
 * weaker claim. Each rule is a conjunction and each conjunct is load-bearing —
 * a policy that declares the regime without supporting its closure, or a
 * register with rows of which one went unchecked, falls through.
 */
function statusOf(pack: Pack | undefined, monitoring: Monitoring | undefined): Pick<CoverageEntry, 'status' | 'detail'> {
  if (pack !== undefined) {
    const policy = pack.releasePolicy;
    if (policy !== null && policy.declares && policy.closureSupported) {
      return {
        status: 'supported',
        detail: `${pack.signed} of ${pack.requirements} requirements signed; release policy supports the closure`,
      };
    }
    return { status: 'draft', detail: `${pack.signed} of ${pack.requirements} requirements signed` };
  }
  if (monitoring !== undefined && monitoring.sources > 0 && monitoring.checkedWithinCadence === monitoring.sources) {
    return { status: 'monitored', detail: `${monitoring.sources} sources checked within cadence` };
  }
  return { status: 'planned', detail: 'no knowledge pack, no monitored source' };
}

/** The register over the fixed catalogue, in catalogue order. */
export function coverageRegister(inputs: CoverageInputs): CoverageEntry[] {
  return REGIME_CATALOGUE.map((regime) => ({
    ...regime,
    ...statusOf(
      inputs.packs.find((p) => p.regimeId === regime.id),
      inputs.monitoring.find((m) => m.regimeId === regime.id),
    ),
  }));
}

/** The regimes the engine returns determinations for: supported or draft. */
export function answerable(entries: CoverageEntry[]): CoverageEntry[] {
  return entries.filter((e) => e.status === 'supported' || e.status === 'draft');
}

export function planned(entries: CoverageEntry[]): CoverageEntry[] {
  return entries.filter((e) => e.status === 'planned');
}
