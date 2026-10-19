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
  CLOSURE_POLICY_V1,
  ClosureEntryNotFoundError,
  computeClosure,
  docsForSources,
} from '../src/corpus/closure';
import {
  CLOSURE_RENDERER_VERSION,
  EntitledClosure,
  OutsideEntitlementError,
  renderEntitledRelationships,
  UnknownClosureRendererVersionError,
  type ClosureRendererVersion,
} from '../src/pipeline/entitlement';
import { docText, fixtureAuthorisedCorpus, fixtureIndex, fixtureRegister } from './pipeline-fixtures';
import { fixtureSourceUniverse } from './pipeline-fixtures';
import { fixtureStanding, pinInputFor } from './pipeline-fixtures';

const corpus = fixtureAuthorisedCorpus();

function closure(policy = CLOSURE_POLICY_V1): EntitledClosure {
  return EntitledClosure.forSources(corpus, fixtureRegister(), fixtureSourceUniverse(), ['SRC-100'], policy);
}

describe('EntitledClosure', () => {
  it('is exactly computeClosure’s answer, not a second traversal', () => {
    const index = fixtureIndex();
    const direct = computeClosure(index, docsForSources(index, ['SRC-100']), fixtureStanding(), CLOSURE_POLICY_V1);
    const entitled = closure();
    expect(entitled.docIds).toEqual(direct.docIds);
    expect(entitled.edgeIds).toEqual(direct.edgeIds);
    expect(entitled.sha256).toBe(direct.sha256);
    expect(entitled.pinInput).toEqual(pinInputFor(direct));
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
    const shallow = closure({ ...CLOSURE_POLICY_V1, referenceDepth: 0 });
    expect(shallow.docIds).toEqual(['DOC-A', 'DOC-B']);
    expect(shallow.sha256).not.toBe(closure().sha256);
    expect(() => shallow.text('DOC-C')).toThrow(OutsideEntitlementError);
    // and the wider policy still reaches it
    expect(closure().text('DOC-C')).toBe(docText('DOC-C'));
  });

  it('lets an absent entry document escape as a corpus_gap rather than closing over it', () => {
    expect(() => EntitledClosure.forSources(corpus, fixtureRegister(), fixtureSourceUniverse(), ['SRC-100'], CLOSURE_POLICY_V1)).not.toThrow();
    const emptyCorpus = fixtureAuthorisedCorpus();
    // `SRC-404` maps to no document, so the closure is empty rather than
    // erroneous; the throw belongs to an entry the index cannot resolve.
    expect(EntitledClosure.forSources(emptyCorpus, fixtureRegister(), fixtureSourceUniverse(), ['SRC-404']).docIds).toEqual([]);
    expect(() =>
      computeClosure(fixtureIndex(), ['DOC-NOT-INGESTED'], fixtureStanding(), CLOSURE_POLICY_V1),
    ).toThrow(ClosureEntryNotFoundError);
  });
});

// ---------------------------------------------------------------------------
// The closure lists its relationships. r4 (2026-10-19) showed the reader
// naming four edge ids the corpus does not hold; nothing had told it which
// ids exist. The catalog a role is shown is read off the capability — the
// same object that decides what it may read — so it can only ever list what
// the closure entitles, and it carries identity and shape only: never the
// provenance the closure hash covers, never a source id the reader is blind to.
// ---------------------------------------------------------------------------

describe('the closure lists its relationships — the edge ids a role may cite', () => {
  it('edges is exactly the sorted edges with both endpoints inside, each as id, kind, from and to, and nothing else', () => {
    const c = closure();
    expect(c.edges).toEqual([
      { edgeId: 'E-1', kind: 'amendedBy', from: 'DOC-A', to: 'DOC-B' },
      { edgeId: 'E-2', kind: 'references', from: 'DOC-A', to: 'DOC-C' },
    ]);
    // The same answer as `edgeIds`, in the same order: one traversal, read twice.
    expect(c.edges.map((edge) => edge.edgeId)).toEqual([...c.edgeIds]);
    // E-3 runs from DOC-C to DOC-D, and DOC-D is outside: not listed, as it is not hashed.
    expect(c.edges.some((edge) => edge.edgeId === 'E-3')).toBe(false);
    // Identity and shape only — the provenance is in the closure hash, not in what a role is shown.
    expect(JSON.stringify(c.edges)).not.toContain('provenance');
    for (const edge of c.edges) expect(Object.keys(edge).sort()).toEqual(['edgeId', 'from', 'kind', 'to']);
  });

  it('a closure whose documents share no recorded relationship lists none', () => {
    // SRC-999 is served by DOC-Z, which is connected to nothing: a real closure of one document and no edge.
    const lone = EntitledClosure.forSources(corpus, fixtureRegister(), fixtureSourceUniverse(), ['SRC-999']);
    expect(lone.docIds).toEqual(['DOC-Z']);
    expect(lone.edges).toEqual([]);
  });

  it('renderEntitledRelationships is one line per edge, in order, with a fixed grammar, and a stated sentence when there is none', () => {
    expect(renderEntitledRelationships(closure())).toBe(
      '- edgeId: E-1; kind: amendedBy; from: DOC-A; to: DOC-B\n- edgeId: E-2; kind: references; from: DOC-A; to: DOC-C',
    );
    expect(renderEntitledRelationships(EntitledClosure.forSources(corpus, fixtureRegister(), fixtureSourceUniverse(), ['SRC-999']))).toBe(
      'No relationship between the documents of this closure is recorded in the corpus.',
    );
    // Deterministic: the same closure renders the same bytes twice.
    expect(renderEntitledRelationships(closure())).toBe(renderEntitledRelationships(closure()));
    // Nothing a blind reader must not see.
    expect(renderEntitledRelationships(closure())).not.toMatch(/SRC-|provenance|recordedOn|celex_metadata|human/);
  });
});

describe('the closure carries the grammar its text is rendered under', () => {
  it('defaults to the current grammar, accepts a kept one, and refuses an unknown one by name before anything is rendered', () => {
    expect(closure().rendererVersion).toBe(CLOSURE_RENDERER_VERSION);
    expect(closure().rendererVersion).toBe('1.2.0');
    const kept = EntitledClosure.forSources(corpus, fixtureRegister(), fixtureSourceUniverse(), ['SRC-100'], CLOSURE_POLICY_V1, '1.1.0');
    expect(kept.rendererVersion).toBe('1.1.0');
    // The grammar changes how the closure is rendered, not what it is.
    expect(kept.sha256).toBe(closure().sha256);
    expect(kept.docIds).toEqual(closure().docIds);
    expect(kept.edges).toEqual(closure().edges);
    const unknown = () => EntitledClosure.forSources(corpus, fixtureRegister(), fixtureSourceUniverse(), ['SRC-100'], CLOSURE_POLICY_V1, '0.9.0' as ClosureRendererVersion);
    expect(unknown).toThrow(UnknownClosureRendererVersionError);
    expect(unknown).toThrow('no closure-renderer grammar for version "0.9.0": the kept grammars are 1.1.0 and the current grammar is 1.2.0');
  });
});
