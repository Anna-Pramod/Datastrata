/**
 * The staleness set — tests.
 *
 * Staleness answers "did the world move underneath this signature", and the
 * shape of the answer is the thing most easily got wrong: it is a *set*, so
 * two independent things that both moved are both reported. Most of the tests
 * here therefore assert on whole arrays rather than on membership, because a
 * membership assertion cannot fail against an implementation that invented a
 * precedence order and returned only the winner.
 *
 * Two are written specifically to fail against a wrong implementation:
 *
 *  - **Same-document suppression.** A document whose `normalizerVersion`
 *    differs *and* whose normalized hash differs must yield
 *    `normalizer_changed` alone. An implementation that compares the hashes
 *    unconditionally instead of stopping at the version check also reports
 *    `stale_source_text` — which would claim the law's text moved on the
 *    evidence of an algorithm change.
 *  - **Cross-document independence.** A two-document closure, one with a
 *    version change and one with genuinely moved text, must yield both
 *    reasons. An implementation that returns as soon as one document produces
 *    a reason reports only the first.
 *
 * `stale_encoding` is one reason fired by two different fields, so both
 * triggers are exercised separately as well as together: a test naming only
 * `conditionSha256` would leave `requirementInputSha256` entirely uncovered.
 */

import { describe, expect, it } from 'vitest';
import { entryId, signingEntrySchema, type SigningEntry, type UnsignedLedgerEntry } from '../src/verification/ledger';
import {
  BLOCKING,
  blocks,
  deriveStaleness,
  type CurrentState,
  type StalenessReason,
} from '../src/verification/staleness';

const HASH = (c: string): string => c.repeat(64);

