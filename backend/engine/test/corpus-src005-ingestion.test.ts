/**
 * T6 — the ESRS Set 1 consolidation, ingested for `SRC-005`.
 *
 * Two propositions, and they are not the same one:
 *
 * ```text
 * the artefact is what it says it is   -> hashes re-derive, tampering reds
 * closing its gap changed what it should -> S-012 loses one gap and stays halted
 * ```
 *
 * **Why the consolidation alone is honest evidence.** Spec §12.1 and the D1a-0b
 * audit both reasoned that EUR-Lex's 01/01/2025 consolidation of Delegated
 * Regulation (EU) 2023/2772 *predates* its amendment 2025/1416 (OJ 10.11.2025),
 * and concluded that ingesting the consolidation alone would silently omit the
 * postponement — so base and amending act had to be ingested together, joined by
 * a structural edge.
 *
 * That reasoning conflated publication with application. EUR-Lex dates a
 * consolidation by the date its text *applies*, and 2025/1416 "shall apply with
 * respect to financial years beginning on or after 1 January 2025" — the same
 * date. The consolidation therefore already carries the amended Annex I —
 * asserted below against the pinned bytes, and specifically against M1-sourced
 * text inside the *enacting terms*, because EUR-Lex lists an amendment in its
 * "Amended by" header whether or not the consolidation incorporates it. A check
 * that read the header would have confirmed the spec's conclusion instead of
 * refuting it. `corpus_gap(SRC-005) = false` consequently
 * claims something true: the applicable text S-012 selects is present.
 *
 * With the completeness argument gone, §14 rule 1 governs `SRC-006` — *"a source
 * that is legally relevant but relied on by nothing stays registered and
 * unserved"* — and no requirement cites it. So no amending act is ingested here,
 * and no structural edge is written. The absence is a conclusion, not an
 * omission, and the edge assertion below is what keeps it one.
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
import { docsForSources, computeClosure } from '../src/corpus/closure';
import { EntitledClosure } from '../src/pipeline/entitlement';
import type { CorpusIndex } from '../src/corpus/types';
import { csrdPack } from './helpers';
import { standingMapFor } from '../src/corpus/standing';

const engineRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const corpusDir = join(engineRoot, 'corpus');
const DOC = 'DOC-32023R2772';

const realRegister = () =>
  parseSourceRegister(
    JSON.parse(readFileSync(join(engineRoot, 'monitoring', 'source-register.json'), 'utf8')),
  );

const entry = () => loadCorpus(corpusDir).index.documents.find((d) => d.docId === DOC)!;

/** A scratch copy of the committed corpus, so tampering never touches the tree. */
let scratch = '';
afterEach(() => {
  if (scratch) rmSync(scratch, { recursive: true, force: true });
  scratch = '';
});
function corpusCopy(): string {
  scratch = mkdtempSync(join(tmpdir(), 'src005-'));
  cpSync(corpusDir, join(scratch, 'corpus'), { recursive: true });
  return join(scratch, 'corpus');
}

