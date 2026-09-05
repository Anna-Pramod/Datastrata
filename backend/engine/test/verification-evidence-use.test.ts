/**
 * Evidence use — the signing-side designation of what each evidence set is
 * for, and where its support lies (B-EVID-SPAN).
 *
 * The evidence checker proves a quote exists somewhere in a pinned document.
 * A signature needs more from a positive legal proposition: an occurrence of
 * a supporting quote located wholly inside an authored operative range, the
 * occurrence identified rather than inferred, and the whole designation bound
 * to the exact result it was made for. Contextual evidence — a challenge that
 * quotes a header to show a miscitation — stays verifiable and is designated
 * contextual explicitly, by the reviewer, never by inference from who produced
 * it or from what happened not to be selected.
 *
 * The machine verifies three things and only three: **completeness** (every
 * set designated, every reading element supported), **provenance** (each
 * selected occurrence belongs to the cited item, its document and its hash)
 * and **containment** (the occurrence lies wholly inside a currently declared
 * range). Whether the words support the proposition is the reviewer's
 * judgement; nothing here proves entailment.
 *
 * Designation is per set *and* per item. A contextual set covers all its
 * contents with one reason. A support set names every quote in it, nested
 * ones included: each either supports, with an occurrence selected by its
 * stored offset when more than one is eligible, or is contextual with its own
 * reason. Nothing is left over to be treated as context by default, a
 * duplicate declaration is contradictory rather than last-wins, and the
 * occurrence the record carries is the one the reviewer selected.
 *
 * Proved over the real first-case documents and their actual declarations,
 * because the ambiguity that motivates explicit selection is real there: the
 * threshold sentence is eligible in Article 1 and in Article 29a.
 */

import { describe, expect, it } from 'vitest';
import { resolveRanges } from '../src/corpus/ranges';
import { resultSha256, type VerificationResult } from '../src/verification/result';
import { sha256Hex } from '../src/corpus/hash';
import {
  evidenceUseDesignationSchema,
  quotesOf,
  resolveEvidenceUse,
  verifyEvidenceUse,
  type EvidenceUseDesignation,
} from '../src/verification/evidence-use';
import { evidenceSetsOf } from '../src/verification/evidence-sets';
import { AMENDING, firstCaseResult, firstCaseWorld, HEADER_AMENDING, HEADER_HOST, HOST, quoteOf, THRESHOLD, UNDECLARED, UNIQUE_29A, UNIQUE_PT5 } from './evidence-use-fixtures';

const world = firstCaseWorld();
const { corpus } = world;
const hashOf = (docId: string) => corpus.document(docId).sha256Normalized;
const quote = (docId: string, text: string) => quoteOf(world, docId, text);

/** A result carrying the given reading elements and challenges, valid under the result schema. */
function makeResult(over: { reading?: unknown[]; challenges?: unknown[] } = {}): VerificationResult {
  return firstCaseResult(world, {
    ...(over.reading === undefined ? {} : { reading: { elements: over.reading as VerificationResult['reading']['elements'] } }),
    ...(over.challenges === undefined ? {} : { challenges: over.challenges as VerificationResult['challenges'] }),
  });
}

const R1 = 'reading.elements[0] (R1).evidence';

function designation(result: VerificationResult, sets: EvidenceUseDesignation['sets']): EvidenceUseDesignation {
  return { resultSha256: resultSha256(result), sets };
}

/** A support designation naming every quote in the set as support, with optional selections by item. */
function support(result: VerificationResult, set: string, selections: Record<string, { docId: string; rangeId: string; offset: number }> = {}) {
  const found = evidenceSetsOf(result).find((s) => s.recordPath === set);
  if (found === undefined) throw new Error(`no set ${set}`);
  return {
    set,
    use: 'support' as const,
    items: quotesOf(found.items).map((q) => ({ item: q.path, use: 'support' as const, ...(selections[q.path] === undefined ? {} : { selection: selections[q.path] }) })),
  };
}

