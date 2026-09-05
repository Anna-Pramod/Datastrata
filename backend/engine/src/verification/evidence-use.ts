/**
 * Evidence use — what each evidence set is *for*, and where its support lies.
 *
 * `checkEvidenceSet` proves that a quote's words occur somewhere in a pinned
 * document. That is existence, and a signature over a positive legal
 * proposition needs more than existence: the first case's threshold sentence
 * occurs four times in the consolidated Accounting Directive, once inside
 * Article 29a and three times elsewhere, and a checker that accepts any
 * occurrence cannot say which one a signature rests on. This module is the
 * signing-side answer, in three parts.
 *
 * **A designation, authored by the reviewer and bound to the result.** Every
 * evidence set the record carries — a reading element's, a challenge's, an
 * adjudication's, enumerated by `evidenceSetsOf` and never re-listed here —
 * is designated. A *contextual set* carries one reason and covers all its
 * contents: a challenge may legitimately quote a header to show a
 * miscitation, and that quote stays verifiable. A *support set* names every
 * quote in it — nested hop, from and to quotes included — and each is either
 * a supporter or contextual with its own reason; a quote left unnamed is a
 * refusal, never context by default, and a set or item declared twice is a
 * contradiction, never last-wins. Nothing infers a use from who produced the
 * evidence, from its position, or from its having gone unselected. A reading
 * element is a positive legal proposition and may not be a contextual set.
 * The designation names the `resultSha256` it was made against, so it cannot
 * drift onto a similar record.
 *
 * **Resolution: candidates, and a selection.** Each supporting quote is
 * located in its document (`locateQuote`), and each occurrence lying wholly
 * inside a currently declared operative range is a candidate. One candidate
 * is taken without a reviewer's choice. More than one is ambiguity — two
 * copies of a phrase can share an item, a document, a range and a line — and
 * the reviewer selects by the occurrence's stored offset, which identifies
 * exactly one, or chooses a more discriminating quote; nothing infers the
 * reader's intended provision, and the record carries the occurrence the
 * reviewer selected and no other. None is a refusal naming why: the document
 * declares no range, or every occurrence lies outside or across one.
 *
 * **Verification: the entry is re-verified, never trusted.** The record a
 * signature carries is checked against the result and the corpus as they
 * stand — completeness (every set, every reading element supported),
 * provenance (the selected occurrence belongs to the cited item, its
 * document and its hash) and containment (the occurrence is exactly there in
 * the stored text and lies inside the named range as currently declared, with
 * the same anchors). Those three are the whole of what the machine
 * establishes. Whether the words support the proposition is the reviewer's
 * judgement, and no positional test proves it.
 *
 * Pure: the corpus is consulted through an accessor the caller holds, and
 * nothing here opens a file.
 */

import { z } from 'zod';
import type { EvidenceItem, QuoteEvidence } from '../corpus/evidence';
import { contains, locateQuote, resolveRanges, type OperativeRange, type ResolvedRange } from '../corpus/ranges';
import { evidenceSetsOf, type EvidenceSet } from './evidence-sets';
import { resultSha256, type VerificationResult } from './result';

/** A quote inside a set, addressed by a path the reviewer and the record both use. */
export interface AddressedQuote {
  /** `evidence[0]`, `evidence[2].hops[1].quote`, `evidence[3].from`, `evidence[3].to`. */
  path: string;
  quote: QuoteEvidence;
}

/** Every quote in a set, nested ones included, in record order. Absence claims carry none. */
export function quotesOf(items: readonly EvidenceItem[]): AddressedQuote[] {
  const out: AddressedQuote[] = [];
  items.forEach((item, i) => {
    const at = `evidence[${i}]`;
    switch (item.kind) {
      case 'quote':
        out.push({ path: at, quote: item });
        break;
      case 'amendment_chain':
        item.hops.forEach((hop, h) => out.push({ path: `${at}.hops[${h}].quote`, quote: hop.quote }));
        break;
      case 'cross_reference':
        out.push({ path: `${at}.from`, quote: item.from }, { path: `${at}.to`, quote: item.to });
        break;
      case 'absence':
        break;
    }
  });
  return out;
}

