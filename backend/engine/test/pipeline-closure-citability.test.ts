/**
 * A document may be validly *held* by an authorised corpus and still not be
 * eligible to become model-facing evidence.
 *
 * Task 5 established three axes and kept them apart:
 *
 * ```text
 * authorisedOrigins    -> may this artefact's recorded origin serve the source it claims?
 * governingAuthorities -> is this source of a kind that may carry normative text?
 * EntitledClosure      -> what may a model actually see?
 * ```
 *
 * The gap this file closes sat between the first and the third. `serves[]` is
 * an *entry point* selector: `docsForSources` reads it, and the traversal then
 * expands over structural edges in **both directions** without consulting
 * `serves` again. So a document that no requirement could ever cite — because
 * the register has never said its source may carry normative text — could still
 * be pulled into an entitled closure by one `amendedBy` edge from a document
 * that *is* an entry point, and its text would reach the reader, the
 * prosecutors, the adjudicator, and the signature.
 *
 * Origin authority cannot close that: it answers a different question and reads
 * no tier, deliberately. Requirement citability cannot close it either: it
 * guards entry points, and the exposure arrives after traversal. The guard
 * therefore belongs at the moment the closure becomes exposable, which is where
 * it now sits.
 *
 * **`uncited` is not `non-citable`, and the committed corpus proves it.**
 * `DOC-32026L0470` serves `SRC-004`, which no requirement has cited since the
 * S-004 correction — and which the register classifies `legal_record`. It is
 * reached only by traversal from `DOC-32013L0034`, and it must keep passing.
 * A guard that confused "nothing currently cites this" with "this may not be
 * cited" would reject the real corpus, and the first test below would catch it.
 */

import { describe, expect, it } from 'vitest';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

import { authoriseCorpus, type CorpusCapability } from '../src/corpus/authority';
import { loadCorpus } from '../src/corpus/store';
import { parseSourceRegister } from '../src/monitoring/register';
import { computeClosure, docsForSources } from '../src/corpus/closure';
import { EntitledClosure, ClosureCitabilityError } from '../src/pipeline/entitlement';
import type { CorpusIndex } from '../src/corpus/types';
import type { SourceRegister } from '../src/monitoring/types';
import { csrdPack } from './helpers';

const engineRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const realIndex = (): CorpusIndex => loadCorpus(join(engineRoot, 'corpus')).index;

/** The committed register, with extra rows a case needs. Written out, never derived. */
function registerWith(
  authorities: Record<string, unknown>[] = [],
  origins: Record<string, unknown>[] = [],
): SourceRegister {
  const raw = JSON.parse(
    readFileSync(join(engineRoot, 'monitoring', 'source-register.json'), 'utf8'),
  ) as { governingAuthorities: unknown[]; authorisedOrigins: unknown[] };
  raw.governingAuthorities = [...raw.governingAuthorities, ...authorities];
  raw.authorisedOrigins = [...raw.authorisedOrigins, ...origins];
  return parseSourceRegister(raw);
}

const corpusOver = (index: CorpusIndex): CorpusCapability => ({
  index,
  document: (docId) => index.documents.find((d) => d.docId === docId)!,
  normalizedText: () => 'not read by admission',
});

/** The probe's own origin, declared for whichever sources a case gives it. */
const PROBE_URL = 'https://www.efrag.org/lab6';
const originFor = (sourceId: string) => ({
  sourceId,
  rationale: `Fixture: ${sourceId} has authorised the probe artefact.`,
  origins: [{ kind: 'exact' as const, url: PROBE_URL }],
});

/**
 * The exact world BLOCKER 1 demonstrated: a second document that is
 * origin-authorised, is **not** an entry point for the requirement's sources,
 * and is reached only by a structural edge from the entry document.
 */
function worldReaching(serves: string[]): CorpusIndex {
  const base = realIndex();
  const host = base.documents.find((d) => d.docId === 'DOC-32013L0034')!;
  return {
    ...base,
    documents: [
      ...base.documents,
      {
        ...host,
        docId: 'DOC-PROBE',
        url: PROBE_URL,
        serves,
        edges: [
          {
            edgeId: 'EDGE-PROBE',
            kind: 'amendedBy' as const,
            from: 'DOC-PROBE',
            to: 'DOC-32013L0034',
            provenance: {
              type: 'celex_metadata' as const,
              source: 'Fixture: a structural edge reaching the probe.',
              recordedOn: '2026-08-27',
            },
          },
        ],
      },
    ],
  };
}

describe('uncited is not non-citable — the committed corpus', () => {
  it('admits a traversal-reached document whose source is citable but cited by nothing', () => {
    // SRC-004 is `legal_record` and no requirement cites it. DOC-32026L0470 is
    // reached only from DOC-32013L0034's `amendedBy` edge, so this is the
    // positive control for the whole file: the guard must read the *tier*, not
    // whether anything currently rests on the source.
    const corpus = authoriseCorpus(loadCorpus(join(engineRoot, 'corpus')), registerWith(), csrdPack());
    const closure = EntitledClosure.forSources(corpus, registerWith(), ['SRC-001']);
    expect(closure.docIds).toContain('DOC-32026L0470');
    expect(docsForSources(realIndex(), ['SRC-001'])).not.toContain('DOC-32026L0470');
  });
});

