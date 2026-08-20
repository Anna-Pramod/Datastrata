/**
 * Corpus index validation.
 *
 * Split in two, matching src/monitoring/register.ts: `parseCorpusIndex` checks
 * what a single row can answer for itself, `verifyCorpusIntegrity` checks what
 * needs the whole index. Cycle detection collapses `amends` and `amendedBy`
 * into one directed relation first, because stating the same fact from both
 * ends is documentation, not a loop.
 */

import { z } from 'zod';
import type { KnowledgePack } from '../types';
import type { CorpusIndex } from './types';
import { CONTENT_SELECTOR_PATTERN } from './normalize';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be an ISO date (YYYY-MM-DD)');
const docId = z.string().regex(/^DOC-[A-Za-z0-9._-]+$/, 'document id must be DOC-*');
const sha256 = z.string().regex(/^[0-9a-f]{64}$/, 'must be a lowercase hex sha-256');
/** null means extraction ran over the whole raw document, not a selected region. */
const contentSelector = z
  .string()
  .regex(CONTENT_SELECTOR_PATTERN, 'content selector must be a bare "#id"')
  .nullable();

const edgeProvenance = z
  .object({
    type: z.enum(['eli_metadata', 'celex_metadata', 'human']),
    source: z.string().min(1),
    recordedOn: isoDate,
  })
  .strict();

const corpusEdge = z
  .object({
    edgeId: z.string().min(1),
    kind: z.enum(['amends', 'amendedBy', 'consolidates', 'references', 'definesTermsFor']),
    from: docId,
    to: docId,
    provenance: edgeProvenance,
  })
  .strict();

const corpusDocument = z
  .object({
    docId,
    serves: z.array(z.string().regex(/^SRC-\d{3}$/, 'serves entries must be SRC-NNN')),
    title: z.string().min(1),
    url: z.string().url(),
    versionLabel: z.string().min(1),
    retrievedOn: isoDate,
    rawPath: z.string().min(1),
    normalizedPath: z.string().min(1),
    sha256Raw: sha256,
    sha256Normalized: sha256,
    normalizerVersion: z.string().min(1),
    contentSelector,
    edges: z.array(corpusEdge),
  })
  .strict()
  .superRefine((d, ctx) => {
    for (const e of d.edges) {
      if (e.from !== d.docId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${e.edgeId}: edge from ${e.from} is carried by ${d.docId}`,
        });
      }
      if (e.from === e.to) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${e.edgeId}: edge points at itself` });
      }
    }
  });

const corpusIndex = z
  .object({
    updated: isoDate,
    documents: z.array(corpusDocument),
  })
  .strict();

/**
 * types.ts and this schema describe the same record twice, and nothing else
 * ties them together: `parseCorpusIndex` used to cast its result, so a field
 * added to one and not the other was invisible. These two assertions make each
 * type assignable to the other, so any drift is a compile error rather than a
 * silent divergence. Compile-time only — they emit nothing.
 */
type Assignable<A extends B, B> = A;
type _SchemaCoversType = Assignable<z.infer<typeof corpusIndex>, CorpusIndex>;
type _TypeCoversSchema = Assignable<CorpusIndex, z.infer<typeof corpusIndex>>;
export type { _SchemaCoversType, _TypeCoversSchema };

export class CorpusIntegrityError extends Error {
  constructor(public problems: string[]) {
    super(`Corpus index failed integrity checks:\n - ${problems.join('\n - ')}`);
    this.name = 'CorpusIntegrityError';
  }
}

/** Structural validation plus checks a single row can answer alone. */
export function parseCorpusIndex(raw: unknown): CorpusIndex {
  return corpusIndex.parse(raw);
}

/**
 * Collapse the amendment relation into one direction so that "A amendedBy B"
 * and "B amends A" produce the identical pair, then look for a real loop.
 */
function amendmentPairs(index: CorpusIndex): Set<string> {
  const pairs = new Set<string>();
  for (const d of index.documents) {
    for (const e of d.edges) {
      // Normalised as "amender -> amended".
      if (e.kind === 'amends') pairs.add(`${e.from}->${e.to}`);
      if (e.kind === 'amendedBy') pairs.add(`${e.to}->${e.from}`);
    }
  }
  return pairs;
}

function hasCycle(pairs: Set<string>): boolean {
  const out = new Map<string, string[]>();
  for (const p of pairs) {
    const [from, to] = p.split('->');
    if (from === undefined || to === undefined) continue;
    const list = out.get(from) ?? [];
    list.push(to);
    out.set(from, list);
  }

  const WHITE = 0;
  const GREY = 1;
  const BLACK = 2;
  const colour = new Map<string, number>();

  const visit = (node: string): boolean => {
    if (colour.get(node) === GREY) return true;
    if (colour.get(node) === BLACK) return false;
    colour.set(node, GREY);
    for (const next of out.get(node) ?? []) {
      if (visit(next)) return true;
    }
    colour.set(node, BLACK);
    return false;
  };

  for (const node of out.keys()) {
    if ((colour.get(node) ?? WHITE) === WHITE && visit(node)) return true;
  }
  return false;
}

/** Cross-row checks: identity, resolution, uniqueness, acyclicity. */
export function verifyCorpusIntegrity(index: CorpusIndex): void {
  const problems: string[] = [];

  const docIds = new Set<string>();
  const edgeIds = new Set<string>();
  const paths = new Set<string>();

  for (const d of index.documents) {
    if (docIds.has(d.docId)) problems.push(`${d.docId}: duplicate document id`);
    docIds.add(d.docId);

    for (const p of [d.rawPath, d.normalizedPath]) {
      if (paths.has(p)) problems.push(`${d.docId}: path ${p} is already used by another document`);
      paths.add(p);
    }

    for (const e of d.edges) {
      if (edgeIds.has(e.edgeId)) problems.push(`${e.edgeId}: duplicate edge id`);
      edgeIds.add(e.edgeId);
    }
  }

  for (const d of index.documents) {
    for (const e of d.edges) {
      if (!docIds.has(e.to)) problems.push(`${e.edgeId}: points at unknown document ${e.to}`);
    }
  }

  if (hasCycle(amendmentPairs(index))) {
    problems.push('amendment graph contains a cycle: an instrument cannot transitively amend itself');
  }

  if (problems.length > 0) throw new CorpusIntegrityError(problems);
}

/**
 * Cross-validate `serves` against a pack's citation record. Separate from
 * `verifyCorpusIntegrity` — and from `loadCorpus` — because the corpus is
 * meaningful on its own and must not acquire pack knowledge; only this check
 * needs a pack. Same split as `verifyCitationCoverage` in
 * src/monitoring/register.ts.
 *
 * A document serving an SRC id the pack does not carry is not a harmless typo:
 * `docsForSources` resolves entry documents by exactly that field, so the
 * document simply never appears in any closure, and the requirement it was
 * ingested for reads as having no text behind it.
 */
export function verifyCorpusServesCoverage(index: CorpusIndex, pack: KnowledgePack): void {
  const known = new Set(pack.sources.map((s) => s.id));
  const problems: string[] = [];
  for (const d of index.documents) {
    for (const s of d.serves) {
      if (!known.has(s)) {
        problems.push(`${d.docId}: serves ${s}, which pack ${pack.id} does not carry as a source`);
      }
    }
  }
  if (problems.length > 0) throw new CorpusIntegrityError(problems);
}
