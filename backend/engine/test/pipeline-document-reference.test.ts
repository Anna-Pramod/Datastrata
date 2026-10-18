/**
 * The document-identifier contract at the gap seam.
 *
 * Why this file exists: the first genuine S-002 capture (2026-10-18) halted on
 * a prosecutor gap naming `CELEX-32022L2464`, a document the corpus holds as
 * `DOC-32022L2464`. `corpusHolds` compared identifiers byte for byte, so the
 * engine filed a `corpus_gap` whose remedy — "ingest it" — was false guidance
 * about a document already ingested. These tests hold the repair to its
 * promises: a reference resolves only through a document id or an alias the
 * corpus author *declared*, never through the shape of the string; an unknown
 * or ambiguous reference stays explicit rather than being guessed; the
 * reported reference survives in the record; and resolution opens no text —
 * the entitlement route is untouched.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { sha256Hex } from '../src/corpus/hash';
import { CorpusIntegrityError, parseCorpusIndex, verifyCorpusIntegrity } from '../src/corpus/schema';
import type { CorpusDocument, CorpusIndex } from '../src/corpus/types';
import { AmbiguousDocumentReferenceError, resolveDocumentReference } from '../src/pipeline/document-reference';
import { EntitledClosure, OutsideEntitlementError } from '../src/pipeline/entitlement';
import {
  classifyUnreachableDocument,
  EntitledDocumentIsNotAGapError,
  gapForUnreachableDocument,
} from '../src/pipeline/gaps';
import { requestDocument } from '../src/pipeline/reader';
import {
  docText,
  fixtureAuthorisedCorpus,
  fixtureCorpus,
  fixtureIndex,
  fixtureRegister,
  fixtureSourceUniverse,
  NOT_INGESTED,
} from './pipeline-fixtures';

// ---------------------------------------------------------------------------
// Fixtures: the shared fixture world with declared aliases, and a defective index
// ---------------------------------------------------------------------------

function closureOver(index: CorpusIndex): EntitledClosure {
  return EntitledClosure.forSources(
    fixtureAuthorisedCorpus(fixtureCorpus(index)),
    fixtureRegister(),
    fixtureSourceUniverse(),
    ['SRC-100'],
  );
}

/** The fixture index with declared aliases on an entitled document and an unreached one. */
function indexWithAliases(): CorpusIndex {
  const base = fixtureIndex();
  const aliasesFor: Record<string, string[]> = {
    'DOC-A': ['CELEX-A'],
    'DOC-D': ['CELEX-D', '02013D0000-20260101'],
  };
  return parseCorpusIndex({
    ...base,
    documents: base.documents.map((document) =>
      document.docId in aliasesFor ? { ...document, aliases: aliasesFor[document.docId] } : document,
    ),
  });
}

/** A document in the fixture world's shape, under another id. */
function documentNamed(docId: string, overrides: Partial<CorpusDocument> = {}): CorpusDocument {
  const template = fixtureIndex().documents.find((document) => document.docId === 'DOC-D');
  if (template === undefined) throw new Error('fixture index lost DOC-D');
  const text = docText(docId);
  return {
    ...template,
    docId,
    title: `Document ${docId}`,
    rawPath: `raw/${docId}.html`,
    normalizedPath: `normalized/${docId}.txt`,
    sha256Raw: sha256Hex(`raw:${text}`),
    sha256Normalized: sha256Hex(text),
    edges: [],
    ...overrides,
  };
}

/**
 * Two held documents declaring the same alias — what `verifyCorpusIntegrity`
 * refuses, built here without running it, so the resolver's own answer to an
 * index that escaped the check can be seen. Each sits at the origin its source
 * has authorised in the fixture register, so the index passes corpus authority.
 */
function sharedAliasIndex(): CorpusIndex {
  return parseCorpusIndex({
    updated: '2026-10-18',
    documents: [
      documentNamed('DOC-1', { serves: ['SRC-100'], url: 'https://example.invalid/DOC-A', aliases: ['SHARED'] }),
      documentNamed('DOC-2', { serves: ['SRC-999'], url: 'https://example.invalid/DOC-Z', aliases: ['SHARED'] }),
    ],
  });
}