describe('quotesOf — every quote in a set, by path, nested ones included', () => {
  it('E1 — enumerates plain, hop, from and to quotes and skips absence claims', () => {
    const paths = quotesOf([
      quote(HOST, 'a'),
      { kind: 'absence', docIds: [HOST], term: 'x' },
      { kind: 'amendment_chain', hops: [{ edgeId: 'E1', quote: quote(AMENDING, 'b') }, { edgeId: 'E2', quote: quote(HOST, 'c') }] },
      { kind: 'cross_reference', edgeId: 'E3', from: quote(HOST, 'd'), to: quote(AMENDING, 'e') },
    ]).map((q) => `${q.path}=${q.quote.text}`);
    expect(paths).toEqual(['evidence[0]=a', 'evidence[2].hops[0].quote=b', 'evidence[2].hops[1].quote=c', 'evidence[3].from=d', 'evidence[3].to=e']);
  });
});

describe('the designation is explicit, complete and bound to the result', () => {
  it('E2 — a contextual set is recorded with its reason and covers all its contents; without a reason, or with item designations, it is refused', () => {
    const result = makeResult({
      challenges: [{ id: 'C1', lens: 'miscitation', statement: 'The header is quoted as if operative.', verdict: 'CONFIRMED', evidence: [quote(HOST, HEADER_HOST)], resolution: 'x', adjudicationEvidence: [quote(HOST, UNIQUE_29A)] }],
    });
    const C1 = 'challenges[0] (C1).evidence';
    const C1A = 'challenges[0] (C1).adjudicationEvidence';
    const ok = resolveEvidenceUse({ result, designation: designation(result, [
      support(result, R1),
      { set: C1, use: 'context', reason: 'Quotes the consolidation header to show the miscitation the challenge is about.' },
      support(result, C1A),
    ]), corpus });
    expect(ok.problems).toEqual([]);
    expect(ok.records.map((r) => [r.set, r.use, r.occurrences.length, r.contextual.length])).toEqual([[R1, 'support', 1, 0], [C1, 'context', 0, 0], [C1A, 'support', 1, 0]]);
    expect(ok.records[1]?.reason).toContain('miscitation');
    const noReason = resolveEvidenceUse({ result, designation: designation(result, [support(result, R1), { set: C1, use: 'context' }, support(result, C1A)]), corpus });
    expect(noReason.problems.map((p) => [p.code, p.set])).toEqual([['undesignated_evidence', C1]]);
    expect(noReason.problems[0]?.detail).toContain('explicit reason');
    // A contextual set with item designations contradicts itself: context covers everything in it.
    const contradictory = resolveEvidenceUse({ result, designation: designation(result, [support(result, R1), { set: C1, use: 'context', reason: 'r', items: [{ item: 'evidence[0]', use: 'support' }] }, support(result, C1A)]), corpus });
    expect(contradictory.problems.map((p) => [p.code, p.set])).toEqual([['undesignated_evidence', C1]]);
    expect(contradictory.problems[0]?.detail).toContain('contradict');
  });

  it('E2 — a reading element cannot be designated contextual, and its context is never inferred', () => {
    const result = makeResult();
    const refused = resolveEvidenceUse({ result, designation: designation(result, [{ set: R1, use: 'context', reason: 'just context' }]), corpus });
    expect(refused.problems.map((p) => p.code)).toEqual(['unsupported_proposition']);
    expect(refused.problems[0]?.detail).toContain('positive legal proposition');
    expect(refused.records).toEqual([]);
  });

  it('E2 — completeness: an undesignated set, a designation naming no set, and no designation at all are each refused by name', () => {
    const result = makeResult({ challenges: [{ id: 'C1', lens: 'l', statement: 's', verdict: 'CONFIRMED', evidence: [quote(HOST, UNIQUE_29A)], resolution: 'x', adjudicationEvidence: [quote(HOST, UNIQUE_29A)] }] });
    const partial = resolveEvidenceUse({ result, designation: designation(result, [support(result, R1)]), corpus });
    expect(partial.problems.map((p) => [p.code, p.set]).sort()).toEqual([
      ['undesignated_evidence', 'challenges[0] (C1).adjudicationEvidence'],
      ['undesignated_evidence', 'challenges[0] (C1).evidence'],
    ]);
    const stray = resolveEvidenceUse({ result: makeResult(), designation: designation(makeResult(), [support(makeResult(), R1), { set: 'reading.elements[9] (R9).evidence', use: 'support', items: [] }]), corpus });
    expect(stray.problems.map((p) => [p.code, p.set])).toEqual([['undesignated_evidence', 'reading.elements[9] (R9).evidence']]);
    const none = resolveEvidenceUse({ result: makeResult(), designation: null, corpus });
    expect(none.problems.map((p) => p.code)).toEqual(['undesignated_evidence']);
    expect(none.problems[0]?.detail).toContain('no evidence-use designation');
    expect(none.records).toEqual([]);
  });

  it('E2 — within a support set every quote is named, nested ones included, and a leftover is refused rather than treated as context', () => {
    const result = makeResult({ reading: [{ id: 'R1', statement: 's', evidence: [
      quote(HOST, UNIQUE_29A),
      { kind: 'amendment_chain', hops: [{ edgeId: 'EDGE-32013L0034-amendedBy-32026L0470', quote: quote(AMENDING, HEADER_AMENDING) }] },
    ] }] });
    // Naming only the first quote leaves the hop quote undesignated: refused, naming the path.
    const leftover = resolveEvidenceUse({ result, designation: designation(result, [{ set: R1, use: 'support', items: [{ item: 'evidence[0]', use: 'support' }] }]), corpus });
    expect(leftover.problems.map((p) => [p.code, p.set])).toEqual([['undesignated_evidence', R1]]);
    expect(leftover.problems[0]?.detail).toContain('evidence[1].hops[0].quote');
    expect(leftover.records).toEqual([]);
    // Naming it contextual, with a reason, completes the set; the record carries both halves.
    const complete = resolveEvidenceUse({ result, designation: designation(result, [{ set: R1, use: 'support', items: [
      { item: 'evidence[0]', use: 'support' },
      { item: 'evidence[1].hops[0].quote', use: 'context', reason: 'The amending act\'s title line, cited to identify the chain, not as operative text.' },
    ] }]), corpus });
    expect(complete.problems).toEqual([]);
    expect(complete.records[0]?.occurrences.map((o) => o.item)).toEqual(['evidence[0]']);
    expect(complete.records[0]?.contextual).toEqual([{ item: 'evidence[1].hops[0].quote', reason: 'The amending act\'s title line, cited to identify the chain, not as operative text.' }]);
    // A contextual item without a reason, and an item path the set does not carry, are each refused.
    const noReason = resolveEvidenceUse({ result, designation: designation(result, [{ set: R1, use: 'support', items: [{ item: 'evidence[0]', use: 'support' }, { item: 'evidence[1].hops[0].quote', use: 'context' }] }]), corpus });
    expect(noReason.problems.map((p) => p.code)).toEqual(['undesignated_evidence']);
    const unknown = resolveEvidenceUse({ result, designation: designation(result, [{ set: R1, use: 'support', items: [{ item: 'evidence[0]', use: 'support' }, { item: 'evidence[1].hops[0].quote', use: 'context', reason: 'r' }, { item: 'evidence[7]', use: 'support' }] }]), corpus });
    expect(unknown.problems.map((p) => p.code)).toEqual(['undesignated_evidence']);
    expect(unknown.problems[0]?.detail).toContain('evidence[7]');
    // A support set whose every item is contextual supports nothing.
    const hollow = resolveEvidenceUse({ result, designation: designation(result, [{ set: R1, use: 'support', items: [{ item: 'evidence[0]', use: 'context', reason: 'a' }, { item: 'evidence[1].hops[0].quote', use: 'context', reason: 'b' }] }]), corpus });
    expect(hollow.problems.map((p) => p.code)).toEqual(['unsupported_proposition']);
  });

  it('E10 — duplicate declarations are contradictory, never last-wins: a set declared twice, an item declared twice', () => {
    const result = makeResult();
    const twiceSet = resolveEvidenceUse({ result, designation: designation(result, [support(result, R1), { set: R1, use: 'context', reason: 'r' }]), corpus });
    expect(twiceSet.problems.map((p) => [p.code, p.set])).toEqual([['undesignated_evidence', R1]]);
    expect(twiceSet.problems[0]?.detail).toContain('more than once');
    expect(twiceSet.records).toEqual([]);
    const twiceItem = resolveEvidenceUse({ result, designation: designation(result, [{ set: R1, use: 'support', items: [{ item: 'evidence[0]', use: 'support' }, { item: 'evidence[0]', use: 'context', reason: 'r' }] }]), corpus });
    expect(twiceItem.problems.map((p) => [p.code, p.set])).toEqual([['undesignated_evidence', R1]]);
    expect(twiceItem.problems[0]?.detail).toContain('more than once');
    expect(twiceItem.records).toEqual([]);
  });

  it('E3 — a designation made for one result does not apply to another, however similar', () => {
    const result = makeResult();
    const other = makeResult({ reading: [{ id: 'R1', statement: 'A different statement, same evidence.', evidence: [quote(HOST, UNIQUE_29A)] }] });
    const bound = designation(result, [support(result, R1)]);
    expect(resolveEvidenceUse({ result, designation: bound, corpus }).problems).toEqual([]);
    const applied = resolveEvidenceUse({ result: other, designation: bound, corpus });
    expect(applied.problems.map((p) => p.code)).toEqual(['undesignated_evidence']);
    expect(applied.problems[0]?.detail).toContain(resultSha256(other).slice(0, 12));
    expect(applied.problems[0]?.detail).toContain(resultSha256(result).slice(0, 12));
    expect(applied.records).toEqual([]);
    // The schema refuses a designation that does not say which result it is for.
    expect(evidenceUseDesignationSchema.safeParse({ sets: [] }).success).toBe(false);
  });
});