/**
 * The reviewer's selection of one occurrence: the document, the range and the
 * stored-text offset. The offset is the discriminator — a line or a range can
 * hold two copies of a phrase — and it is verified against the candidates,
 * never trusted.
 */
const selectionSchema = z
  .object({
    docId: z.string(),
    rangeId: z.string(),
    offset: z.number().int().min(0),
  })
  .strict();

/** One quote inside a support set, designated by the reviewer. */
const itemDesignationSchema = z
  .object({
    /** The quote's path within the set: `evidence[0]`, `evidence[2].hops[1].quote`, … */
    item: z.string(),
    use: z.enum(['support', 'context']),
    /** Required when `use` is `context`. */
    reason: z.string().optional(),
    /** For a supporter, needed only when more than one occurrence is eligible. */
    selection: selectionSchema.optional(),
  })
  .strict();

/**
 * The designation file, as the reviewer writes it beside the result
 * (`docs/evidence-use.md` shows the format with a worked example).
 *
 * `resultSha256` is required: a designation that does not say which result it
 * was made for cannot be bound to one. A contextual set carries `reason` and
 * no `items`; a support set carries `items` naming every quote in it.
 */
export const evidenceUseDesignationSchema = z
  .object({
    resultSha256: z.string(),
    sets: z.array(
      z
        .object({
          set: z.string(),
          use: z.enum(['support', 'context']),
          reason: z.string().optional(),
          items: z.array(itemDesignationSchema).optional(),
        })
        .strict(),
    ),
  })
  .strict();

export type EvidenceUseDesignation = z.infer<typeof evidenceUseDesignationSchema>;

/**
 * One selected occurrence, as the signing entry records it.
 *
 * The range's anchors are recorded beside its id so that freshness can ask
 * "is this exact range still declared?" rather than "is a range with this
 * name still declared?". Anchors are plain string arrays here, not tuples:
 * the ledger schema is walked by the field-accounting guard, which knows
 * arrays and refuses node kinds it does not know.
 */
export const recordedOccurrenceSchema = z
  .object({
    item: z.string(),
    docId: z.string(),
    sha256Normalized: z.string(),
    range: z.object({ id: z.string(), start: z.array(z.string()), end: z.array(z.string()) }).strict(),
    offset: z.number().int().min(0),
    length: z.number().int().min(1),
    line: z.number().int().min(1),
  })
  .strict();

/**
 * One evidence set's designation and, for a support set, the partition of its
 * quotes: `occurrences` are the supporters with the occurrence relied upon,
 * `contextual` the quotes the reviewer designated contextual, each with its
 * reason. Together they name every quote in the set exactly once; a
 * contextual set carries `reason` and both arrays empty.
 */
export const evidenceUseRecordSchema = z
  .object({
    set: z.string(),
    use: z.enum(['support', 'context']),
    reason: z.string().optional(),
    occurrences: z.array(recordedOccurrenceSchema),
    contextual: z.array(z.object({ item: z.string(), reason: z.string() }).strict()),
  })
  .strict();

export type RecordedOccurrence = z.infer<typeof recordedOccurrenceSchema>;
export type EvidenceUseRecord = z.infer<typeof evidenceUseRecordSchema>;

/** A located occurrence inside a declared range — what the reviewer chooses among. */
export interface Candidate {
  item: string;
  docId: string;
  range: ResolvedRange;
  offset: number;
  length: number;
  line: number;
}

export interface EvidenceUseProblem {
  code: 'undesignated_evidence' | 'unsupported_proposition';
  /** The set concerned, or `'*'` when the problem is the designation as a whole. */
  set: string;
  detail: string;
  candidates?: Candidate[];
}

export interface ResolvedEvidenceUse {
  records: EvidenceUseRecord[];
  problems: EvidenceUseProblem[];
}

