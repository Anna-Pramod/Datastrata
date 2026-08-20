/**
 * The status projection — tests.
 *
 * The whole subtlety of this module is in what it must *not* do, so most of
 * these tests are written to fail against a plausible wrong implementation
 * rather than to confirm the obvious one.
 *
 * Two carry the load:
 *
 *  - **No governing entry yields an empty reason set.** Asserted with
 *    `toEqual([])`, never a length check, because an implementation that
 *    invented `['unsigned']` passes `toHaveLength(1)` and fails this. `draft`
 *    already says that no one has signed; a reason beside it would be a second
 *    vocabulary for the same fact, and B1b-ii-b's migration golden — whose one
 *    sanctioned transformation is `ratificationStatus: 'draft'` to
 *    `derivedStatus: 'draft', statusReasons: []` — would have to normalise it
 *    away, which is how an invention becomes permanent.
 *  - **A revocation ignores staleness entirely.** Exercised by passing a
 *    *non-empty* staleness array alongside a revocation and asserting the
 *    reasons are exactly `['revoked']`. An implementation that computes
 *    staleness and merges it fails here; one that computes it and discards it
 *    passes, and is still wrong for a reason no test can see — hence the
 *    parameter is not consulted at all in the implementation.
 *
 * The blocked case asserts the *whole* set rather than membership, because
 * the reasons travel with the status precisely so a surface can say why. An
 * implementation returning only the blocking reasons, or only the first one,
 * passes a membership assertion and fails these.
 */

import { describe, expect, it } from 'vitest';
import {
  entryId,
  revocationEntrySchema,
  signingEntrySchema,
  type LedgerEntry,
  type RevocationEntry,
  type SigningEntry,
  type UnsignedLedgerEntry,
} from '../src/verification/ledger';
import { BLOCKING, type StalenessReason } from '../src/verification/staleness';
import { deriveStatus, type StatusReason } from '../src/verification/status';

const HASH = (c: string): string => c.repeat(64);

/** A signature asserting `kind`, otherwise identical whichever level it claims. */
function signing(kind: 'verified' | 'ratified'): SigningEntry {
  const fields = {
    kind,
    packId: 'testpack',
    packVersion: '2024.1',
    requirementId: 'REQ-001',
    requirementVersion: 1,
    requirementSha256: HASH('a'),
    requirementInputSha256: HASH('b'),
    conditionSha256: HASH('c'),
    renderedConditionSha256: HASH('d'),
    rendererVersion: 'renderer-1.0.0',
    corpusClosureSha256: HASH('e'),
    corpus: [
      {
        docId: 'DOC-1',
        versionLabel: '2024-01-01',
        sha256Raw: HASH('f'),
        sha256Normalized: HASH('0'),
        normalizerVersion: 'normalize-1.0.0',
      },
    ],
    resultSha256: HASH('1'),
    pipelineVersion: 'pipeline-1.0.0',
    by: 'A. Reviewer',
    on: '2026-08-20',
  };
  return signingEntrySchema.parse({
    ...fields,
    entryId: entryId(fields as unknown as UnsignedLedgerEntry),
  });
}

/** A withdrawal of `signing('verified')`, carrying no verification pins. */
function revocation(): RevocationEntry {
  const fields = {
    kind: 'revoked',
    packId: 'testpack',
    requirementId: 'REQ-001',
    revokes: signing('verified').entryId,
    by: 'B. Reviewer',
    reason: 'The reading rested on a superseded consolidation.',
    on: '2026-08-21',
  };
  return revocationEntrySchema.parse({
    ...fields,
    entryId: entryId(fields as unknown as UnsignedLedgerEntry),
  });
}

const VERIFIED = signing('verified');
const RATIFIED = signing('ratified');
const REVOKED = revocation();

/** Every reason, so a test can assert against the full vocabulary. */
const EVERY_REASON: StalenessReason[] = [
  'normalizer_changed',
  'source_reissued',
  'stale_closure',
  'stale_encoding',
  'stale_render',
  'stale_result',
  'stale_source_text',
];

describe('deriveStatus, with no governing entry', () => {
  it('is draft with an EMPTY reason set, not an invented "unsigned"', () => {
    const status = deriveStatus(null, []);
    expect(status.derivedStatus).toBe('draft');
    // toEqual([]), never a length check: ['unsigned'] passes toHaveLength(1).
    expect(status.statusReasons).toEqual([]);
  });

  it('stays empty even when a staleness set is passed alongside', () => {
    // Status and staleness are two axes. An unsigned requirement has nothing
    // for staleness to be about, so no reason may leak through here either.
    expect(deriveStatus(null, ['stale_render', 'stale_result']).statusReasons).toEqual([]);
  });

  it('never reports a reason for any staleness set at all', () => {
    for (const reason of EVERY_REASON) {
      expect(deriveStatus(null, [reason])).toEqual({ derivedStatus: 'draft', statusReasons: [] });
    }
  });
});