// ---------------------------------------------------------------------------
// Resolution, out of declared metadata alone
// ---------------------------------------------------------------------------

describe('resolveDocumentReference decides out of declared metadata, deterministically', () => {
  const plain = fixtureIndex().documents;
  const aliased = indexWithAliases().documents;

  it('an exact document id resolves to itself', () => {
    expect(resolveDocumentReference(plain, 'DOC-D')).toEqual({
      outcome: 'resolved',
      reference: 'DOC-D',
      docId: 'DOC-D',
      matchedBy: 'docId',
    });
  });

  it('a declared alias resolves, and only to the document declaring it', () => {
    expect(resolveDocumentReference(aliased, 'CELEX-D')).toEqual({
      outcome: 'resolved',
      reference: 'CELEX-D',
      docId: 'DOC-D',
      matchedBy: 'alias',
    });
    expect(resolveDocumentReference(aliased, '02013D0000-20260101')).toMatchObject({ outcome: 'resolved', docId: 'DOC-D' });
    expect(resolveDocumentReference(aliased, 'CELEX-A')).toMatchObject({ outcome: 'resolved', docId: 'DOC-A' });
  });

  it('the same strings are unknown where no alias is declared: the rule reads metadata, not a pattern', () => {
    for (const reference of ['CELEX-D', '02013D0000-20260101']) {
      expect(resolveDocumentReference(plain, reference), reference).toEqual({ outcome: 'unknown', reference });
    }
  });

  it('an undeclared scheme over a held document’s suffix stays unknown — nothing is inferred from the shape', () => {
    // The review's counter-example: `UNRELATED-D` shares `D` with `DOC-D` and
    // with the declared `CELEX-D`, and declares no relationship to either.
    for (const reference of ['UNRELATED-D', 'celex:D', 'CELEX_D', 'D', 'doc-d']) {
      expect(resolveDocumentReference(aliased, reference), reference).toEqual({ outcome: 'unknown', reference });
    }
  });

  it('a reference nothing identifies stays unknown, and says which reference', () => {
    for (const reference of [NOT_INGESTED, 'CELEX-NOT-INGESTED', '']) {
      expect(resolveDocumentReference(aliased, reference), reference).toEqual({ outcome: 'unknown', reference });
    }
  });

  it('surrounding whitespace is not an identity, and the reported reference is kept as given', () => {
    expect(resolveDocumentReference(aliased, '  CELEX-D\n')).toEqual({
      outcome: 'resolved',
      reference: '  CELEX-D\n',
      docId: 'DOC-D',
      matchedBy: 'alias',
    });
  });

  it('an alias two documents declare is ambiguous, naming both, never a guess; their ids stay unambiguous', () => {
    const documents = sharedAliasIndex().documents;
    expect(resolveDocumentReference(documents, 'SHARED')).toEqual({
      outcome: 'ambiguous',
      reference: 'SHARED',
      candidates: ['DOC-1', 'DOC-2'],
    });
    expect(resolveDocumentReference(documents, 'DOC-1')).toMatchObject({ outcome: 'resolved', matchedBy: 'docId' });
  });
});

// ---------------------------------------------------------------------------
// The real corpus declares the equivalence the capture observed
// ---------------------------------------------------------------------------

