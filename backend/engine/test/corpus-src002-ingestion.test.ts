/**
 * T9 — the consolidated CSRD, ingested for `SRC-002`.
 *
 * Two propositions, and the second is the one T9 exists for:
 *
 * ```text
 * the artefact is what it says it is  -> hashes re-derive, tampering reds
 * closing its gaps changed what it should -> S-003 and S-004 become reachable
 * ```
 *
 * **Why the host provision had to be ingested at all.** `CSRD-S-003` cites
 * `Article 5(2)` and `CSRD-S-004` cites `Article 5(2), fifth subparagraph`, and
 * the corpus already held the act that *amends* them — Directive (EU) 2026/470,
 * served for `SRC-004`, whose Article 3 rewrites points of Article 5(2) and adds
 * the FY2025-26 derogation. What it did not hold was the provision those deltas
 * apply to. `point (c) is deleted` and `point (i) is replaced by the following`
 * presuppose a base text; and the added subparagraph is never numbered by the
 * amending act, so "fifth" is a claim about the consolidated Article 5(2) and
 * about nothing the corpus previously held.
 *
 * **The ordinal is asserted, not assumed.** The preflight established it from a
 * live response; this file re-establishes it from the pinned bytes, because an
 * artefact is evidence only for what it actually contains. If the seating ever
 * changed, the right answer would be to re-examine `CSRD-S-004`'s recorded
 * locator, never to relax the assertion until it passes.
 *
 * **Incorporation is read from the enacting terms.** EUR-Lex lists an amendment
 * in the "Amended by" header whether or not the consolidation carries it, so
 * marker counts alone prove nothing. This consolidation carries two amendments,
 * `M1` = Directive (EU) 2025/794 and `M2` = Directive (EU) 2026/470, and the
 * assertions below quote operative wording each contributed.
 */

import { describe, expect, it, afterEach } from 'vitest';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadCorpus } from '../src/corpus/store';
import { normalize, NORMALIZER_VERSION } from '../src/corpus/normalize';
import { sha256Hex } from '../src/corpus/hash';
import { authoriseCorpus, CorpusAuthorityError } from '../src/corpus/authority';
import { parseSourceRegister, sourceCitability } from '../src/monitoring/register';
import { originAuthorises } from '../src/monitoring/origin';
import { docsForSources, computeClosure } from '../src/corpus/closure';
import { EntitledClosure } from '../src/pipeline/entitlement';
import type { CorpusIndex } from '../src/corpus/types';
import { csrdPack } from './helpers';
import { standingMapFor } from '../src/corpus/standing';

const engineRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const corpusDir = join(engineRoot, 'corpus');
const DOC = 'DOC-32022L2464';

const realRegister = () =>
  parseSourceRegister(
    JSON.parse(readFileSync(join(engineRoot, 'monitoring', 'source-register.json'), 'utf8')),
  );

const entry = () => loadCorpus(corpusDir).index.documents.find((d) => d.docId === DOC)!;
const normalizedText = () => readFileSync(join(corpusDir, entry().normalizedPath), 'utf8');

/** Header is everything before the enacting terms begin at the first `▼B`. */
function split(text: string): { header: string; body: string } {
  const at = text.indexOf('▼B');
  expect(at).toBeGreaterThan(0);
  return { header: text.slice(0, at), body: text.slice(at) };
}

let scratch = '';
afterEach(() => {
  if (scratch) rmSync(scratch, { recursive: true, force: true });
  scratch = '';
});
function corpusCopy(): string {
  scratch = mkdtempSync(join(tmpdir(), 'src002-'));
  cpSync(corpusDir, join(scratch, 'corpus'), { recursive: true });
  return join(scratch, 'corpus');
}

