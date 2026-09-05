/**
 * The status projection — tests.
 *
 * The whole subtlety of this module is in what it must *not* do, so most of
 * these tests are written to fail against a plausible wrong implementation
 * rather than to confirm the obvious one.
 *
 * **Half of this file no longer runs, and that is the point.** The defect this
 * module was rebuilt to close was not a missing computation: it was that
 * `deriveStatus(governing, [])` accepted an empty staleness set meaning *"I
 * checked and nothing is stale"* at a call site where *"I did not check"* was
 * true. Tests that used to assert "an unsigned entry ignores the staleness it
 * was handed" are therefore gone as runtime tests — the value can no longer be
 * handed — and are restated below as `@ts-expect-error` assertions. `tsconfig`
 * includes `test`, so `npm run typecheck` compiles them, and each directive is
 * proven load-bearing by deleting it and confirming the build fails.
 *
 * Three still carry the load:
 *
 *  - **No governing entry yields an empty reason set.** Asserted with
 *    `toEqual([])`, never a length check, because an implementation that
 *    invented `['unsigned']` passes `toHaveLength(1)` and fails this. `draft`
 *    already says that no one has signed; a reason beside it would be a second
 *    vocabulary for the same fact, and B1b-ii-b's migration golden — whose one
 *    sanctioned transformation is `ratificationStatus: 'draft'` to
 *    `derivedStatus: 'draft', statusReasons: []` — would have to normalise it
 *    away, which is how an invention becomes permanent.
 *  - **An unchecked signature is `draft, ['freshness_unchecked']`, and
 *    specifically not `draft, []`.** Asserted as the whole object, because the
 *    two draft-producing paths must stay distinguishable: one means nobody
 *    signed, the other means nobody looked.
 *  - **A revocation cannot be told about staleness at all.** It used to be
 *    exercised by passing a non-empty array and asserting it was discarded — a
 *    test an implementation that computes staleness and throws it away still
 *    passes. The union has no `freshness` on that member now, so the claim is
 *    made by the compiler instead.
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
import {
  deriveStatus,
  toStatusInput,
  type CheckedFreshness,
  type FreshnessAssessment,
  type StatusInput,
  type StatusReason,
} from '../src/verification/status';

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
    closureRendererVersion: 'closure-renderer-1.0.0',
    corpusClosureSha256: HASH('e'),
    corpus: [
      {
        docId: 'DOC-1',
        versionLabel: '2024-01-01',
        sha256Raw: HASH('f'),
        sha256Normalized: HASH('0'),
        normalizerVersion: 'normalize-1.0.0',
        artefactAuthenticity: 'official_consolidation',
        nonOperativeSections: [],
        sources: [{ sourceId: 'SRC-001', temporalStanding: 'in_force' }],
      },
    ],
    resultSha256: HASH('1'),
    pipelineVersion: 'pipeline-1.0.0',
    by: 'A. Reviewer',
    on: '2026-08-20',
    // An explicit, empty designation: this fixture's world has no evidence set
    // to designate, and an entry with no record at all reads as `stale_ranges`.
    evidenceUse: [],
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

/** "I looked, and these are the reasons" — the only shape a resolver returns. */
const checked = (reasons: StalenessReason[]): FreshnessAssessment => ({ checked: true, reasons });

/** "I did not look." Supplied by a caller, never by a resolver. */
const UNCHECKED: FreshnessAssessment = { checked: false };

describe('deriveStatus, with no governing entry', () => {
  it('is draft with an EMPTY reason set, not an invented "unsigned"', () => {
    const status = deriveStatus(toStatusInput(null));
    expect(status.derivedStatus).toBe('draft');
    // toEqual([]), never a length check: ['unsigned'] passes toHaveLength(1).
    expect(status.statusReasons).toEqual([]);
  });

  it('is not freshness_unchecked — nothing is signed, so there is nothing to check', () => {
    // §4's compatibility row. `freshness_unchecked` describes our ignorance
    // about a *signature*; an unsigned requirement has none, and inventing the
    // reason here would redefine the state the migration golden pins.
    expect(deriveStatus(toStatusInput(null))).toEqual({
      derivedStatus: 'draft',
      statusReasons: [],
    });
  });
});

describe('deriveStatus, when a revocation governs', () => {
  it('is draft carrying exactly ["revoked"]', () => {
    expect(deriveStatus(toStatusInput(REVOKED))).toEqual({
      derivedStatus: 'draft',
      statusReasons: ['revoked'],
    });
  });

  it('is never freshness_unchecked, whatever the world did after the withdrawal', () => {
    // A revoked signature's freshness is irrelevant: only a fresh signature
    // restores authority, and reporting drift beside a withdrawal would imply
    // the world settling back down might undo it.
    expect(deriveStatus(toStatusInput(REVOKED)).statusReasons).toEqual(['revoked']);
  });
});

