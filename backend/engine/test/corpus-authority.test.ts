/**
 * The corpus authority boundary, over real data and over synthetic shapes.
 *
 * `authoriseCorpus` answers one question per `(document, sourceId)` pair: has
 * that source authorised the origin this document **records**? It answers
 * nothing about whether the bytes came from there (envelope E2), whether the
 * artefact is the legally authentic text (§7.1), or whether any requirement may
 * cite the source (`verifyRequirementCitability`, against `governingAuthorities`).
 *
 * That last separation is asserted here rather than assumed, because collapsing
 * it is the obvious mistake and it would reject a corpus that is entirely
 * correct: `SRC-004` is served by a committed document and cited by no
 * requirement at all.
 *
 * **This file is not wiring evidence.** It proves the validator. That a
 * production composition root invokes it is T5.4's proposition, and no test
 * here should be read as having established it.
 */

import { describe, expect, it } from 'vitest';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { authoriseCorpus, CorpusAuthorityError, type CorpusCapability } from '../src/corpus/authority';
import { loadCorpus } from '../src/corpus/store';
import { parseSourceRegister } from '../src/monitoring/register';
import type { SourceRegister } from '../src/monitoring/types';
import type { CorpusIndex } from '../src/corpus/types';
import { readFileSync } from 'node:fs';
import { csrdPack } from './helpers';

const engineRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const realRegister = (): SourceRegister =>
  parseSourceRegister(JSON.parse(readFileSync(join(engineRoot, 'monitoring', 'source-register.json'), 'utf8')));

/** A corpus capability over a hand-built index; no bytes are read. */
function corpusOver(index: CorpusIndex): CorpusCapability {
  return {
    index,
    document: (docId) => index.documents.find((d) => d.docId === docId)!,
    normalizedText: () => 'not read by authorisation',
  };
}

/** The real index, with `serves` rewritten per document id. */
function realIndexWith(serves: Record<string, string[]>): CorpusIndex {
  const index = loadCorpus(join(engineRoot, 'corpus')).index;
  return {
    ...index,
    documents: index.documents.map((d) => (serves[d.docId] ? { ...d, serves: serves[d.docId]! } : d)),
  };
}

const HOST_DOC = 'DOC-32013L0034'; // records …/eli/dir/2013/34/2026-03-18, serves SRC-001
const AMENDING_DOC = 'DOC-32026L0470'; // records …/eli/dir/2026/470/oj/eng, serves SRC-004

