/**
 * Company facts, in one place.
 *
 * Anything marked TODO is a fact only DataStrata can supply — names, bios,
 * registration, address, the real inbox. They are left visibly unfilled rather
 * than invented, because an About page that fabricates its own team is the exact
 * failure mode the product exists to prevent. Fill these in and the pages update;
 * no component needs touching.
 */

export const COMPANY = {
  name: 'DataStrata',
  /** TODO: confirm registered entity name and number before publishing. */
  legalEntity: null as string | null,
  /** TODO: confirm operating location(s). */
  locations: [] as string[],
  /** TODO: replace with the real monitored inbox. */
  email: 'hello@datastrata.example',
  founded: '2026',
  scale: 'A two-person company, deliberately.',
};

export const MISSION =
  'Sustainability rules now decide who is allowed to sell. We exist so that a company can know exactly what applies to it, what just changed, and what to do by when — with every answer cited, dated and defensible.';

export const ORIGIN = [
  'DataStrata started from a specific frustration: the rules that decide market access change faster than the people responsible for them can read. Consultancies answer once and invoice. Software mostly collects datapoints for a report that has already been scoped by someone else. Neither maintains the answer.',
  'So we built the opposite way round. A deterministic engine decides applicability against versioned, cited regulatory content; the answer is maintained as the law moves; and nothing enters the record without a human putting their name to it.',
];

/** The laws the product is built to — these are engineering rules, not marketing. */
export const PRINCIPLES = [
  {
    n: '01',
    h: 'No silent “does not apply”',
    p: 'A missing fact, an unknown code or a range that straddles a threshold produces an honest “unresolved”, with the reason and the fact that would settle it. Only definitive evidence produces a definitive no.',
  },
  {
    n: '02',
    h: 'Deterministic core, probabilistic edges',
    p: 'An evaluator makes every applicability decision. AI may draft regulatory content for expert review and explain a stored result. It never decides, and it never publishes into the record.',
  },
  {
    n: '03',
    h: 'Nothing counts until a human confirms it',
    p: 'Extracted facts are candidates. They are structurally invisible to the engine until someone confirms them — a boundary in the data flow, not a line in a policy.',
  },
  {
    n: '04',
    h: 'Pending law never binds',
    p: 'An adopted act that is not yet in force changes nothing about what you owe today. It is watched, scoped to the requirements it would move, and applied on the day it actually applies.',
  },
  {
    n: '05',
    h: 'Versions, not overwrites',
    p: 'The record is appended like strata and never erased, so an answer given last year can still be reconstructed exactly as it stood.',
  },
  {
    n: '06',
    h: 'We publish what we cannot yet answer',
    p: 'One regime is encoded end-to-end. Six more are watched. We say which is which on the front page, because the difference is the whole product.',
  },
];

/** Real build order, from the engineering plan. Not a roadmap of promises. */
export const NEXT = [
  { h: 'Expert ratification', p: 'Every requirement in the pack is still draft. Sign-off by a named expert is the gate before any customer reliance.' },
  { h: 'A pilot country pack', p: 'CSRD is directive-based law. Until a Member State is encoded and ratified, every result correctly ends “national-law status requires review”.' },
  { h: 'The change loop, live', p: 'Source monitoring exists as a tiered register. Turning it into dated briefings with selective re-evaluation is the next system.' },
  { h: 'The second regime', p: 'CBAM is the architecture test: it must land as a new knowledge pack with no program-specific code in the engine.' },
];

export interface Person {
  /** TODO: real name. */
  name: string | null;
  role: string;
  /** TODO: real biography — background, and what they are accountable for here. */
  bio: string | null;
}

export const TEAM: Person[] = [
  { name: null, role: 'Regulatory content & ratification', bio: null },
  { name: null, role: 'Engineering & the applicability engine', bio: null },
];