describe('the shipped corpus index declares the CELEX form the S-002 capture used', () => {
  const index = parseCorpusIndex(
    JSON.parse(readFileSync(resolve(__dirname, '..', 'corpus', 'index.json'), 'utf8')) as unknown,
  );

  it('passes integrity with its aliases', () => {
    expect(() => verifyCorpusIntegrity(index)).not.toThrow();
  });

  it('resolves CELEX-32022L2464 to DOC-32022L2464 through a declared alias, and nothing else', () => {
    expect(resolveDocumentReference(index.documents, 'CELEX-32022L2464')).toEqual({
      outcome: 'resolved',
      reference: 'CELEX-32022L2464',
      docId: 'DOC-32022L2464',
      matchedBy: 'alias',
    });
    expect(resolveDocumentReference(index.documents, 'UNRELATED-32022L2464')).toEqual({
      outcome: 'unknown',
      reference: 'UNRELATED-32022L2464',
    });
    expect(resolveDocumentReference(index.documents, '32022L2464').outcome).toBe('unknown');
  });

  it('every shipped document declares exactly its own CELEX- form', () => {
    for (const document of index.documents) {
      expect(document.aliases, document.docId).toEqual([`CELEX-${document.docId.slice('DOC-'.length)}`]);
    }
  });
});

// ---------------------------------------------------------------------------
// Aliases are corpus metadata, validated like the rest of the index
// ---------------------------------------------------------------------------

describe('declared aliases are validated metadata', () => {
  it('an index without aliases parses as before, and one with them parses and passes integrity', () => {
    expect(fixtureIndex().documents.every((document) => document.aliases === undefined)).toBe(true);
    expect(indexWithAliases().documents.find((d) => d.docId === 'DOC-D')?.aliases).toEqual([
      'CELEX-D',
      '02013D0000-20260101',
    ]);
    expect(() => verifyCorpusIntegrity(indexWithAliases())).not.toThrow();
  });

  it('refuses an alias that is empty, untrimmed, or declared twice on one document', () => {
    const base = fixtureIndex();
    const withAliases = (aliases: string[]) =>
      parseCorpusIndex({
        ...base,
        documents: base.documents.map((document) => (document.docId === 'DOC-D' ? { ...document, aliases } : document)),
      });
    expect(() => withAliases([''])).toThrow();
    expect(() => withAliases([' A-1'])).toThrow();
    expect(() => withAliases(['A-1', 'A-1'])).toThrow();
    expect(() => withAliases(['A-1'])).not.toThrow();
  });

  it('refuses, across the index, an alias that is another document’s id or alias', () => {
    const base = fixtureIndex();
    const collidingWithId = parseCorpusIndex({
      ...base,
      documents: base.documents.map((document) =>
        document.docId === 'DOC-D' ? { ...document, aliases: ['DOC-Z'] } : document,
      ),
    });
    expect(() => verifyCorpusIntegrity(collidingWithId)).toThrow(CorpusIntegrityError);
    expect(() => verifyCorpusIntegrity(collidingWithId)).toThrow(/alias DOC-Z/);
    expect(() => verifyCorpusIntegrity(sharedAliasIndex())).toThrow(/alias SHARED/);
  });
});

// ---------------------------------------------------------------------------
// The gap seam: the kind follows the resolved document, the reference survives
// ---------------------------------------------------------------------------