describe('the SRC-005 artefact is what the index says it is', () => {
  it('is committed, serves only SRC-005, and carries the consolidation identity', () => {
    const doc = entry();
    expect(doc.serves).toEqual(['SRC-005']);
    expect(doc.url).toBe('https://eur-lex.europa.eu/eli/reg_del/2023/2772/2025-01-01');
    // "applicable from", not "in force from": `in_force` is a defined member of
    // `LegalStatus` on the requirement side, and spec §7 records that
    // `CorpusDocument` carries "nothing about legal effect". Writing a
    // legal-standing word into a free-text label is the overclaim E2 exists to
    // close, and the consolidation date is an *application* date in any case.
    expect(doc.versionLabel).toBe(
      'consolidated text applicable from 2025-01-01 (CELEX 02023R2772-20250101)',
    );
    expect(doc.versionLabel).not.toContain('in force');
    expect(doc.normalizerVersion).toBe(NORMALIZER_VERSION);
    expect(doc.contentSelector).toBe('#text');
  });

  it('re-derives both recorded hashes from the files on disk', () => {
    // Through `loadCorpus`, which is the production integrity path: it re-hashes
    // the raw bytes and the normalized text for every document. Asserted against
    // the same bytes rather than against a second hash implementation.
    const doc = entry();
    const rawBytes = readFileSync(join(corpusDir, doc.rawPath));
    const normalizedText = readFileSync(join(corpusDir, doc.normalizedPath), 'utf8');
    expect(sha256Hex(rawBytes)).toBe(doc.sha256Raw);
    expect(sha256Hex(normalizedText)).toBe(doc.sha256Normalized);
  });

  it('reproduces its normalized text from its own raw bytes and recorded selector', () => {
    // Not merely "the hash matches the file" — that a *different* normalizer
    // run over the stored raw side lands on the same text, which is what makes
    // the raw store re-normalizable rather than decorative.
    const doc = entry();
    const rawText = readFileSync(join(corpusDir, doc.rawPath), 'utf8');
    const reproduced = normalize(rawText, doc.contentSelector ?? undefined);
    expect(sha256Hex(reproduced)).toBe(doc.sha256Normalized);
  });

  it('carries 2025/1416 in its enacting text, not merely in its "Amended by" header', () => {
    // **The load-bearing claim of T6, and the header will not do.** EUR-Lex
    // lists every amendment it knows of in the "Amended by" table whether or not
    // the consolidation incorporates it, so `2025/1416` and an `M1` marker both
    // appear there regardless. Asserting either would prove nothing — which is
    // precisely the mistake that produced the spec's conclusion.
    //
    // The discriminating fact is M1-sourced text inside the enacting terms,
    // which begin at the first `▼B`. Both halves are asserted so the position
    // is doing the work rather than the string.
    const text = readFileSync(join(corpusDir, entry().normalizedPath), 'utf8');
    const enactingFrom = text.indexOf('▼B');
    expect(enactingFrom).toBeGreaterThan(0);
    const header = text.slice(0, enactingFrom);
    const body = text.slice(enactingFrom);

    // The header alone is not evidence: it names the amendment either way.
    expect(header).toContain('2025/1416');
    expect(header).toContain('M1');

    // The body is. A `▼M1` block exists only where EUR-Lex substituted text.
    expect(body).toContain('▼M1');

    // …and this operative paragraph sits inside an inline `►M1 … ◄` span and is
    // conditioned on Appendix C's rows, so it cannot be present unless the
    // amendment was woven in.
    //
    // Deliberately *not* asserted: that the body contains "List of phased-in
    // Disclosure Requirements". Appendix C carried that title before 2025/1416
    // and the string occurs four times, three of them in base text — it would
    // pass against an unamended consolidation, and an assertion that cannot
    // fail for the right reason is worse than absent, because a later reader
    // may keep it and drop the two that carry the weight.
    expect(body).toContain(
      'in accordance with the rows of Appendix C of ESRS 1 showing ‘All disclosure requirements’',
    );
  });

  it('is amended by 2025/1416 and by nothing else, which is what retires T7', () => {
    // The retirement of T7 needs more than "this amendment is incorporated": it
    // needs that no *other* amendment lags the pinned consolidation, because
    // §14 rule 2 re-engages on any amendment the consolidation does not carry.
    // True on these bytes and asserted here, so the corpus answers it on every
    // run rather than resting on a reading taken once.
    const text = readFileSync(join(corpusDir, entry().normalizedPath), 'utf8');
    const header = text.slice(0, text.indexOf('▼B'));
    expect(header).toContain('M1');
    expect(header).not.toContain('M2');
    expect(text).not.toContain('▼M2');
    expect(text).not.toContain('►M2');
  });

  it('is stable where it must be: the raw side varies, the evidence does not', () => {
    // Re-fetching this URL yields different bytes — the page chrome carries CSRF
    // tokens ahead of the `#text` element — so `sha256Raw` records *this*
    // retrieval rather than a reproducible identifier for the document. The
    // normalized side, which is what any role ever reads, was byte-identical
    // across two fetches taken minutes apart.
    //
    // Stated as a property rather than a hash comparison: what must hold is that
    // the stored raw bytes deterministically reproduce the stored evidence, and
    // that is the assertion above this one. Recorded here so a future reader
    // does not mistake a moving `sha256Raw` for corruption.
    const doc = entry();
    expect(doc.sha256Normalized).toBe(
      'e120ea16ec6133934782742aebc4f0e5814e4a3358c074762ea6393662111858',
    );
    const rawText = readFileSync(join(corpusDir, doc.rawPath), 'utf8');
    const csrfAt = rawText.search(/csrf/i);
    const contentAt = rawText.indexOf('id="text"');
    // Both located before they are compared: `search` returns -1 when absent,
    // so an unguarded `toBeGreaterThan` would pass precisely when the premise
    // this test documents had stopped holding.
    expect(csrfAt, 'volatile page chrome should be present').toBeGreaterThan(-1);
    expect(contentAt, 'the extracted element should be present').toBeGreaterThan(-1);
    expect(contentAt).toBeGreaterThan(csrfAt);
  });

  it('introduces no structural edge, so it pulls nothing into another closure', () => {
    // T6 deliberately ingests one artefact. An `amends` edge here would be
    // traversed in both directions at no depth cost and would pull this
    // document's 889,207 normalized chars into unrelated closures — see §15. There is nothing to relate it to,
    // and edges are declared rather than inferred (§14 rule 3).
    expect(entry().edges).toEqual([]);
    const { index } = loadCorpus(corpusDir);
    expect(computeClosure(index, [DOC], standingMapFor(index, csrdPack())).docIds).toEqual([DOC]);
  });
});