/** The corpus, reduced to what evidence use asks of it. `LoadedCorpus` satisfies it. */
export interface EvidenceUseCorpus {
  document(docId: string): { sha256Normalized: string; operativeRanges?: readonly OperativeRange[] };
  normalizedText(docId: string): string;
}

export interface ResolveEvidenceUseInput {
  result: VerificationResult;
  designation: EvidenceUseDesignation | null;
  corpus: EvidenceUseCorpus;
}

/** A reading element is a positive legal proposition; nothing else in the record is one by construction. */
function isPositiveProposition(set: EvidenceSet): boolean {
  return set.path === 'reading.elements[].evidence';
}

function shortHash(hash: string): string {
  return `${hash.slice(0, 12)}…`;
}

/** One candidate, as a refusal line or a review line reads it. */
export function describeCandidate(candidate: Candidate): string {
  return `${candidate.item} in ${candidate.docId} range ${candidate.range.id} at line ${candidate.line} (offset ${candidate.offset}, ${candidate.length} chars)`;
}

/**
 * Every candidate occurrence for one set, and why an item yielded none.
 *
 * `why` is kept per item so a refusal can say "the document declares no
 * range" rather than only "no candidate", which is the difference between
 * an authoring task and a quoting task for the signer.
 */
function candidatesFor(set: EvidenceSet, corpus: EvidenceUseCorpus): { candidates: Candidate[]; why: string[] } {
  const candidates: Candidate[] = [];
  const why: string[] = [];
  for (const { path, quote } of quotesOf(set.items)) {
    let document: ReturnType<EvidenceUseCorpus['document']>;
    let text: string;
    try {
      document = corpus.document(quote.docId);
      text = corpus.normalizedText(quote.docId);
    } catch {
      why.push(`${path}: ${quote.docId} is not in the corpus`);
      continue;
    }
    if (document.sha256Normalized !== quote.sha256Normalized) {
      why.push(`${path}: pins ${quote.docId} at a hash the corpus does not hold`);
      continue;
    }
    const declared = document.operativeRanges ?? [];
    if (declared.length === 0) {
      why.push(`${path}: ${quote.docId} declares no operative range, so nothing in it can be support`);
      continue;
    }
    const ranges = resolveRanges(text, declared);
    if (!ranges.ok) {
      why.push(`${path}: ${quote.docId}'s declared ranges do not resolve — ${ranges.problems.join('; ')}`);
      continue;
    }
    const located = locateQuote(text, quote.text);
    if (!located.ok) {
      why.push(`${path}: ${located.problem}`);
      continue;
    }
    let inside = 0;
    for (const occurrence of located.occurrences) {
      const range = ranges.ranges.find((r) => contains(r, occurrence));
      if (range === undefined) continue;
      inside += 1;
      candidates.push({ item: path, docId: quote.docId, range, ...occurrence });
    }
    if (inside === 0) {
      why.push(
        located.occurrences.length === 0
          ? `${path}: not found in ${quote.docId}`
          : `${path}: ${located.occurrences.length} occurrence(s) in ${quote.docId} at line(s) ${located.occurrences.map((o) => o.line).join(', ')}, none wholly inside a declared range`,
      );
    }
  }
  return { candidates, why };
}

function recordOf(candidate: Candidate): RecordedOccurrence {
  return {
    item: candidate.item,
    docId: candidate.docId,
    sha256Normalized: '',
    range: { id: candidate.range.id, start: [...candidate.range.start], end: [...candidate.range.end] },
    offset: candidate.offset,
    length: candidate.length,
    line: candidate.line,
  };
}

/**
 * Resolves the reviewer's designation over the result into the records a
 * signature carries, or the problems that stop it.
 *
 * Every problem is reported, never the first, and a problem carries the
 * candidates where there are any, so the signer can select from what was
 * found rather than guess.
 */