describe('authoriseCorpus over the committed corpus and register', () => {
  it('accepts the real corpus: a prefix declaration and an exact one, both satisfied', () => {
    // 1 and 2 together. SRC-001's document is a *consolidation* whose path
    // extends the declared ELI; SRC-004's is the exact declared OJ URL. Both
    // matchers are exercised by real data rather than by fixtures.
    const corpus = loadCorpus(join(engineRoot, 'corpus'));
    expect(() => authoriseCorpus(corpus, realRegister(), csrdPack())).not.toThrow();
  });

  it('returns the same capability it was given, so nothing is copied or hidden', () => {
    const corpus = loadCorpus(join(engineRoot, 'corpus'));
    expect(authoriseCorpus(corpus, realRegister(), csrdPack())).toBe(corpus);
  });

  it('refuses SRC-001’s artefact relabelled as SRC-004', () => {
    // 3. Same host, same registrar, real declarations — and refused, because
    // the consolidation's path is not beneath SRC-004's exact OJ URL.
    const corpus = corpusOver(realIndexWith({ [HOST_DOC]: ['SRC-004'] }));
    expect(() => authoriseCorpus(corpus, realRegister(), csrdPack())).toThrow(CorpusAuthorityError);
    try {
      authoriseCorpus(corpus, realRegister(), csrdPack());
    } catch (error) {
      const failures = (error as CorpusAuthorityError).failures;
      expect(failures).toHaveLength(1);
      expect(failures[0]).toMatchObject({
        docId: HOST_DOC,
        sourceId: 'SRC-004',
        reason: 'no matching authorised origin',
      });
    }
  });

  it('refuses SRC-004’s artefact relabelled as another source on the same host', () => {
    // 4. The §19.2 property over real data: eur-lex.europa.eu carries both, and
    // sharing a host confers nothing.
    const corpus = corpusOver(realIndexWith({ [AMENDING_DOC]: ['SRC-001'] }));
    expect(() => authoriseCorpus(corpus, realRegister(), csrdPack())).toThrow(/no matching authorised origin/);
    expect(() => authoriseCorpus(corpus, realRegister(), csrdPack())).toThrow(/SRC-001/);
  });

  it('refuses a served source with no declaration, and says which', () => {
    // 5. SRC-007 is a real, registered, cited source — and nothing has declared
    // an origin for it, because nothing serves it. Fail closed.
    //
    // SRC-007 rather than SRC-002: T9 gave SRC-002 a declaration when it
    // ingested the consolidated CSRD, so it no longer models an undeclared
    // source. SRC-007 is Class-B and gated behind E1–E4, so it stays undeclared
    // until Task 12 — which will need this fixture repointed again.
    const corpus = corpusOver(realIndexWith({ [HOST_DOC]: ['SRC-007'] }));
    try {
      authoriseCorpus(corpus, realRegister(), csrdPack());
      throw new Error('expected a refusal');
    } catch (error) {
      expect(error).toBeInstanceOf(CorpusAuthorityError);
      expect((error as CorpusAuthorityError).failures[0]).toMatchObject({
        sourceId: 'SRC-007',
        reason: 'no declaration',
      });
    }
  });

  it('refuses a source the pack does not carry at all', () => {
    const corpus = corpusOver(realIndexWith({ [HOST_DOC]: ['SRC-999'] }));
    try {
      authoriseCorpus(corpus, realRegister(), csrdPack());
      throw new Error('expected a refusal');
    } catch (error) {
      expect((error as CorpusAuthorityError).failures[0]).toMatchObject({
        sourceId: 'SRC-999',
        reason: 'unknown source',
      });
    }
  });

  it('refuses the whole corpus when one of a document’s two sources fails', () => {
    // 6. Pairs are decided independently and one passing source confers nothing
    // on the other. SRC-001 genuinely matches this document; SRC-002 does not.
    const corpus = corpusOver(realIndexWith({ [HOST_DOC]: ['SRC-001', 'SRC-002'] }));
    try {
      authoriseCorpus(corpus, realRegister(), csrdPack());
      throw new Error('expected a refusal');
    } catch (error) {
      const failures = (error as CorpusAuthorityError).failures;
      // Exactly the failing pair is named — not the document as a whole, and
      // not the source that passed.
      expect(failures).toHaveLength(1);
      expect(failures[0]).toMatchObject({ docId: HOST_DOC, sourceId: 'SRC-002' });
    }
  });

  it('reports every failing pair, not merely the first', () => {
    const corpus = corpusOver(realIndexWith({ [HOST_DOC]: ['SRC-002'], [AMENDING_DOC]: ['SRC-999'] }));
    try {
      authoriseCorpus(corpus, realRegister(), csrdPack());
      throw new Error('expected a refusal');
    } catch (error) {
      expect((error as CorpusAuthorityError).failures).toHaveLength(2);
    }
  });

  it('names the recorded URL in the refusal, so the claim can be checked', () => {
    const corpus = corpusOver(realIndexWith({ [HOST_DOC]: ['SRC-004'] }));
    expect(() => authoriseCorpus(corpus, realRegister(), csrdPack())).toThrow(
      /https:\/\/eur-lex\.europa\.eu\/eli\/dir\/2013\/34\/2026-03-18/,
    );
  });
});