describe('deriveStatus, for a signing entry whose freshness was never checked', () => {
  it('is draft carrying exactly ["freshness_unchecked"] — NOT draft with no reasons', () => {
    const status = deriveStatus(toStatusInput(VERIFIED, UNCHECKED));
    expect(status).toEqual({ derivedStatus: 'draft', statusReasons: ['freshness_unchecked'] });
    // The discriminating assertion. The defect being closed reported this same
    // input as `verified, []`; a near-miss fix reports `draft, []`, which
    // collapses "nobody looked" into "nobody signed".
    expect(status).not.toEqual({ derivedStatus: 'draft', statusReasons: [] });
  });

  it('demotes a ratified signature too, rather than trusting the higher claim', () => {
    expect(deriveStatus(toStatusInput(RATIFIED, UNCHECKED))).toEqual({
      derivedStatus: 'draft',
      statusReasons: ['freshness_unchecked'],
    });
  });
});

describe('deriveStatus, for a signing entry with no blocking staleness', () => {
  it('keeps the entry kind "verified" on a fresh signature', () => {
    expect(deriveStatus(toStatusInput(VERIFIED, checked([])))).toEqual({
      derivedStatus: 'verified',
      statusReasons: [],
    });
  });

  it('keeps the entry kind "ratified" on a fresh signature', () => {
    // The kind is carried through rather than derived: ratification is a
    // second, higher assertion and status must not silently demote it.
    expect(deriveStatus(toStatusInput(RATIFIED, checked([])))).toEqual({
      derivedStatus: 'ratified',
      statusReasons: [],
    });
  });

  it('keeps its kind and still reports an advisory source_reissued', () => {
    // The publisher reissued the file and the words are identical, so the
    // conclusion still rests on the text that was read — the reader is told,
    // and the signature stands.
    expect(deriveStatus(toStatusInput(RATIFIED, checked(['source_reissued'])))).toEqual({
      derivedStatus: 'ratified',
      statusReasons: ['source_reissued'],
    });
    expect(deriveStatus(toStatusInput(VERIFIED, checked(['source_reissued'])))).toEqual({
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
    expect(deriveStatus(toStatusInput(VERIFIED, checked(reasons)))).toEqual({
      derivedStatus: 'draft',
      statusReasons: ['source_reissued', 'stale_encoding', 'stale_render', 'stale_source_text'],
    });
  });

  it('demotes a ratified entry too', () => {
    expect(deriveStatus(toStatusInput(RATIFIED, checked(['stale_result'])))).toEqual({
      derivedStatus: 'draft',
      statusReasons: ['stale_result'],
    });
  });

  it('agrees with BLOCKING on every reason, one at a time', () => {
    // Driven from the set itself, so a reason added to BLOCKING later cannot
    // gain a projection that disagrees with it.
    for (const reason of EVERY_REASON) {
      const expected = BLOCKING.has(reason) ? 'draft' : 'verified';
      const status = deriveStatus(toStatusInput(VERIFIED, checked([reason])));
      expect(status.derivedStatus).toBe(expected);
      expect(status.statusReasons).toEqual([reason]);
    }
  });

  it('preserves the order deriveStaleness supplied', () => {
    // deriveStaleness returns sorted; the projection must not re-sort or
    // re-group, or two surfaces would disagree about the same set.
    expect(deriveStatus(toStatusInput(VERIFIED, checked(EVERY_REASON))).statusReasons).toEqual(
      EVERY_REASON,
    );
  });

  it('never inserts "revoked" or "freshness_unchecked" into a checked reason set', () => {
    // A checked signature's reasons come from the resolver and from nowhere
    // else. Either extra reason appearing here would mean the projection is
    // inventing epistemic state it was handed the answer to.
    const reasons = deriveStatus(toStatusInput(VERIFIED, checked(EVERY_REASON))).statusReasons;
    expect(reasons).not.toContain('revoked');
    expect(reasons).not.toContain('freshness_unchecked');
  });
});

describe('toStatusInput', () => {
  it('projects an absent governing entry onto the unsigned variant', () => {
    expect(toStatusInput(null)).toEqual({ kind: 'unsigned' });
  });

  it('projects a revocation onto the revoked variant, carrying the entry', () => {
    expect(toStatusInput(REVOKED)).toEqual({ kind: 'revoked', entry: REVOKED });
  });

  it('carries the freshness assessment through unexamined and unmodified', () => {
    // §5's rule, at the adapter: the resolver's answer is not inspected,
    // normalised or merged on the way in. A `CheckedFreshness` is the whole of
    // what was learned, and re-deriving any part of it here would create a
    // second, quietly different opinion about the same question.
    expect(toStatusInput(VERIFIED, checked(['stale_result']))).toEqual({
      kind: 'signed',
      entry: VERIFIED,
      freshness: { checked: true, reasons: ['stale_result'] },
    });
    expect(toStatusInput(VERIFIED, UNCHECKED)).toEqual({
      kind: 'signed',
      entry: VERIFIED,
      freshness: { checked: false },
    });
  });
});

describe('deriveStatus is pure and total', () => {
  it('returns a value for every representable input', () => {
    const inputs: StatusInput[] = [
      toStatusInput(null),
      toStatusInput(REVOKED),
      toStatusInput(VERIFIED, UNCHECKED),
      toStatusInput(RATIFIED, UNCHECKED),
      ...[VERIFIED, RATIFIED].flatMap((entry) => [
        toStatusInput(entry, checked([])),
        toStatusInput(entry, checked(EVERY_REASON)),
        ...EVERY_REASON.map((reason) => toStatusInput(entry, checked([reason]))),
      ]),
    ];
    for (const input of inputs) {
      expect(() => deriveStatus(input)).not.toThrow();
      const status = deriveStatus(input);
      expect(['draft', 'verified', 'ratified']).toContain(status.derivedStatus);
      expect(Array.isArray(status.statusReasons)).toBe(true);
    }
  });

  it('does not mutate the reason array it was given', () => {
    const reasons: StalenessReason[] = ['stale_render', 'source_reissued'];
    deriveStatus(toStatusInput(VERIFIED, checked(reasons)));
    deriveStatus(toStatusInput(REVOKED));
    deriveStatus(toStatusInput(null));
    expect(reasons).toEqual(['stale_render', 'source_reissued']);
  });

  it('does not alias the caller array, so a later push cannot rewrite history', () => {
    const reasons: StalenessReason[] = ['stale_render'];
    const status = deriveStatus(toStatusInput(VERIFIED, checked(reasons)));
    const escaped: StatusReason[] = status.statusReasons;
    escaped.push('revoked');
    expect(reasons).toEqual(['stale_render']);
  });
});

/**
 * The compile-time boundary. Nothing below runs; `tsconfig.json` includes
 * `test`, so `npm run typecheck` is what asserts it, and every directive has
 * been proven load-bearing by deleting it and confirming the build fails.
 *
 * These are not decoration for the runtime tests above. Five assertions that
 * used to be runtime tests live here now, because the values they passed can no
 * longer be constructed — a stronger statement than observing they were
 * discarded.
 */

// --- freshness_unchecked is epistemic status, never a way the world moved ---

// @ts-expect-error freshness_unchecked is epistemic status, not staleness
const impossible: StalenessReason = 'freshness_unchecked';
const valid: StatusReason = 'freshness_unchecked';
void impossible;
void valid;

/**
 * §3.1's four illegal calls: the adapter's deliberate friction.
 *
 * Never invoked. The compiler is the whole assertion, and running them would
 * be worse than useless — an illegal call's *runtime* behaviour is undefined
 * by design, so observing it would test the one thing that is not the claim.
 */
function illegalAdapterCalls(governing: LedgerEntry | null, signed: SigningEntry): void {
  // @ts-expect-error a caller holding governingEntry()'s union must branch first
  toStatusInput(governing);

  // @ts-expect-error a signature must say whether its freshness was checked
  toStatusInput(signed);

  // @ts-expect-error freshness is meaningless where nothing is signed
  toStatusInput(null, { checked: true, reasons: [] });

  // @ts-expect-error freshness is meaningless for a revocation
  toStatusInput(REVOKED, { checked: true, reasons: [] });
}

void illegalAdapterCalls;

// --- the two authority variants have no freshness to be told about ---

// @ts-expect-error the unsigned variant carries nothing but its discriminant
const unsignedWithFreshness: StatusInput = { kind: 'unsigned', freshness: { checked: false } };

// @ts-expect-error a revocation's StatusInput has no freshness field at all
const revokedWithFreshness: StatusInput = { kind: 'revoked', entry: REVOKED, freshness: UNCHECKED };

void unsignedWithFreshness;
void revokedWithFreshness;

// --- and a resolver's answer can never be the caller's "I did not look" ---

// @ts-expect-error CheckedFreshness is checked: true by construction (§5)
const resolverCannotDecline: CheckedFreshness = { checked: false };

void resolverCannotDecline;
