/**
 * The coverage register — what DataStrata can answer, and what it only watches.
 *
 * Approved by Anna, Aug 2026. The rule the site obeys: `encoded` means a
 * knowledge pack exists and the engine returns cited determinations for it.
 * Everything else is `watched` — tracked and scoped, but not answerable. The
 * site must never let the two read as the same thing.
 *
 * No entry carries a legal date. Dates move (EUDR has slipped twice) and a
 * stale date on a compliance vendor's homepage is worse than no date at all;
 * dates belong inside a determination, where they are cited and versioned.
 */

export interface Regime {
  id: string;
  short: string;
  name: string;
  status: 'encoded' | 'watched';
  /** What this regime decides for an exporter — one line, present tense. */
  decides: string;
}

export const REGIMES: Regime[] = [
  {
    id: 'csrd',
    short: 'CSRD',
    name: 'Corporate Sustainability Reporting Directive',
    status: 'encoded',
    decides: 'Whether you must publish a sustainability statement, under which standard, and with what assurance.',
  },
  {
    id: 'cbam',
    short: 'CBAM',
    name: 'Carbon Border Adjustment Mechanism',
    status: 'watched',
    decides: 'Whether your goods carry an embedded-emissions reporting duty and a certificate obligation at the EU border.',
  },
  {
    id: 'brsr',
    short: 'BRSR Core',
    name: 'Business Responsibility & Sustainability Reporting (India)',
    status: 'watched',
    decides: 'Whether an Indian listed entity, or its value chain, owes assured BRSR Core indicators.',
  },
  {
    id: 'ifrs',
    short: 'IFRS S1-S2',
    name: 'ISSB sustainability and climate disclosure standards',
    status: 'watched',
    decides: 'Which jurisdictional adoption of the global baseline binds you, and from which reporting period.',
  },
  {
    id: 'csddd',
    short: 'CSDDD',
    name: 'Corporate Sustainability Due Diligence Directive',
    status: 'watched',
    decides: 'Whether you owe risk-based human-rights and environmental due diligence across your chain of activities.',
  },
  {
    id: 'eudr',
    short: 'EUDR',
    name: 'EU Deforestation Regulation',
    status: 'watched',
    decides: 'Whether a commodity you place on the EU market needs a due-diligence statement with plot geolocation.',
  },
  {
    id: 'espr',
    short: 'ESPR',
    name: 'Ecodesign for Sustainable Products Regulation',
    status: 'watched',
    decides: 'Whether your product group falls under an ecodesign act and owes a Digital Product Passport.',
  },
];

export const ENCODED = REGIMES.filter((r) => r.status === 'encoded');
export const WATCHED = REGIMES.filter((r) => r.status === 'watched');