describe('occurrence selection over the actual declarations', () => {
  it('E4 — the threshold sentence is eligible in Article 1 and Article 29a, so it is refused until the reviewer selects', () => {
    const result = makeResult({ reading: [{ id: 'R1', statement: 's', evidence: [quote(HOST, THRESHOLD)] }] });
    const ambiguous = resolveEvidenceUse({ result, designation: designation(result, [support(result, R1)]), corpus });
    expect(ambiguous.problems.map((p) => p.code)).toEqual(['unsupported_proposition']);
    const candidates = ambiguous.problems[0]?.candidates ?? [];
    expect(candidates.map((c) => [c.range.id, c.line])).toEqual([['art-1', 169], ['art-29a', 2309]]);
    expect(ambiguous.problems[0]?.detail).toContain('select');
    expect(candidates.map((c) => c.offset)).toEqual([4170, 116298]);
    // An explicit selection of either candidate, by its stored offset, is accepted and recorded exactly.
    for (const [rangeId, offset, line] of [['art-29a', 116298, 2309], ['art-1', 4170, 169]] as const) {
      const chosen = resolveEvidenceUse({ result, designation: designation(result, [support(result, R1, { 'evidence[0]': { docId: HOST, rangeId, offset } })]), corpus });
      expect(chosen.problems, rangeId).toEqual([]);
      const [occ] = chosen.records[0]!.occurrences;
      expect(occ).toMatchObject({ offset, line });
      expect(occ?.range.id).toBe(rangeId);
      expect(corpus.normalizedText(HOST).slice(occ!.offset, occ!.offset + occ!.length)).toBe(THRESHOLD);
    }
    // The occurrence in Article 19a (offset 59920) is genuine but lies in no declared range: not selectable.
    const outside = resolveEvidenceUse({ result, designation: designation(result, [support(result, R1, { 'evidence[0]': { docId: HOST, rangeId: 'art-29a', offset: 59920 } })]), corpus });
    expect(outside.problems.map((p) => p.code)).toEqual(['unsupported_proposition']);
    expect(outside.problems[0]?.detail).toContain('59920');
  });

  it('E5 — a heading-only quote and the title line are located but never inside a range', () => {
    for (const text of ['Article 29a\n\nConsolidated sustainability reporting', HEADER_HOST]) {
      const result = makeResult({ reading: [{ id: 'R1', statement: 's', evidence: [quote(HOST, text)] }] });
      const refused = resolveEvidenceUse({ result, designation: designation(result, [support(result, R1)]), corpus });
      expect(refused.problems.map((p) => p.code), text).toEqual(['unsupported_proposition']);
      expect(refused.problems[0]?.detail, text).toContain('no occurrence');
      expect(refused.problems[0]?.candidates ?? []).toEqual([]);
    }
  });

  it('E6 — a quote crossing the end of Article 29a into the chapter heading is outside both, whatever else is declared', () => {
    const text = corpus.normalizedText(HOST);
    const ranges = resolveRanges(text, corpus.document(HOST).operativeRanges ?? []);
    if (!ranges.ok) throw new Error(ranges.problems.join('; '));
    const art29a = ranges.ranges.find((r) => r.id === 'art-29a')!;
    // The last 80 characters of the body, then across the boundary into the heading.
    const crossing = text.slice(art29a.bodyEnd - 80, art29a.bodyEnd + 30);
    expect(crossing).toContain('CHAPTER 6a');
    const result = makeResult({ reading: [{ id: 'R1', statement: 's', evidence: [quote(HOST, crossing)] }] });
    const refused = resolveEvidenceUse({ result, designation: designation(result, [support(result, R1)]), corpus });
    expect(refused.problems.map((p) => p.code)).toEqual(['unsupported_proposition']);
    // Positive control: the same tail, stopping inside the body, is supported.
    const inside = text.slice(art29a.bodyEnd - 80, art29a.bodyEnd - 2).trim();
    const okResult = makeResult({ reading: [{ id: 'R1', statement: 's', evidence: [quote(HOST, inside)] }] });
    expect(resolveEvidenceUse({ result: okResult, designation: designation(okResult, [support(okResult, R1)]), corpus }).problems).toEqual([]);
  });

  it('E7 — a discriminating quote is selected without a reviewer choice, and the record names the exact occurrence', () => {
    const result = makeResult();
    const resolved = resolveEvidenceUse({ result, designation: designation(result, [support(result, R1)]), corpus });
    expect(resolved.problems).toEqual([]);
    const [record] = resolved.records;
    expect(record?.occurrences).toHaveLength(1);
    const occ = record!.occurrences[0]!;
    expect(occ).toMatchObject({ item: 'evidence[0]', docId: HOST, sha256Normalized: hashOf(HOST), line: 2311 });
    expect(occ.range).toMatchObject({ id: 'art-29a', start: ['Article 29a', 'Consolidated sustainability reporting'] });
    expect(corpus.normalizedText(HOST).slice(occ.offset, occ.offset + occ.length)).toBe(UNIQUE_29A);
    expect(verifyEvidenceUse(resolved.records, result, corpus)).toEqual([]);
  });

  it('E9 — a document declaring no range cannot support; in a mixed set the other quote is designated contextual explicitly, never left over', () => {
    const undeclaredOnly = makeResult({ reading: [{ id: 'R1', statement: 's', evidence: [quote(UNDECLARED, 'Article 19a')] }] });
    const refused = resolveEvidenceUse({ result: undeclaredOnly, designation: designation(undeclaredOnly, [support(undeclaredOnly, R1)]), corpus });
    expect(refused.problems.map((p) => p.code)).toEqual(['unsupported_proposition']);
    expect(refused.problems[0]?.detail).toContain(`${UNDECLARED} declares no operative range`);
    const mixed = makeResult({ reading: [{ id: 'R1', statement: 's', evidence: [quote(UNDECLARED, 'Article 19a'), quote(AMENDING, UNIQUE_PT5)] }] });
    // Both named support: the undeclared document's quote cannot support, and nothing demotes it to context on its own.
    const bothSupport = resolveEvidenceUse({ result: mixed, designation: designation(mixed, [support(mixed, R1)]), corpus });
    expect(bothSupport.problems.map((p) => p.code)).toEqual(['unsupported_proposition']);
    expect(bothSupport.problems[0]?.detail).toContain('evidence[0]');
    expect(bothSupport.records).toEqual([]);
    // The reviewer designates it contextual, with a reason: the set is supported by the other quote and records both halves.
    const explicit = resolveEvidenceUse({ result: mixed, designation: designation(mixed, [{ set: R1, use: 'support', items: [
      { item: 'evidence[0]', use: 'context', reason: 'Names the CSRD article the reading refers to; the operative text is in the amending point.' },
      { item: 'evidence[1]', use: 'support' },
    ] }]), corpus });
    expect(explicit.problems).toEqual([]);
    expect(explicit.records[0]?.occurrences.map((o) => [o.item, o.docId, o.range.id])).toEqual([['evidence[1]', AMENDING, 'art-2-pt-5']]);
    expect(explicit.records[0]?.contextual.map((c) => c.item)).toEqual(['evidence[0]']);
    expect(verifyEvidenceUse(explicit.records, mixed, corpus)).toEqual([]);
  });

  it('E11 — two copies of a phrase in one item, range and line are told apart only by stored offset, and the selected one is the one recorded', () => {
    // A synthetic document: the phrase twice on one body line, inside one declared range.
    const text = ['Article 1', '', 'Scope', '', 'The test applies. The test applies. Nothing else.', '', 'Article 2', '', 'Definitions', '', 'Terms.'].join('\n');
    const sha = sha256Hex(text);
    const synthetic = {
      document: (docId: string) => {
        if (docId !== 'DOC-SYN') throw new Error(`no ${docId}`);
        return { sha256Normalized: sha, operativeRanges: [{ id: 'a1', start: ['Article 1', 'Scope'] as [string, string], end: ['Article 2', 'Definitions'] as [string, string], justification: 't' }] };
      },
      normalizedText: (docId: string) => {
        if (docId !== 'DOC-SYN') throw new Error(`no ${docId}`);
        return text;
      },
    };
    const result = makeResult({ reading: [{ id: 'R1', statement: 's', evidence: [{ kind: 'quote', docId: 'DOC-SYN', sha256Normalized: sha, text: 'The test applies.' }] }] });
    const first = text.indexOf('The test applies.');
    const second = text.indexOf('The test applies.', first + 1);
    expect(second).toBeGreaterThan(first);
    // Ambiguous without a selection: both candidates, same range, same line, different offsets.
    const ambiguous = resolveEvidenceUse({ result, designation: designation(result, [support(result, R1)]), corpus: synthetic });
    expect(ambiguous.problems.map((p) => p.code)).toEqual(['unsupported_proposition']);
    expect(ambiguous.problems[0]?.candidates?.map((c) => [c.range.id, c.line, c.offset])).toEqual([['a1', 5, first], ['a1', 5, second]]);
    // Selecting the second by offset records exactly that offset.
    const chosen = resolveEvidenceUse({ result, designation: designation(result, [support(result, R1, { 'evidence[0]': { docId: 'DOC-SYN', rangeId: 'a1', offset: second } })]), corpus: synthetic });
    expect(chosen.problems).toEqual([]);
    expect(chosen.records[0]?.occurrences[0]).toMatchObject({ item: 'evidence[0]', docId: 'DOC-SYN', offset: second, length: 'The test applies.'.length, line: 5 });
    expect(chosen.records[0]?.occurrences[0]?.offset).not.toBe(first);
    expect(verifyEvidenceUse(chosen.records, result, synthetic)).toEqual([]);
    // A selector that matches no candidate is refused, with both candidates listed by offset.
    const wrong = resolveEvidenceUse({ result, designation: designation(result, [support(result, R1, { 'evidence[0]': { docId: 'DOC-SYN', rangeId: 'a1', offset: second + 1 } })]), corpus: synthetic });
    expect(wrong.problems.map((p) => p.code)).toEqual(['unsupported_proposition']);
    expect(wrong.problems[0]?.detail).toContain(`offset ${first}`);
    expect(wrong.problems[0]?.detail).toContain(`offset ${second}`);
  });
});