export function resolveEvidenceUse(input: ResolveEvidenceUseInput): ResolvedEvidenceUse {
  const { result, designation, corpus } = input;
  const problems: EvidenceUseProblem[] = [];
  const records: EvidenceUseRecord[] = [];
  const expected = resultSha256(result);

  if (designation === null) {
    return {
      records,
      problems: [{ code: 'undesignated_evidence', set: '*', detail: `no evidence-use designation for result ${shortHash(expected)}: every evidence set must be designated support or context before signing` }],
    };
  }
  if (designation.resultSha256 !== expected) {
    return {
      records,
      problems: [{ code: 'undesignated_evidence', set: '*', detail: `the evidence-use designation is bound to result ${shortHash(designation.resultSha256)}, but the result being signed hashes to ${shortHash(expected)}` }],
    };
  }

  const sets = evidenceSetsOf(result);
  const byPath = new Map(sets.map((set) => [set.recordPath, set]));
  const seenSets = new Map<string, number>();
  for (const declared of designation.sets) {
    seenSets.set(declared.set, (seenSets.get(declared.set) ?? 0) + 1);
    if (!byPath.has(declared.set)) {
      problems.push({ code: 'undesignated_evidence', set: declared.set, detail: `the designation names ${declared.set}, which is not an evidence set of this result` });
    }
  }
  // A set declared twice is a contradiction, whatever the two declarations
  // say; it is refused rather than resolved by whichever came last.
  const duplicated = new Set([...seenSets].filter(([, n]) => n > 1).map(([set]) => set));
  for (const set of duplicated) {
    problems.push({ code: 'undesignated_evidence', set, detail: `${set} is designated more than once; one set has one designation` });
  }
  const designated = new Map(designation.sets.filter((d) => !duplicated.has(d.set)).map((d) => [d.set, d]));

  for (const set of sets) {
    if (duplicated.has(set.recordPath)) continue;
    const d = designated.get(set.recordPath);
    if (d === undefined) {
      problems.push({ code: 'undesignated_evidence', set: set.recordPath, detail: `${set.label} is not designated: every evidence set is designated support or context, explicitly` });
      continue;
    }
    if (d.use === 'context') {
      if (isPositiveProposition(set)) {
        problems.push({ code: 'unsupported_proposition', set: set.recordPath, detail: `${set.label} is a positive legal proposition and cannot be designated contextual; it needs operative support` });
        continue;
      }
      if (d.reason === undefined || d.reason.trim().length === 0) {
        problems.push({ code: 'undesignated_evidence', set: set.recordPath, detail: `${set.label} is designated contextual without an explicit reason; context is a reviewer's decision, stated` });
        continue;
      }
      if (d.items !== undefined) {
        problems.push({ code: 'undesignated_evidence', set: set.recordPath, detail: `${set.label} is designated contextual and also carries item designations, which contradict it: a contextual set covers all its contents` });
        continue;
      }
      records.push({ set: set.recordPath, use: 'context', reason: d.reason, occurrences: [], contextual: [] });
      continue;
    }

    // A support set: every quote named exactly once, each a supporter or
    // contextual with its reason, and at least one supporter.
    const quotes = quotesOf(set.items);
    const paths = new Set(quotes.map((q) => q.path));
    const items = d.items ?? [];
    const named = new Map<string, number>();
    for (const item of items) named.set(item.item, (named.get(item.item) ?? 0) + 1);
    const setProblems: string[] = [];
    for (const [path, n] of named) {
      if (n > 1) setProblems.push(`${path} is designated more than once`);
      if (!paths.has(path)) setProblems.push(`${path} is not a quote in this set`);
    }
    for (const path of paths) {
      if (!named.has(path)) setProblems.push(`${path} is not designated: every quote in a support set is a supporter or contextual, explicitly`);
    }
    for (const item of items) {
      if (item.use === 'context' && (item.reason === undefined || item.reason.trim().length === 0)) {
        setProblems.push(`${item.item} is designated contextual without an explicit reason`);
      }
      if (item.use === 'support' && item.reason !== undefined) {
        setProblems.push(`${item.item} is a supporter and carries a reason, which only a contextual item has`);
      }
    }
    if (setProblems.length > 0) {
      problems.push({ code: 'undesignated_evidence', set: set.recordPath, detail: `${set.label}: ${setProblems.join('; ')}` });
      continue;
    }
    const supporters = items.filter((item) => item.use === 'support');
    if (supporters.length === 0) {
      problems.push({ code: 'unsupported_proposition', set: set.recordPath, detail: `${set.label}: every quote is designated contextual, so nothing supports the proposition` });
      continue;
    }

    const { candidates, why } = candidatesFor(set, corpus);
    const chosen: Candidate[] = [];
    let failed = false;
    for (const item of supporters) {
      const mine = candidates.filter((c) => c.item === item.item);
      const explain = () => (mine.length > 0 ? `candidates: ${mine.map(describeCandidate).join(' | ')}` : why.filter((w) => w.startsWith(`${item.item}:`)).join('; ') || 'no candidate');
      if (item.selection !== undefined) {
        const { docId, rangeId, offset } = item.selection;
        const matches = mine.filter((c) => c.docId === docId && c.range.id === rangeId && c.offset === offset);
        if (matches.length !== 1) {
          failed = true;
          problems.push({
            code: 'unsupported_proposition',
            set: set.recordPath,
            detail: `${set.label}: the selection for ${item.item} (${docId} range ${rangeId} offset ${offset}) matches ${matches.length} located occurrence(s) wholly inside that range; a selection must identify exactly one — ${explain()}`,
            candidates: mine,
          });
          break;
        }
        chosen.push(matches[0]!);
        continue;
      }
      if (mine.length === 1) {
        chosen.push(mine[0]!);
        continue;
      }
      failed = true;
      problems.push(
        mine.length === 0
          ? { code: 'unsupported_proposition', set: set.recordPath, detail: `${set.label}: no occurrence of ${item.item} lies wholly within a declared operative range — ${explain()}`, candidates: [] }
          : { code: 'unsupported_proposition', set: set.recordPath, detail: `${set.label}: ${mine.length} occurrences of ${item.item} lie inside declared ranges, so the one relied upon must be selected by its stored offset (docId, rangeId, offset): ${mine.map(describeCandidate).join(' | ')}`, candidates: mine },
      );
      break;
    }
    if (failed) continue;
    records.push({
      set: set.recordPath,
      use: 'support',
      occurrences: chosen.map((c) => ({ ...recordOf(c), sha256Normalized: corpus.document(c.docId).sha256Normalized })),
      contextual: items.filter((item) => item.use === 'context').map((item) => ({ item: item.item, reason: item.reason ?? '' })),
    });
  }

  return { records, problems };
}