describe('deriveStatus, when a revocation governs', () => {
  it('is draft carrying exactly ["revoked"]', () => {
    expect(deriveStatus(REVOKED, [])).toEqual({
      derivedStatus: 'draft',
      statusReasons: ['revoked'],
    });
  });

  it('ignores a NON-EMPTY staleness set entirely', () => {
    // The discriminating case: an implementation that merges staleness into a
    // revocation's reasons reports four here rather than one. A revoked
    // signature's freshness is irrelevant, and reporting it would imply
    // otherwise — that the withdrawal might be undone by the world settling.
    const status = deriveStatus(REVOKED, ['stale_source_text', 'stale_render', 'source_reissued']);
    expect(status.statusReasons).toEqual(['revoked']);
    expect(status.derivedStatus).toBe('draft');
  });

  it('ignores every staleness reason there is, one at a time', () => {
    for (const reason of EVERY_REASON) {
      expect(deriveStatus(REVOKED, [reason]).statusReasons).toEqual(['revoked']);
    }
  });

  it('reports "revoked" whatever the whole vocabulary throws at it', () => {
    expect(deriveStatus(REVOKED, EVERY_REASON).statusReasons).toEqual(['revoked']);
  });
});

describe('deriveStatus, for a signing entry with no blocking staleness', () => {
  it('keeps the entry kind "verified" on a fresh signature', () => {
    expect(deriveStatus(VERIFIED, [])).toEqual({ derivedStatus: 'verified', statusReasons: [] });
  });

  it('keeps the entry kind "ratified" on a fresh signature', () => {
    // The kind is carried through rather than derived: ratification is a
    // second, higher assertion and status must not silently demote it.
    expect(deriveStatus(RATIFIED, [])).toEqual({ derivedStatus: 'ratified', statusReasons: [] });
  });

  it('keeps its kind and still reports an advisory source_reissued', () => {
    // The publisher reissued the file and the words are identical, so the
    // conclusion still rests on the text that was read — the reader is told,
    // and the signature stands.
    expect(deriveStatus(RATIFIED, ['source_reissued'])).toEqual({
      derivedStatus: 'ratified',
      statusReasons: ['source_reissued'],
    });
    expect(deriveStatus(VERIFIED, ['source_reissued'])).toEqual({
      derivedStatus: 'verified',
      statusReasons: ['source_reissued'],
    });
  });
});

describe('deriveStatus, for a signing entry with blocking staleness', () => {
  it('is draft carrying the FULL reason set, advisory reasons included', () => {
    // Not one reason, and not only the blocking ones: the reasons travel with
    // the status so a surface can say why rather than merely refusing.
    const reasons: StalenessReason[] = [
      'source_reissued',
      'stale_encoding',
      'stale_render',
      'stale_source_text',
    ];
    expect(deriveStatus(VERIFIED, reasons)).toEqual({
      derivedStatus: 'draft',
      statusReasons: ['source_reissued', 'stale_encoding', 'stale_render', 'stale_source_text'],
    });
  });

  it('demotes a ratified entry too', () => {
    expect(deriveStatus(RATIFIED, ['stale_result'])).toEqual({
      derivedStatus: 'draft',
      statusReasons: ['stale_result'],
    });
  });

  it('agrees with BLOCKING on every reason, one at a time', () => {
    // Driven from the set itself, so a reason added to BLOCKING later cannot
    // gain a projection that disagrees with it.
    for (const reason of EVERY_REASON) {
      const expected = BLOCKING.has(reason) ? 'draft' : 'verified';
      expect(deriveStatus(VERIFIED, [reason]).derivedStatus).toBe(expected);
      expect(deriveStatus(VERIFIED, [reason]).statusReasons).toEqual([reason]);
    }
  });

  it('preserves the order deriveStaleness supplied', () => {
    // deriveStaleness returns sorted; the projection must not re-sort or
    // re-group, or two surfaces would disagree about the same set.
    expect(deriveStatus(VERIFIED, EVERY_REASON).statusReasons).toEqual(EVERY_REASON);
  });

  it('never inserts "revoked" into a signing entry reason set', () => {
    const reasons = deriveStatus(VERIFIED, EVERY_REASON).statusReasons;
    expect(reasons).not.toContain('revoked');
  });
});

describe('deriveStatus is pure and total', () => {
  it('returns a value for every combination of governing entry and reason set', () => {
    const governing: (LedgerEntry | null)[] = [null, VERIFIED, RATIFIED, REVOKED];
    const sets: StalenessReason[][] = [[], EVERY_REASON, ...EVERY_REASON.map((r) => [r])];
    for (const entry of governing) {
      for (const set of sets) {
        expect(() => deriveStatus(entry, set)).not.toThrow();
        const status = deriveStatus(entry, set);
        expect(['draft', 'verified', 'ratified']).toContain(status.derivedStatus);
        expect(Array.isArray(status.statusReasons)).toBe(true);
      }
    }
  });

  it('does not mutate the staleness array it was given', () => {
    const reasons: StalenessReason[] = ['stale_render', 'source_reissued'];
    deriveStatus(VERIFIED, reasons);
    deriveStatus(REVOKED, reasons);
    deriveStatus(null, reasons);
    expect(reasons).toEqual(['stale_render', 'source_reissued']);
  });

  it('does not alias the caller array, so a later push cannot rewrite history', () => {
    const reasons: StalenessReason[] = ['stale_render'];
    const status = deriveStatus(VERIFIED, reasons);
    const escaped: StatusReason[] = status.statusReasons;
    escaped.push('revoked');
    expect(reasons).toEqual(['stale_render']);
  });
});
