/**
 * The site's coverage register: `coverageRegister` over inputs read from this
 * deployed revision's pack and monitoring register.
 *
 * Kept apart from `coverage.ts` because the two do different jobs. That
 * module holds the rules and the catalogue and reads nothing, so the rules are
 * tested over hand-built inputs, each conjunct alone, and any module may import
 * them. This one is the only place the rules meet this deployment's record: it
 * reads the pack and the monitoring register through `lib/pack.ts`, which is
 * `server-only` and reads the filesystem, so this file is `server-only` too.
 * No client component imports either module: `CheckFlow` is handed the planned
 * regimes' names by its server page.
 *
 * What is assembled, and what is not: `csrd` has a pack, so it carries the
 * requirement count and the signed count the ledger derives; `releasePolicy` is
 * `null` because no release policy exists yet, which is what keeps `supported`
 * unreachable. The one monitoring row is CSRD's: it counts the register's
 * surfaces, with `checkedWithinCadence: 0` because no scanner has ever checked
 * one, and it cannot change any printed status today. CSRD has a pack, a pack
 * decides before monitoring does, and only a regime without a pack whose every
 * register row was checked within cadence could read as `monitored`. The row is
 * kept as scaffolding for the scanner. Neither value is a placeholder to be
 * edited later; each is replaced by the mechanism that earns it.
 */

import 'server-only';
import { coverageRegister, type CoverageEntry } from '@/lib/coverage';
import { csrdSourceRegister, packStats } from '@/lib/pack';

/** The pack this site publishes; the coverage register is program-agnostic. */
const PACK_REGIME_ID = 'csrd';

export function siteCoverage(): CoverageEntry[] {
  const stats = packStats();
  const register = csrdSourceRegister();
  return coverageRegister({
    packs: [
      {
        regimeId: PACK_REGIME_ID,
        requirements: stats.requirements,
        signed: stats.signed,
        releasePolicy: null,
      },
    ],
    monitoring: [
      {
        regimeId: PACK_REGIME_ID,
        sources: register.sources.length,
        checkedWithinCadence: 0,
      },
    ],
  });
}
