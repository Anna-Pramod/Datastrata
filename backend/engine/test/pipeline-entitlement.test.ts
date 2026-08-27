/**
 * `EntitledClosure` — the capability §3.0 makes mechanical.
 *
 *     Everything the agents were entitled to know is exactly
 *     what the signature pins.
 *
 * Two things have to be true for that to hold: what the object hands out is
 * exactly `computeClosure`'s answer (not a second traversal that agrees today),
 * and there is no way through the object to read anything else.
 */

import { describe, expect, it } from 'vitest';
import {
  CLOSURE_POLICY_V0,
  ClosureEntryNotFoundError,
  computeClosure,
  docsForSources,
} from '../src/corpus/closure';
import { EntitledClosure, OutsideEntitlementError } from '../src/pipeline/entitlement';
import { docText, fixtureAuthorisedCorpus, fixtureIndex } from './pipeline-fixtures';

const corpus = fixtureAuthorisedCorpus();

function closure(policy = CLOSURE_POLICY_V0): EntitledClosure {
  return EntitledClosure.forSources(corpus, ['SRC-100'], policy);
}

describe('EntitledClosure', () => {
  it('is exactly computeClosure’s answer, not a second traversal', () => {
    const index = fixtureIndex();
    const direct = computeClosure(index, docsForSources(index, ['SRC-100']), CLOSURE_POLICY_V0);
    const entitled = closure();
    expect(entitled.docIds).toEqual(direct.docIds);
    expect(entitled.edgeIds).toEqual(direct.edgeIds);
    expect(entitled.sha256).toBe(direct.sha256);
    expect(entitled.pinInput).toEqual({ sha256: direct.sha256, docIds: direct.docIds });
  });

  it('follows a structural edge for free and a reference for a hop', () => {
    // Positive control for the refusal below: the closure is not trivially the
    // entry document, so "DOC-Z is refused" is a statement about entitlement
    // rather than about a closure that holds nothing.
    expect(closure().docIds).toEqual(['DOC-A', 'DOC-B', 'DOC-C']);
  });

  it('hands out the words behind an entitled document', () => {
    const document = closure().document('DOC-A');
    expect(document.text).toBe(docText('DOC-A'));
    expect(document.sha256Normalized).toBe(corpus.document('DOC-A').sha256Normalized);
    expect(closure().documents().map((entry) => entry.docId)).toEqual(['DOC-A', 'DOC-B', 'DOC-C']);
  });

  it('refuses a document the corpus holds but the closure does not reach', () => {
    // DOC-Z exists — `corpus.document('DOC-Z')` succeeds — so the refusal is
    // about entitlement and not about a missing file.
    expect(corpus.document('DOC-Z').docId).toBe('DOC-Z');
    let error: unknown;
    try {
      closure().text('DOC-Z');
    } catch (thrown) {
      error = thrown;
    }
    expect(error).toBeInstanceOf(OutsideEntitlementError);
    expect((error as OutsideEntitlementError).docId).toBe('DOC-Z');
    expect((error as Error).message).toContain('corpus_gap or closure_gap');
    expect(closure().entitled('DOC-Z')).toBe(false);
    expect(closure().entitled('DOC-A')).toBe(true);
  });

  it('narrows when the traversal policy narrows, and the hash moves with it', () => {
    const shallow = closure({ ...CLOSURE_POLICY_V0, referenceDepth: 0 });
    expect(shallow.docIds).toEqual(['DOC-A', 'DOC-B']);
    expect(shallow.sha256).not.toBe(closure().sha256);
    expect(() => shallow.text('DOC-C')).toThrow(OutsideEntitlementError);
    // and the wider policy still reaches it
    expect(closure().text('DOC-C')).toBe(docText('DOC-C'));
  });

  it('lets an absent entry document escape as a corpus_gap rather than closing over it', () => {
    expect(() => EntitledClosure.forSources(corpus, ['SRC-100'], CLOSURE_POLICY_V0)).not.toThrow();
    const emptyCorpus = fixtureAuthorisedCorpus();
    // `SRC-404` maps to no document, so the closure is empty rather than
    // erroneous; the throw belongs to an entry the index cannot resolve.
    expect(EntitledClosure.forSources(emptyCorpus, ['SRC-404']).docIds).toEqual([]);
    expect(() =>
      computeClosure(fixtureIndex(), ['DOC-NOT-INGESTED'], CLOSURE_POLICY_V0),
    ).toThrow(ClosureEntryNotFoundError);
  });
});