describe('a closure document the register never said may carry normative text', () => {
  /** SRC-012 is a real pack source with no governing authority at all. */
  const UNCLASSIFIED = 'SRC-012';

  it('is admitted by origin authority, and still refused entry to the closure', () => {
    // The BLOCKER regression, end to end. Each step is asserted rather than
    // assumed, because the defect lived precisely in the gap between them.
    const index = worldReaching([UNCLASSIFIED]);
    const register = registerWith([], [originFor(UNCLASSIFIED)]);

    // 1. Corpus admission succeeds — the artefact's recorded origin is declared.
    const corpus = authoriseCorpus(corpusOver(index), register, csrdPack());

    // 2. It is not an entry point, and structural traversal reaches it anyway.
    const entries = docsForSources(index, ['SRC-001']);
    expect(entries).not.toContain('DOC-PROBE');
    expect(computeClosure(index, entries).docIds).toContain('DOC-PROBE');

    // 3. Exposure refuses. This is the line the defect crossed.
    expect(() => EntitledClosure.forSources(corpus, register, ['SRC-001'])).toThrow(
      ClosureCitabilityError,
    );
  });

  it('names the document, the source and which failure it was', () => {
    const index = worldReaching([UNCLASSIFIED]);
    const register = registerWith([], [originFor(UNCLASSIFIED)]);
    const corpus = authoriseCorpus(corpusOver(index), register, csrdPack());
    try {
      EntitledClosure.forSources(corpus, register, ['SRC-001']);
      expect.unreachable('should have refused');
    } catch (error) {
      expect(error).toBeInstanceOf(ClosureCitabilityError);
      expect((error as ClosureCitabilityError).failures).toEqual([
        { docId: 'DOC-PROBE', sourceId: UNCLASSIFIED, reason: 'no governing authority' },
      ]);
    }
  });

  /**
   * The tier matrix, over a traversal-reached document. Every case is the same
   * world with one field changed, so a green is about the tier and nothing else.
   */
  const TIERS = [
    { tier: 'legal_record', admitted: true },
    { tier: 'official_body', admitted: true },
    { tier: 'tracker', admitted: false },
    { tier: 'news', admitted: false },
  ] as const;

  for (const { tier, admitted } of TIERS) {
    it(`${admitted ? 'admits' : 'refuses'} a traversal-reached document served by a ${tier} source`, () => {
      const index = worldReaching([UNCLASSIFIED]);
      const register = registerWith(
        [{ sourceId: UNCLASSIFIED, tier, rationale: `Fixture: a ${tier} classification.` }],
        [originFor(UNCLASSIFIED)],
      );
      const corpus = authoriseCorpus(corpusOver(index), register, csrdPack());
      const run = () => EntitledClosure.forSources(corpus, register, ['SRC-001']);
      if (admitted) expect(run).not.toThrow();
      else expect(run).toThrow(ClosureCitabilityError);
    });
  }

  it('refuses a traversal-reached document that claims no source at all', () => {
    // The cheapest form of the same defect, and the one needing *no* register
    // row whatsoever. `serves: []` is schema-valid, so origin authority has
    // nothing to check and passes vacuously — and a guard written as a loop
    // over `serves[]` entries has nothing to reject, so it passes vacuously
    // too. Zero claims is not zero exposure: the document is still in the
    // closure and its text is still rendered.
    //
    // "No unsourced fact, no unexplained answer" makes an unsourced document
    // the one thing that may never become evidence, so the quantifier has to be
    // over closure *documents*, not over the source ids they happen to list.
    const index = worldReaching([]);
    const register = registerWith();
    const corpus = authoriseCorpus(corpusOver(index), register, csrdPack());

    // Both upstream boundaries admit it, which is why this one has to refuse.
    expect(computeClosure(index, docsForSources(index, ['SRC-001'])).docIds).toContain('DOC-PROBE');

    try {
      EntitledClosure.forSources(corpus, register, ['SRC-001']);
      expect.unreachable('should have refused');
    } catch (error) {
      expect(error).toBeInstanceOf(ClosureCitabilityError);
      expect((error as ClosureCitabilityError).failures).toEqual([
        { docId: 'DOC-PROBE', sourceId: null, reason: 'no served source' },
      ]);
    }
  });

  it('refuses a document one of whose two sources is not citable', () => {
    // One citable member must not rescue another. SRC-002 is `legal_record`;
    // SRC-012 has no row. A rule reading "some source is citable" admits this.
    //
    // SRC-002 rather than another classified source because the committed
    // register must not already declare an origin for it — a second declaration
    // for the same source is refused at parse time, and a fixture that collided
    // with a real row would fail for a reason that is not this test's subject.
    const index = worldReaching(['SRC-002', UNCLASSIFIED]);
    const register = registerWith([], [originFor('SRC-002'), originFor(UNCLASSIFIED)]);
    const corpus = authoriseCorpus(corpusOver(index), register, csrdPack());
    try {
      EntitledClosure.forSources(corpus, register, ['SRC-001']);
      expect.unreachable('should have refused');
    } catch (error) {
      const failures = (error as ClosureCitabilityError).failures;
      expect(failures).toHaveLength(1);
      expect(failures[0]).toMatchObject({ docId: 'DOC-PROBE', sourceId: UNCLASSIFIED });
    }
  });

  it('admits the same document once both of its sources are citable', () => {
    // The sibling that keeps the case above from passing against a rule that
    // refuses every multi-source document.
    const index = worldReaching(['SRC-002', UNCLASSIFIED]);
    const register = registerWith(
      [{ sourceId: UNCLASSIFIED, tier: 'legal_record', rationale: 'Fixture: now classified.' }],
      [originFor('SRC-002'), originFor(UNCLASSIFIED)],
    );
    const corpus = authoriseCorpus(corpusOver(index), register, csrdPack());
    expect(() => EntitledClosure.forSources(corpus, register, ['SRC-001'])).not.toThrow();
  });
});
