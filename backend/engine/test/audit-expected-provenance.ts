/**
 * The audited provenance universe, written out by hand.
 *
 * This is the **independent oracle** for what the migrated pack cites. It is
 * transcribed from the committed audit —
 * `docs/superpowers/reports/2026-08-24-d1a-provenance-audit.md` §11, as
 * corrected on 2026-08-27 — and from nothing else. In particular it is not
 * derived from `requirements.json`, and not read out of any golden fixture.
 *
 * That independence is the whole point. A table computed from the pack would
 * agree with any migration at all, and a table read back from a generated
 * artefact would agree with whatever the generator happened to emit. Both are
 * the circularity this file exists to break: the audit decided these values
 * before the code produced them, so the audit is what they are checked against.
 *
 * Kept in one module because more than one suite needs it, and two hand-copies
 * of an oracle are one hand-copy too many — they drift, and the drift is
 * invisible until they disagree about something that matters.
 *
 * The 2026-08-27 correction is visible here as `CSRD-S-004 → SRC-002`. It was
 * `SRC-004` until the derogation it rests on was traced to the host that
 * incorporated it (Article 5(2) of Directive (EU) 2022/2464), which is also why
 * `SRC-004` appears nowhere below.
 */
export const AUDIT_EXPECTED_SOURCES: Readonly<Record<string, readonly string[]>> = {
  'CSRD-S-001': ['SRC-001'],
  'CSRD-S-002': ['SRC-001'],
  'CSRD-S-003': ['SRC-002'],
  'CSRD-S-004': ['SRC-002'],
  'CSRD-S-005': ['SRC-001'],
  'CSRD-S-006': ['SRC-001'],
  'CSRD-S-007': ['SRC-001'],
  'CSRD-S-008': ['SRC-001'],
  'CSRD-S-009': ['SRC-001'],
  'CSRD-S-010': ['SRC-001'],
  'CSRD-S-011': ['SRC-001', 'SRC-008'],
  'CSRD-S-012': ['SRC-005', 'SRC-007'],
  'CSRD-S-013': ['SRC-001'],
  'CSRD-S-014': ['SRC-001'],
  'CSRD-S-015': ['SRC-001'],
  'CSRD-S-016': ['SRC-001'],
};

/** The audited universe: five sources, and `SRC-004` is not among them. */
export const AUDIT_EXPECTED_UNIVERSE: readonly string[] = [
  'SRC-001', 'SRC-002', 'SRC-005', 'SRC-007', 'SRC-008',
];

/** §11's arithmetic: 32 today − 25 removals + 11 additions. */
export const AUDIT_EXPECTED_CITATION_COUNT = 18;

/**
 * The one requirement the 2026-08-27 correction moved, named on its own.
 *
 * Asserted explicitly wherever provenance is checked, rather than left to be
 * covered incidentally by a loop over the table above. A correction that is
 * only ever checked in aggregate is one an aggregate change can hide.
 */
export const CORRECTED_CASE = {
  requirementId: 'CSRD-S-004',
  sources: ['SRC-002'] as const,
  locator: 'Article 5(2), fifth subparagraph',
  absentSource: 'SRC-004',
} as const;