describe('tampering with the SRC-005 artefact is refused, naming that document', () => {
  const tamper = (which: 'rawPath' | 'normalizedPath', bytes: string) => {
    const dir = corpusCopy();
    const doc = entry();
    writeFileSync(join(dir, doc[which]), bytes, 'utf8');
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

  it('names this document and not another — the wrong file would pass this test', () => {
    // The plan asks for exactly this discrimination: "a red naming a different
    // document means the wrong file was touched".
    try {
      loadCorpus(tamper('normalizedPath', 'edited'));
      expect.unreachable('tampering must be refused');
    } catch (error) {
      expect(String(error)).toContain(DOC);
      expect(String(error)).not.toContain('DOC-32013L0034');
    }
  });

  it('positive control: the untampered copy loads', () => {
    // Without this, the three refusals above would pass equally against a
    // `loadCorpus` that rejected every corpus in a temp directory.
    expect(() => loadCorpus(corpusCopy())).not.toThrow();
  });
});

describe('the SRC-005 artefact earns its source, and may become evidence', () => {
  it('passes AuthorisedCorpus against the declaration authored for SRC-005', () => {
    expect(() => authoriseCorpus(loadCorpus(corpusDir), realRegister(), csrdPack())).not.toThrow();
  });

  it('is refused if it claims a source whose origin declaration does not cover it', () => {
    // The declaration is `exact` on the consolidated URL, so it authorises this
    // artefact for SRC-005 and confers nothing on any other source — including
    // the other EUR-Lex instruments on the same host.
    const index = loadCorpus(corpusDir).index;
    const relabelled: CorpusIndex = {
      ...index,
      documents: index.documents.map((d) => (d.docId === DOC ? { ...d, serves: ['SRC-002'] } : d)),
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
        sourceId: 'SRC-002',
      });
    }
  });

  it('is closure-citable because SRC-005 holds an explicit citable governing authority', () => {
    // Task 5's separation, restated on the new document: eligibility comes from
    // `governingAuthorities` through `sourceCitability`, never from the fact
    // that some requirement happens to cite SRC-005.
    const verdict = sourceCitability(realRegister(), 'SRC-005');
    expect(verdict).toEqual({ citable: true, tier: 'legal_record' });

    const corpus = authoriseCorpus(loadCorpus(corpusDir), realRegister(), csrdPack());
    const closure = EntitledClosure.forSources(corpus, realRegister(), csrdPack(), ['SRC-005']);
    expect(closure.docIds).toEqual([DOC]);
  });
});

describe('closing one gap is not becoming readable — CSRD-S-012', () => {
  const pack = csrdPack();
  const s012 = pack.requirements.find((r) => r.id === 'CSRD-S-012')!;

  it('cites two sources, of which the corpus now serves exactly one', () => {
    const { index } = loadCorpus(corpusDir);
    expect(s012.sources).toEqual(['SRC-005', 'SRC-007']);
    expect(docsForSources(index, ['SRC-005'])).toEqual([DOC]);
    expect(docsForSources(index, ['SRC-007'])).toEqual([]);
  });

  it('opens onto real text and still carries the SRC-007 gap', () => {
    // The two halves of the T6 invariant in one assertion pair: the gap that
    // closed, and the gap that did not. A test that asserted only the first
    // would let "one gap disappeared" read as "the requirement can now be
    // verified", which is false for every requirement with a second gap.
    const corpus = authoriseCorpus(loadCorpus(corpusDir), realRegister(), csrdPack());
    const closure = EntitledClosure.forSources(corpus, realRegister(), csrdPack(), s012.sources);
    expect(closure.corpusServes('SRC-005')).toBe(true);
    expect(closure.corpusServes('SRC-007')).toBe(false);
    expect(closure.docIds).toEqual([DOC]);
  });

  it('changes nothing for the requirements that do not cite SRC-005', () => {
    // The affected population is computed from provenance, not asserted about
    // one representative requirement. Only S-012 cites SRC-005, so only S-012
    // may have moved; every other closure must be as it was.
    const citing = pack.requirements.filter((r) => r.sources.includes('SRC-005')).map((r) => r.id);
    expect(citing).toEqual(['CSRD-S-012']);

    const corpus = authoriseCorpus(loadCorpus(corpusDir), realRegister(), csrdPack());
    for (const requirement of pack.requirements) {
      if (requirement.id === 'CSRD-S-012') continue;
      const docIds = EntitledClosure.forSources(corpus, realRegister(), csrdPack(), requirement.sources).docIds;
      expect(docIds, requirement.id).not.toContain(DOC);
    }
  });

  it('leaves CSRD-S-012 in the gap-bearing partition', () => {
    // The requirement gained evidence and did not gain reachability, which is
    // the distinction T6 exists to keep. The partition *totals* moved later —
    // T9 served SRC-002 and took CSRD-S-003 and CSRD-S-004 out — so this
    // asserts the membership T6 is responsible for rather than a count T6 does
    // not own.
    const { index } = loadCorpus(corpusDir);
    const served = new Set(index.documents.flatMap((d) => d.serves));
    const bearing = pack.requirements
      .filter((r) => r.sources.some((s) => !served.has(s)))
      .map((r) => r.id);
    expect(bearing).toContain('CSRD-S-012');
    expect(pack.requirements).toHaveLength(16);
  });
});