describe('the SRC-002 artefact is what the index says it is', () => {
  it('is committed, serves only SRC-002, and carries the consolidation identity', () => {
    const doc = entry();
    expect(doc.serves).toEqual(['SRC-002']);
    expect(doc.url).toBe('https://eur-lex.europa.eu/eli/dir/2022/2464/2026-03-18');

    // **"dated", not "applicable from" and not "in force from".** The proven
    // fact is the consolidation's date. Unlike SRC-005 — where the amending
    // act's own application clause was read and quoted — no application clause
    // was established here, so the label claims only the date. `in_force` is a
    // defined `LegalStatus` member and spec §7 records that `CorpusDocument`
    // carries nothing about legal effect; a free-text label must not smuggle in
    // what E2 exists to decide.
    expect(doc.versionLabel).toBe(
      'consolidated text dated 2026-03-18 (CELEX 02022L2464-20260318)',
    );
    expect(doc.versionLabel).not.toContain('in force');
    expect(doc.versionLabel).not.toContain('applicable from');

    expect(doc.normalizerVersion).toBe(NORMALIZER_VERSION);
    expect(doc.contentSelector).toBe('#text');
  });

  it('re-derives both recorded hashes from the files on disk', () => {
    const doc = entry();
    expect(sha256Hex(readFileSync(join(corpusDir, doc.rawPath)))).toBe(doc.sha256Raw);
    expect(sha256Hex(readFileSync(join(corpusDir, doc.normalizedPath), 'utf8'))).toBe(
      doc.sha256Normalized,
    );
  });

  it('reproduces its normalized text from its own raw bytes and recorded selector', () => {
    const doc = entry();
    const raw = readFileSync(join(corpusDir, doc.rawPath), 'utf8');
    expect(sha256Hex(normalize(raw, doc.contentSelector ?? undefined))).toBe(doc.sha256Normalized);
  });

  it('introduces no structural edge, so it pulls nothing into another closure', () => {
    expect(entry().edges).toEqual([]);
    expect(computeClosure(loadCorpus(corpusDir).index, [DOC], standingMapFor(loadCorpus(corpusDir).index, csrdPack())).docIds).toEqual([DOC]);
  });
});

describe('the pinned body carries Article 5(2) as amended', () => {
  it('contains Article 5(2) in the enacting terms, not merely in metadata', () => {
    const { body } = split(normalizedText());
    expect(body).toContain(
      'Member States shall apply the measures necessary to comply with Article 1, with the exception of point (14):',
    );
  });

  it('seats the FY2025-26 derogation as the fifth subparagraph of Article 5(2)', () => {
    // **The load-bearing assertion of T9.** `CSRD-S-004` cites the fifth
    // subparagraph by ordinal, and the ordinal exists only here: the amending
    // act adds the subparagraph without numbering it. Enumerated rather than
    // matched, so the position is what passes rather than the words.
    const { body } = split(normalizedText());
    const derogation = body.indexOf(
      'By way of derogation from point (a) of the first subparagraph',
    );
    expect(derogation).toBeGreaterThan(0);

    const preceding = [
      ...body
        .slice(Math.max(0, derogation - 6200), derogation)
        .matchAll(/Member States shall apply the measures necessary to comply with [^:.]*[:.]/g),
    ].map((m) => m[0]);

    expect(preceding).toHaveLength(4);
    expect(preceding[0]).toContain('Article 1, with the exception of point (14)');
    expect(preceding[1]).toContain('point (14) of Article 1');
    expect(preceding[2]).toContain('Article 2');
    expect(preceding[3]).toContain('Article 3');
    // Four before it, so the derogation is the fifth. Its own wording agrees:
    // it derogates from "the first subparagraph" and "the third subparagraph",
    // which are exactly the two above that carry points (a)/(b).
    expect(body.slice(derogation, derogation + 200)).toContain(
      'and point (a) of the third subparagraph',
    );
  });

  it('carries M2 (2026/470) as operative text, which the header alone would not show', () => {
    const { header, body } = split(normalizedText());
    // The header names both amendments either way, so it is not evidence.
    expect(header).toContain('M1');
    expect(header).toContain('M2');
    // The body is: wording M2 substituted, and the subparagraph it added.
    expect(body).toContain('▼M2');
    expect(body).toContain('for financial years starting between 1 January 2024 and 31 December 2026');
    expect(body).toContain('EUR 450 000 000 and an average number of 1 000 employees');
    expect(body).toContain(
      'for the financial years starting between 1 January 2025 and 31 December 2026',
    );
    expect(header).not.toContain('By way of derogation from point (a) of the first subparagraph');
  });

  it('carries M1 (2025/794) as operative text too, inside Article 5(2) itself', () => {
    // The second amendment, and the reason the ordinal question mattered: this
    // paragraph has been rewritten twice. `SRC-003` is 2025/794 in the
    // catalogue; it stays registered and unserved because no requirement cites
    // it and this consolidation postdates it, so nothing lags.
    const { header, body } = split(normalizedText());
    expect(body).toContain('►M1');
    expect(body).toContain('for financial years starting on or after 1 January 2027');
    expect(header).not.toContain('for financial years starting on or after 1 January 2027');
  });
});