describe('authoriseCorpus matcher semantics, over synthetic declarations', () => {
  const register = (origins: { kind: 'exact' | 'path_prefix'; url: string }[]): SourceRegister =>
    ({
      ...realRegister(),
      authorisedOrigins: [{ sourceId: 'SRC-001', origins, rationale: 'Fixture.' }],
    }) as SourceRegister;

  const docAt = (url: string): CorpusCapability =>
    corpusOver({
      ...loadCorpus(join(engineRoot, 'corpus')).index,
      documents: [
        {
          ...loadCorpus(join(engineRoot, 'corpus')).index.documents[0]!,
          docId: 'DOC-PROBE',
          serves: ['SRC-001'],
          url,
        },
      ],
    });

  const accepts = (origins: { kind: 'exact' | 'path_prefix'; url: string }[], url: string): boolean => {
    try {
      authoriseCorpus(docAt(url), register(origins), csrdPack());
      return true;
    } catch {
      return false;
    }
  };

  it('any one of several declarations may satisfy a source', () => {
    // 7. The row is a disjunction, not a conjunction.
    const origins = [
      { kind: 'exact' as const, url: 'https://eur-lex.europa.eu/eli/dir/1999/1/oj/eng' },
      { kind: 'exact' as const, url: 'https://eur-lex.europa.eu/eli/dir/2013/34/oj/eng' },
    ];
    expect(accepts(origins, 'https://eur-lex.europa.eu/eli/dir/2013/34/oj/eng')).toBe(true);
    expect(accepts(origins, 'https://eur-lex.europa.eu/eli/dir/1999/1/oj/eng')).toBe(true);
    expect(accepts(origins, 'https://eur-lex.europa.eu/eli/dir/2020/5/oj/eng')).toBe(false);
  });

  it('exact admits neither a descendant nor a sibling path', () => {
    // 8. `exact` is one document. A descendant would make it a prefix by
    // accident, which is the widening the two kinds exist to keep apart.
    const origins = [{ kind: 'exact' as const, url: 'https://eur-lex.europa.eu/eli/dir/2013/34' }];
    expect(accepts(origins, 'https://eur-lex.europa.eu/eli/dir/2013/34')).toBe(true);
    expect(accepts(origins, 'https://eur-lex.europa.eu/eli/dir/2013/34/2026-03-18')).toBe(false);
    expect(accepts(origins, 'https://eur-lex.europa.eu/eli/dir/2013/35')).toBe(false);
  });

  it('path_prefix honours the segment boundary', () => {
    // 9. The property that makes a prefix source-specific rather than
    // string-shaped: /34 covers /34/2026-03-18 and never /345.
    const origins = [{ kind: 'path_prefix' as const, url: 'https://eur-lex.europa.eu/eli/dir/2013/34' }];
    expect(accepts(origins, 'https://eur-lex.europa.eu/eli/dir/2013/34')).toBe(true);
    expect(accepts(origins, 'https://eur-lex.europa.eu/eli/dir/2013/34/2026-03-18')).toBe(true);
    expect(accepts(origins, 'https://eur-lex.europa.eu/eli/dir/2013/345')).toBe(false);
    expect(accepts(origins, 'https://eur-lex.europa.eu/eli/dir/2013/345/oj/eng')).toBe(false);
  });

  it('compares parsed URLs, not raw strings', () => {
    // Host case and a default :443 are the same permission; a different host is
    // not, however much of the string it shares.
    const origins = [{ kind: 'path_prefix' as const, url: 'https://eur-lex.europa.eu/eli/dir/2013/34' }];
    expect(accepts(origins, 'https://EUR-LEX.EUROPA.EU:443/eli/dir/2013/34/2026-03-18')).toBe(true);
    expect(accepts(origins, 'https://eur-lex.europa.eu.attacker.invalid/eli/dir/2013/34')).toBe(false);
    expect(accepts(origins, 'http://eur-lex.europa.eu/eli/dir/2013/34')).toBe(false);
  });

  it('a candidate’s query or fragment does not create a different permission', () => {
    const origins = [{ kind: 'exact' as const, url: 'https://eur-lex.europa.eu/eli/dir/2013/34' }];
    expect(accepts(origins, 'https://eur-lex.europa.eu/eli/dir/2013/34?locale=en')).toBe(true);
    expect(accepts(origins, 'https://eur-lex.europa.eu/eli/dir/2013/34#art19a')).toBe(true);
  });

  it('rationale is never consulted — changing it changes nothing', () => {
    // 10. Prose is not operative. Same declarations, opposite rationales, same
    // decision both ways.
    const origins = [{ kind: 'path_prefix' as const, url: 'https://eur-lex.europa.eu/eli/dir/2013/34' }];
    const withRationale = (rationale: string): SourceRegister =>
      ({ ...realRegister(), authorisedOrigins: [{ sourceId: 'SRC-001', origins, rationale }] }) as SourceRegister;
    const good = docAt('https://eur-lex.europa.eu/eli/dir/2013/34/2026-03-18');
    const bad = docAt('https://eur-lex.europa.eu/eli/dir/2013/345');
    for (const rationale of ['Authorised.', 'NOT AUTHORISED — do not use.']) {
      expect(() => authoriseCorpus(good, withRationale(rationale), csrdPack())).not.toThrow();
      expect(() => authoriseCorpus(bad, withRationale(rationale), csrdPack())).toThrow();
    }
  });

  it('reads no tier: a corpus may serve a source no requirement may cite', () => {
    // The separation, asserted. SRC-004 is served by a committed document and
    // cited by no requirement since the S-004 correction; a validator that
    // demanded citability would reject a correct corpus. Nothing here touches
    // governingAuthorities at all.
    const corpus = loadCorpus(join(engineRoot, 'corpus'));
    const stripped = { ...realRegister(), governingAuthorities: [] } as SourceRegister;
    expect(() => authoriseCorpus(corpus, stripped, csrdPack())).not.toThrow();
  });
});