describe('gapForUnreachableDocument classifies the document a reference resolves to', () => {
  const closure = closureOver(indexWithAliases());

  it('a held, unreached document named by a declared alias is a closure_gap over its real id', () => {
    const gap = gapForUnreachableDocument(closure, 'CELEX-D', 'the prosecutor needed the annex');
    expect(gap.kind).toBe('closure_gap');
    expect(gap.docId).toBe('DOC-D');
    expect(gap.sourceId).toBeUndefined();
    // The role's words survive, and so does the identifier it actually used.
    expect(gap.detail).toContain('the prosecutor needed the annex');
    expect(gap.detail).toContain('CELEX-D');
    expect(gap.detail).toContain('traversal policy');
    // The false guidance the capture produced must be gone.
    expect(gap.detail).not.toContain('ingest');
  });

  it('the same document under its own id reads the same, without a renaming note', () => {
    const gap = gapForUnreachableDocument(closure, 'DOC-D');
    expect(gap.kind).toBe('closure_gap');
    expect(gap.docId).toBe('DOC-D');
    expect(gap.detail).not.toContain('named by the role as');
  });

  it('an undeclared scheme over the same suffix is a corpus_gap under the reference itself — explicit, not resolved', () => {
    const gap = gapForUnreachableDocument(closure, 'UNRELATED-D', 'the reader asked');
    expect(gap.kind).toBe('corpus_gap');
    expect(gap.docId).toBe('UNRELATED-D');
    expect(gap.detail).toContain('the reader asked');
    expect(gap.detail).toContain('no document id or declared alias');
    expect(gap.detail).toContain('declare the alias');
  });

  it('a document the role was handed is not a gap, whatever declared name it was given', () => {
    expect(() => gapForUnreachableDocument(closure, 'CELEX-A')).toThrow(EntitledDocumentIsNotAGapError);
    expect(() => gapForUnreachableDocument(closure, 'CELEX-A')).toThrow(/named as CELEX-A/);
    expect(() => gapForUnreachableDocument(closure, 'DOC-A')).toThrow(EntitledDocumentIsNotAGapError);
  });

  it('a shared alias is refused explicitly, naming the candidates, and produces no gap', () => {
    const defective = closureOver(sharedAliasIndex());
    expect(defective.docIds).toEqual(['DOC-1']);
    expect(() => gapForUnreachableDocument(defective, 'SHARED', 'the prosecutor needed it')).toThrow(
      AmbiguousDocumentReferenceError,
    );
    expect(() => gapForUnreachableDocument(defective, 'SHARED')).toThrow(/DOC-1 or DOC-2/);
    // Positive control for the same seam: the unambiguous id of the unreached
    // candidate is a plain closure_gap.
    expect(gapForUnreachableDocument(defective, 'DOC-2').kind).toBe('closure_gap');
  });

  it('classifyUnreachableDocument itself still speaks exact ids, so the two layers stay separable', () => {
    expect(classifyUnreachableDocument(closure, 'DOC-D')).toBe('closure_gap');
    expect(classifyUnreachableDocument(closure, 'CELEX-D')).toBe('corpus_gap');
  });
});

// ---------------------------------------------------------------------------
// Resolution grants nothing
// ---------------------------------------------------------------------------

describe('resolving a reference never opens text', () => {
  const closure = closureOver(indexWithAliases());

  it('the entitlement route is byte-exact: a declared alias of an entitled document is refused there', () => {
    expect(closure.entitled('DOC-A')).toBe(true);
    expect(closure.entitled('CELEX-A')).toBe(false);
    expect(() => closure.text('CELEX-A')).toThrow(OutsideEntitlementError);
    expect(() => closure.document('CELEX-A')).toThrow(OutsideEntitlementError);
  });

  it('a resolved reference to an unentitled document is still refused text, under either name', () => {
    expect(closure.resolveDocumentReference('CELEX-D')).toMatchObject({ outcome: 'resolved', docId: 'DOC-D' });
    expect(() => closure.text('DOC-D')).toThrow(OutsideEntitlementError);
    expect(() => closure.text('CELEX-D')).toThrow(OutsideEntitlementError);
    expect(() => closure.document('CELEX-D')).toThrow(OutsideEntitlementError);
  });

  it('the reader’s request grants an entitled document under its declared alias and nothing outside the closure', () => {
    const granted = requestDocument(closure, 'CELEX-A');
    expect(granted.granted).toBe(true);
    if (granted.granted) expect(granted.document.docId).toBe('DOC-A');

    const refused = requestDocument(closure, 'CELEX-D');
    expect(refused.granted).toBe(false);
    if (!refused.granted) {
      expect(refused.gap.kind).toBe('closure_gap');
      expect(refused.gap.docId).toBe('DOC-D');
      expect(refused.gap.detail).toContain('CELEX-D');
    }

    const unknown = requestDocument(closure, 'UNRELATED-A');
    expect(unknown.granted).toBe(false);
    if (!unknown.granted) expect(unknown.gap).toMatchObject({ kind: 'corpus_gap', docId: 'UNRELATED-A' });
  });
});