describe('tampering with the SRC-002 artefact is refused, naming that document', () => {
  const tamper = (which: 'rawPath' | 'normalizedPath', bytes: string) => {
    const dir = corpusCopy();
    writeFileSync(join(dir, entry()[which]), bytes, 'utf8');
    return dir;
  };

  it('reds on a raw file edited after indexing', () => {
    expect(() => loadCorpus(tamper('rawPath', '<html><div id="text">edited</div></html>'))).toThrow(
      /sha256Raw/,
    );
  });

  it('reds on a normalized file edited after indexing', () => {
    expect(() => loadCorpus(tamper('normalizedPath', 'edited'))).toThrow(/sha256Normalized/);
  });

  it('names this document and not another', () => {
    try {
      loadCorpus(tamper('normalizedPath', 'edited'));
      expect.unreachable('tampering must be refused');
    } catch (error) {
      expect(String(error)).toContain(DOC);
      expect(String(error)).not.toContain('DOC-32013L0034');
    }
  });

  it('positive control: the untampered copy loads', () => {
    expect(() => loadCorpus(corpusCopy())).not.toThrow();
  });
});

describe('the SRC-002 artefact earns its source, and may become evidence', () => {
  it('passes AuthorisedCorpus against the declaration authored for SRC-002', () => {
    expect(() => authoriseCorpus(loadCorpus(corpusDir), realRegister(), csrdPack())).not.toThrow();
  });

  it('is refused if it claims a source that has authorised no origin at all', () => {
    // Relabelled to SRC-007, which is registered and cited but has declared no
    // origin, so authority fails closed on the missing declaration.
    //
    // This case does **not** show that the matcher is narrow: the `no
    // declaration` branch fires before any URL is compared, so it would read
    // the same under a `path_prefix` row. Narrowness is the separate case
    // below, which pins the declared `kind` and rejects sibling expressions.
    const index = loadCorpus(corpusDir).index;
    const relabelled: CorpusIndex = {
      ...index,
      documents: index.documents.map((d) => (d.docId === DOC ? { ...d, serves: ['SRC-007'] } : d)),
    };
    const capability = {
      index: relabelled,
      document: (id: string) => relabelled.documents.find((d) => d.docId === id)!,
      normalizedText: () => 'not read by authorisation',
    };
    try {
      authoriseCorpus(capability as never, realRegister(), csrdPack());
      expect.unreachable('a relabelled artefact must be refused');
    } catch (error) {
      expect((error as CorpusAuthorityError).failures[0]).toMatchObject({
        docId: DOC,
        sourceId: 'SRC-007',
      });
    }
  });

  it('declares one exact origin, so no sibling expression inherits the permission', () => {
    // **The matcher kind is pinned, not just its effect today.** Widening this
    // row to `path_prefix` on the instrument ELI leaves every other assertion in
    // this file green — the pinned artefact still authorises — while silently
    // admitting the OJ publication and every future consolidation of the same
    // directive. Origin authority loosened by accident is exactly what T5 built
    // `authorisedOrigins` to prevent, so the narrowness is asserted directly.
    const row = realRegister().authorisedOrigins.find((r) => r.sourceId === 'SRC-002')!;
    expect(row.origins).toHaveLength(1);
    expect(row.origins[0]).toEqual({
      kind: 'exact',
      url: 'https://eur-lex.europa.eu/eli/dir/2022/2464/2026-03-18',
    });

    // What `exact` means here, stated as behaviour: siblings under the same
    // instrument ELI are outside the declaration. A `path_prefix` row would
    // admit all three of these.
    expect(originAuthorises(row.origins[0]!, 'https://eur-lex.europa.eu/eli/dir/2022/2464/2026-03-18')).toBe(true);
    for (const sibling of [
      'https://eur-lex.europa.eu/eli/dir/2022/2464/oj/eng',
      'https://eur-lex.europa.eu/eli/dir/2022/2464/2026-03-18/eng',
      'https://eur-lex.europa.eu/eli/dir/2022/2464/2027-01-30',
    ]) {
      expect(originAuthorises(row.origins[0]!, sibling), sibling).toBe(false);
    }
  });

  it('is closure-citable because SRC-002 holds an explicit citable governing authority', () => {
    expect(sourceCitability(realRegister(), 'SRC-002')).toEqual({
      citable: true,
      tier: 'legal_record',
    });
    const corpus = authoriseCorpus(loadCorpus(corpusDir), realRegister(), csrdPack());
    expect(EntitledClosure.forSources(corpus, realRegister(), csrdPack(), ['SRC-002']).docIds).toEqual([DOC]);
  });
});