/** A signature over two corpus documents, so per-document rules are testable. */
function signing(): SigningEntry {
  const fields = {
    kind: 'verified',
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
      {
        docId: 'DOC-2',
        versionLabel: '2024-02-02',
        sha256Raw: HASH('2'),
        sha256Normalized: HASH('3'),
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
  };
  return signingEntrySchema.parse({
    ...fields,
    entryId: entryId(fields as unknown as UnsignedLedgerEntry),
  });
}

const ENTRY = signing();

/** The state that matches `ENTRY` exactly, before any override is applied. */
function fresh(): CurrentState {
  return {
    requirementInputSha256: ENTRY.requirementInputSha256,
    conditionSha256: ENTRY.conditionSha256,
    renderedConditionSha256: ENTRY.renderedConditionSha256,
    corpusClosureSha256: ENTRY.corpusClosureSha256,
    resultSha256: ENTRY.resultSha256,
    corpus: ENTRY.corpus.map((pin) => ({
      docId: pin.docId,
      sha256Raw: pin.sha256Raw,
      sha256Normalized: pin.sha256Normalized,
      normalizerVersion: pin.normalizerVersion,
    })),
  };
}

/** `fresh()` with the named document's fields replaced. */
function withDoc(
  state: CurrentState,
  docId: string,
  overrides: Partial<CurrentState['corpus'][number]>,
): CurrentState {
  return {
    ...state,
    corpus: state.corpus.map((doc) => (doc.docId === docId ? { ...doc, ...overrides } : doc)),
  };
}

describe('deriveStaleness', () => {
  it('yields an empty set when nothing moved', () => {
    expect(deriveStaleness(ENTRY, fresh())).toEqual([]);
  });

  describe('each reason fires individually', () => {
    it('stale_encoding, from requirementInputSha256 alone', () => {
      const current = { ...fresh(), requirementInputSha256: HASH('9') };
      expect(deriveStaleness(ENTRY, current)).toEqual(['stale_encoding']);
    });

    it('stale_encoding, from conditionSha256 alone', () => {
      const current = { ...fresh(), conditionSha256: HASH('9') };
      expect(deriveStaleness(ENTRY, current)).toEqual(['stale_encoding']);
    });

    it('stale_encoding appears exactly once when both of its fields moved', () => {
      const current = {
        ...fresh(),
        requirementInputSha256: HASH('9'),
        conditionSha256: HASH('8'),
      };
      expect(deriveStaleness(ENTRY, current)).toEqual(['stale_encoding']);
    });

    it('stale_render, from the rendered output hash', () => {
      const current = { ...fresh(), renderedConditionSha256: HASH('9') };
      expect(deriveStaleness(ENTRY, current)).toEqual(['stale_render']);
    });

    it('stale_closure, from the entitled-closure hash', () => {
      const current = { ...fresh(), corpusClosureSha256: HASH('9') };
      expect(deriveStaleness(ENTRY, current)).toEqual(['stale_closure']);
    });

    it('stale_result, from the result hash', () => {
      const current = { ...fresh(), resultSha256: HASH('9') };
      expect(deriveStaleness(ENTRY, current)).toEqual(['stale_result']);
      expect(blocks(deriveStaleness(ENTRY, current))).toBe(true);
    });

    it('stale_source_text, when the normalized hash of a document moved', () => {
      const current = withDoc(fresh(), 'DOC-1', {
        sha256Normalized: HASH('9'),
        sha256Raw: HASH('8'),
      });
      expect(deriveStaleness(ENTRY, current)).toEqual(['stale_source_text']);
    });

    it('source_reissued, when only the raw hash moved', () => {
      const current = withDoc(fresh(), 'DOC-1', { sha256Raw: HASH('9') });
      expect(deriveStaleness(ENTRY, current)).toEqual(['source_reissued']);
    });

    it('normalizer_changed, when the pinned normalizer version differs', () => {
      const current = withDoc(fresh(), 'DOC-1', { normalizerVersion: 'normalize-2.0.0' });
      expect(deriveStaleness(ENTRY, current)).toEqual(['normalizer_changed']);
    });
  });

  describe('the per-document comparison order', () => {
    it('yields normalizer_changed ALONE when the version and the normalized hash both moved', () => {
      // The discriminating case. Comparing hashes produced by two different
      // normalizers cannot tell you whether the words changed, so the version
      // check must stop the inference for this document rather than merely
      // adding a reason beside it.
      const current = withDoc(fresh(), 'DOC-1', {
        normalizerVersion: 'normalize-2.0.0',
        sha256Normalized: HASH('9'),
        sha256Raw: HASH('8'),
      });
      expect(deriveStaleness(ENTRY, current)).toEqual(['normalizer_changed']);
    });

    it('yields normalizer_changed even when the normalized hash is identical', () => {
      const current = withDoc(fresh(), 'DOC-1', { normalizerVersion: 'normalize-2.0.0' });
      expect(deriveStaleness(ENTRY, current)).toEqual(['normalizer_changed']);
    });

    it('does not report source_reissued beside normalizer_changed for the same document', () => {
      const current = withDoc(fresh(), 'DOC-1', {
        normalizerVersion: 'normalize-2.0.0',
        sha256Raw: HASH('9'),
      });
      expect(deriveStaleness(ENTRY, current)).toEqual(['normalizer_changed']);
    });

    it('prefers stale_source_text over source_reissued when both hashes moved for one document', () => {
      const current = withDoc(fresh(), 'DOC-1', {
        sha256Normalized: HASH('9'),
        sha256Raw: HASH('8'),
      });
      expect(deriveStaleness(ENTRY, current)).toEqual(['stale_source_text']);
    });

    it('reports BOTH reasons across two documents that moved differently', () => {
      // The second discriminating case: one document changed normalizer, the
      // other genuinely changed text. Documents contribute independently, so
      // an implementation that stops at the first one to produce a reason
      // loses the other document's finding entirely.
      let current = withDoc(fresh(), 'DOC-1', { normalizerVersion: 'normalize-2.0.0' });
      current = withDoc(current, 'DOC-2', {
        sha256Normalized: HASH('9'),
        sha256Raw: HASH('8'),
      });
      expect(deriveStaleness(ENTRY, current)).toEqual(['normalizer_changed', 'stale_source_text']);
    });

    it('reports the same reason once when two documents both moved the same way', () => {
      let current = withDoc(fresh(), 'DOC-1', { sha256Normalized: HASH('9') });
      current = withDoc(current, 'DOC-2', { sha256Normalized: HASH('8') });
      expect(deriveStaleness(ENTRY, current)).toEqual(['stale_source_text']);
    });
  });

  describe('the result is a set, not a ranked primary', () => {
    it('carries stale_encoding and stale_source_text together', () => {
      const current = withDoc({ ...fresh(), conditionSha256: HASH('9') }, 'DOC-1', {
        sha256Normalized: HASH('8'),
      });
      expect(deriveStaleness(ENTRY, current)).toEqual(['stale_encoding', 'stale_source_text']);
    });

    it('returns every reason at once, sorted and deduplicated', () => {
      let current: CurrentState = {
        ...fresh(),
        requirementInputSha256: HASH('9'),
        conditionSha256: HASH('8'),
        renderedConditionSha256: HASH('7'),
        corpusClosureSha256: HASH('6'),
        resultSha256: HASH('5'),
      };
      current = withDoc(current, 'DOC-1', { normalizerVersion: 'normalize-2.0.0' });
      current = withDoc(current, 'DOC-2', {
        sha256Normalized: HASH('9'),
        sha256Raw: HASH('8'),
      });

      const reasons = deriveStaleness(ENTRY, current);
      expect(reasons).toEqual([
        'normalizer_changed',
        'stale_closure',
        'stale_encoding',
        'stale_render',
        'stale_result',
        'stale_source_text',
      ]);
      expect(reasons).toEqual([...reasons].sort());
      expect(new Set(reasons).size).toBe(reasons.length);
    });

    it('reports source_reissued alongside a blocking reason rather than in place of it', () => {
      let current = withDoc(fresh(), 'DOC-1', { sha256Raw: HASH('9') });
      current = withDoc(current, 'DOC-2', {
        sha256Normalized: HASH('8'),
        sha256Raw: HASH('7'),
      });
      expect(deriveStaleness(ENTRY, current)).toEqual(['source_reissued', 'stale_source_text']);
    });
  });

  describe('what staleness is not', () => {
    it('never returns revoked — a person withdrawing authority is not the world moving', () => {
      let current: CurrentState = {
        requirementInputSha256: HASH('9'),
        conditionSha256: HASH('8'),
        renderedConditionSha256: HASH('7'),
        corpusClosureSha256: HASH('6'),
        resultSha256: HASH('5'),
        corpus: fresh().corpus,
      };
      current = withDoc(current, 'DOC-1', { normalizerVersion: 'normalize-2.0.0' });
      const reasons: string[] = deriveStaleness(ENTRY, current);
      expect(reasons).not.toContain('revoked');

      // @ts-expect-error 'revoked' is not a member of StalenessReason, and the
      // type is what enforces it rather than the implementation's discipline.
      const notAReason: StalenessReason = 'revoked';
      expect(notAReason).toBe('revoked');
    });

    it('ignores a pinned document missing from the current corpus — that is integrity, not staleness', () => {
      const current: CurrentState = {
        ...fresh(),
        corpus: fresh().corpus.filter((doc) => doc.docId !== 'DOC-2'),
      };
      expect(deriveStaleness(ENTRY, current)).toEqual([]);
    });

    it('does not mutate the entry or the state it was given', () => {
      const current = withDoc(fresh(), 'DOC-1', { sha256Raw: HASH('9') });
      const entrySnapshot = JSON.stringify(ENTRY);
      const currentSnapshot = JSON.stringify(current);
      deriveStaleness(ENTRY, current);
      expect(JSON.stringify(ENTRY)).toBe(entrySnapshot);
      expect(JSON.stringify(current)).toBe(currentSnapshot);
    });
  });
});

describe('BLOCKING and blocks', () => {
  it('holds every reason except source_reissued', () => {
    expect([...BLOCKING].sort()).toEqual([
      'normalizer_changed',
      'stale_closure',
      'stale_encoding',
      'stale_render',
      'stale_result',
      'stale_source_text',
    ]);
    expect(BLOCKING.has('source_reissued')).toBe(false);
  });

  it('does not block on an empty set', () => {
    expect(blocks([])).toBe(false);
  });

  it('does not block on source_reissued alone', () => {
    const current = withDoc(fresh(), 'DOC-1', { sha256Raw: HASH('9') });
    const reasons = deriveStaleness(ENTRY, current);
    expect(reasons).toEqual(['source_reissued']);
    expect(blocks(reasons)).toBe(false);
  });

  it('blocks when any blocking reason is present, advisory reasons notwithstanding', () => {
    expect(blocks(['source_reissued', 'stale_result'])).toBe(true);
    expect(blocks(['normalizer_changed'])).toBe(true);
    expect(blocks(['stale_closure'])).toBe(true);
    expect(blocks(['stale_encoding'])).toBe(true);
    expect(blocks(['stale_render'])).toBe(true);
    expect(blocks(['stale_source_text'])).toBe(true);
  });
});