/**
 * Re-verifies a signing entry's records against the result and the corpus as
 * they stand now. Returns every problem, or nothing.
 *
 * Independent of `resolveEvidenceUse` on purpose: a record is checked by what
 * it claims, not by how it was produced, so an entry edited after the fact,
 * or produced by a resolver with a defect, is refused on its own terms.
 */
export function verifyEvidenceUse(records: readonly EvidenceUseRecord[], result: VerificationResult, corpus: EvidenceUseCorpus): string[] {
  const problems: string[] = [];
  const sets = evidenceSetsOf(result);
  const byPath = new Map(sets.map((set) => [set.recordPath, set]));
  const recorded = new Map<string, EvidenceUseRecord>();

  for (const record of records) {
    if (recorded.has(record.set)) problems.push(`${record.set}: recorded more than once`);
    recorded.set(record.set, record);
    if (!byPath.has(record.set)) problems.push(`${record.set}: recorded, but is not an evidence set of this result`);
  }
  for (const set of sets) {
    const record = recorded.get(set.recordPath);
    if (record === undefined) {
      problems.push(`${set.label} (${set.recordPath}): no evidence-use record — every set must be designated support or context`);
      continue;
    }
    if (record.use === 'context') {
      if (isPositiveProposition(set)) problems.push(`${set.label}: a positive legal proposition is recorded as contextual`);
      if (record.reason === undefined || record.reason.trim().length === 0) problems.push(`${set.label}: contextual without a reason`);
      if (record.occurrences.length > 0 || record.contextual.length > 0) problems.push(`${set.label}: contextual as a set, yet records item designations`);
      continue;
    }
    if (record.occurrences.length === 0) {
      problems.push(`${set.label}: support with no occurrence relied upon`);
      continue;
    }
    const quotes = new Map(quotesOf(set.items).map((q) => [q.path, q.quote]));
    // The partition: every quote in the set is a supporter or contextual, exactly once.
    const covered = new Map<string, number>();
    for (const occurrence of record.occurrences) covered.set(occurrence.item, (covered.get(occurrence.item) ?? 0) + 1);
    for (const item of record.contextual) {
      covered.set(item.item, (covered.get(item.item) ?? 0) + 1);
      if (!quotes.has(item.item)) problems.push(`${set.label} ${item.item}: recorded as contextual, but names no quote in this set`);
      if (item.reason.trim().length === 0) problems.push(`${set.label} ${item.item}: contextual without a reason`);
    }
    for (const [path, n] of covered) if (n > 1) problems.push(`${set.label} ${path}: recorded more than once`);
    for (const path of quotes.keys()) {
      if (!covered.has(path)) problems.push(`${set.label} ${path}: neither a supporter nor contextual — every quote in a support set is designated`);
    }
    for (const occurrence of record.occurrences) {
      const at = `${set.label} ${occurrence.item}`;
      const quote = quotes.get(occurrence.item);
      if (quote === undefined) {
        problems.push(`${at}: names no quote in this set`);
        continue;
      }
      if (quote.docId !== occurrence.docId) {
        problems.push(`${at}: the quote is from ${quote.docId}, the occurrence claims ${occurrence.docId}`);
        continue;
      }
      let document: ReturnType<EvidenceUseCorpus['document']>;
      let text: string;
      try {
        document = corpus.document(occurrence.docId);
        text = corpus.normalizedText(occurrence.docId);
      } catch {
        problems.push(`${at}: ${occurrence.docId} is not in the corpus`);
        continue;
      }
      if (document.sha256Normalized !== occurrence.sha256Normalized || quote.sha256Normalized !== occurrence.sha256Normalized) {
        problems.push(`${at}: hash mismatch — the occurrence pins ${shortHash(occurrence.sha256Normalized)}, the corpus holds ${shortHash(document.sha256Normalized)}`);
        continue;
      }
      const declared = (document.operativeRanges ?? []).find((r) => r.id === occurrence.range.id);
      if (declared === undefined) {
        problems.push(`${at}: ${occurrence.docId} no longer declares range ${occurrence.range.id}`);
        continue;
      }
      const sameAnchors = declared.start.join('\n') === occurrence.range.start.join('\n') && declared.end.join('\n') === occurrence.range.end.join('\n');
      if (!sameAnchors) {
        problems.push(`${at}: ${occurrence.docId} declares range ${occurrence.range.id} with different anchors from the ones relied upon`);
        continue;
      }
      const resolved = resolveRanges(text, [declared]);
      if (!resolved.ok) {
        problems.push(`${at}: range ${occurrence.range.id} does not resolve — ${resolved.problems.join('; ')}`);
        continue;
      }
      const located = locateQuote(text, quote.text);
      if (!located.ok) {
        problems.push(`${at}: ${located.problem}`);
        continue;
      }
      const genuine = located.occurrences.some((o) => o.offset === occurrence.offset && o.length === occurrence.length && o.line === occurrence.line);
      if (!genuine) {
        problems.push(`${at}: offset ${occurrence.offset} (${occurrence.length} chars, line ${occurrence.line}) is not an occurrence of the quote in ${occurrence.docId}`);
        continue;
      }
      if (!contains(resolved.ranges[0]!, occurrence)) {
        problems.push(`${at}: the occurrence at line ${occurrence.line} is not wholly inside range ${occurrence.range.id}`);
      }
    }
  }
  return problems;
}