describe('the affected population — S-003 and S-004 at T9, joined on 2026-10-20 by the C/G requirements that cite Article 5(2), and on 2026-10-23 by the Article 40a gate (E-1)', () => {
  const pack = csrdPack();

  it('serves the only source the T9 two cite, and one of the two the composition\'s timing and duty requirements cite', () => {
    const citing = pack.requirements
      .filter((r) => r.sources.includes('SRC-002'))
      .map((r) => r.id);
    expect(citing).toEqual(['CSRD-S-003', 'CSRD-S-004', 'CSRD-S-007', 'CSRD-S-017', 'CSRD-S-018', 'CSRD-S-020', 'CSRD-S-021', 'CSRD-S-022']);
    // The T9 population, and the consolidated derogation, cite nothing else.
    for (const id of ['CSRD-S-003', 'CSRD-S-004', 'CSRD-S-022']) {
      expect(pack.requirements.find((r) => r.id === id)!.sources, id).toEqual(['SRC-002']);
    }
    // The first-application rules and the route duties cite the host directive beside it.
    for (const id of ['CSRD-S-017', 'CSRD-S-018', 'CSRD-S-020', 'CSRD-S-021']) {
      expect(pack.requirements.find((r) => r.id === id)!.sources.sort(), id).toEqual(['SRC-001', 'SRC-002']);
    }
    // E-1 (QD-4, DG-6): the Article 40a group gate cites Article 5(2)'s second
    // subparagraph for its 2028 start, beside Article 40a in the host directive.
    expect(pack.requirements.find((r) => r.id === 'CSRD-S-007')!.sources).toEqual(['SRC-001', 'SRC-002']);
    expect(docsForSources(loadCorpus(corpusDir).index, ['SRC-002'])).toEqual([DOC]);
  });

  it('opens both onto the artefact and leaves neither with a gap', () => {
    const corpus = authoriseCorpus(loadCorpus(corpusDir), realRegister(), csrdPack());
    for (const id of ['CSRD-S-003', 'CSRD-S-004']) {
      const requirement = pack.requirements.find((r) => r.id === id)!;
      const closure = EntitledClosure.forSources(corpus, realRegister(), csrdPack(), requirement.sources);
      expect(closure.docIds, id).toEqual([DOC]);
      expect(closure.corpusServes('SRC-002'), id).toBe(true);
    }
  });

  it('moves the partition from twelve and four to fourteen and two', () => {
    // The measurement T9 is responsible for. Counted from provenance against
    // what the corpus serves, not asserted from a list.
    const served = new Set(loadCorpus(corpusDir).index.documents.flatMap((d) => d.serves));
    const bearing = pack.requirements
      .filter((r) => r.sources.some((s) => !served.has(s)))
      .map((r) => r.id);
    expect(bearing).toEqual(['CSRD-S-011', 'CSRD-S-012']);
    // Twenty-three since the C/G composition (2026-10-20), every new one over served sources.
    expect(pack.requirements).toHaveLength(23);
    expect(pack.requirements.length - bearing.length).toBe(21);
  });

  it('changes nothing for the requirements that do not cite SRC-002', () => {
    const corpus = authoriseCorpus(loadCorpus(corpusDir), realRegister(), csrdPack());
    for (const requirement of pack.requirements) {
      if (requirement.sources.includes('SRC-002')) continue;
      expect(
        EntitledClosure.forSources(corpus, realRegister(), csrdPack(), requirement.sources).docIds,
        requirement.id,
      ).not.toContain(DOC);
    }
  });

  it('leaves S-011 and S-012 gap-bearing, on the sources that still block them', () => {
    // The negative controls. Their halts are what keeps "one gap closed" from
    // reading as "the corpus is complete"; that they run to zero requests is
    // asserted through the production path in pipeline-source-completeness.
    const served = new Set(loadCorpus(corpusDir).index.documents.flatMap((d) => d.serves));
    const gapsOf = (id: string) =>
      pack.requirements.find((r) => r.id === id)!.sources.filter((s) => !served.has(s));
    expect(gapsOf('CSRD-S-011')).toEqual(['SRC-008']);
    expect(gapsOf('CSRD-S-012')).toEqual(['SRC-007']);
  });
});