describe('verifyEvidenceUse — the entry is re-verified, never trusted', () => {
  const result = makeResult();
  const good = () => resolveEvidenceUse({ result, designation: designation(result, [support(result, R1)]), corpus }).records;

  it('E8 — a shifted offset, a wrong range, a wrong item, a wrong hash, a missing record and a stray record are each named', () => {
    const base = good();
    const occ = base[0]!.occurrences[0]!;
    const tampered = (patch: Partial<typeof occ>) => [{ ...base[0]!, occurrences: [{ ...occ, ...patch }] }];
    expect(verifyEvidenceUse(tampered({ offset: occ.offset + 1 }), result, corpus).join('\n')).toContain('is not an occurrence of');
    expect(verifyEvidenceUse(tampered({ range: { ...occ.range, id: 'art-1' } }), result, corpus).join('\n')).toContain('art-1');
    expect(verifyEvidenceUse(tampered({ item: 'evidence[1]' }), result, corpus).join('\n')).toContain('evidence[1]');
    expect(verifyEvidenceUse(tampered({ sha256Normalized: 'f'.repeat(64) }), result, corpus).join('\n')).toContain('hash');
    expect(verifyEvidenceUse([], result, corpus).join('\n')).toContain(R1);
    expect(verifyEvidenceUse([...base, { set: 'challenges[0] (C9).evidence', use: 'context', reason: 'r', occurrences: [], contextual: [] }], result, corpus).join('\n')).toContain('C9');
    expect(verifyEvidenceUse([{ ...base[0]!, use: 'context', reason: 'r', occurrences: [], contextual: [] }], result, corpus).join('\n')).toContain('positive legal proposition');
    expect(verifyEvidenceUse([{ ...base[0]!, occurrences: [] }], result, corpus).join('\n')).toContain('no occurrence');
    // The partition is verified too: a quote neither supporting nor contextual, and a contextual entry naming no quote.
    const mixed = makeResult({ reading: [{ id: 'R1', statement: 's', evidence: [quote(HOST, UNIQUE_29A), quote(HOST, HEADER_HOST)] }] });
    const partial = [{ set: R1, use: 'support' as const, occurrences: base[0]!.occurrences, contextual: [] }];
    expect(verifyEvidenceUse(partial, mixed, corpus).join('\n')).toContain('evidence[1]');
    const stray = [{ ...base[0]!, contextual: [{ item: 'evidence[9]', reason: 'r' }] }];
    expect(verifyEvidenceUse(stray, result, corpus).join('\n')).toContain('evidence[9]');
    // Positive control.
    expect(verifyEvidenceUse(base, result, corpus)).toEqual([]);
  });

  it('E8 — a range withdrawn from the current declarations fails verification even though the text is unchanged', () => {
    const base = good();
    const withdrawn = {
      ...corpus,
      document: (docId: string) => (docId === HOST ? { ...corpus.document(HOST), operativeRanges: (corpus.document(HOST).operativeRanges ?? []).filter((r) => r.id !== 'art-29a') } : corpus.document(docId)),
    };
    expect(verifyEvidenceUse(base, result, withdrawn).join('\n')).toContain('no longer declares');
    // And an unrelated range added does not disturb an explicit, still-valid selection.
    const widened = {
      ...corpus,
      document: (docId: string) => (docId === HOST ? { ...corpus.document(HOST), operativeRanges: [...(corpus.document(HOST).operativeRanges ?? []), { id: 'art-19a', start: ['Article 19a', 'Sustainability reporting'] as [string, string], end: ['Article 19b', 'Sustainability reporting standards'] as [string, string], justification: 'x' }] } : corpus.document(docId)),
    };
    expect(verifyEvidenceUse(base, result, widened)).toEqual([]);
  });
});
