/**
 * Temporal standing reaching the closure — the purpose-built world.
 *
 * The real corpus holds one edge and every served source is in force, so it
 * cannot show what this file proves: that direct citation admits an
 * adopted-not-effective document, that no expansion step — structural or
 * `references` — reaches one, that the rule is driven by the pack's standing
 * and not by which document it happens to be, and that absence of standing
 * fails closed at construction. Every closure below is stated as an exact set,
 * under both quantifiers, so a flip from "every served source in force" to
 * "any" moves a named row rather than passing unnoticed.
 *
 * Identifiers `SRC-91x` / `DOC-R*` are new; `SRC-901`/`SRC-902` are already
 * bound by the source-completeness world.
 */

import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { parseCorpusIndex, artefactAuthenticitySchema } from '../src/corpus/schema';
import { CLOSURE_POLICY_V0, CLOSURE_POLICY_V1, computeClosure, docsForSources } from '../src/corpus/closure';
import { MissingStandingError, pinnedStandingFor, standingMapFor } from '../src/corpus/standing';
import { EntitledClosure, operativeStatusClause, renderEntitledClosure, renderStanding } from '../src/pipeline/entitlement';
import { sourceRecordSchema } from '../src/knowledge/schema';

import {
  DIRECT,
  INFORCE,
  MIXED,
  STANDING,
  authorised,
  closureOf,
  worldIndex,
  worldPack,
  worldRegister,
} from './standing-world';

// ---------------------------------------------------------------------------
// T1–T5: entry versus expansion, through the production constructor
// ---------------------------------------------------------------------------

describe('standing-aware traversal — the purpose-built world', () => {
  it('T1 — expansion is refused into a document one of whose sources is adopted-not-effective', () => {
    expect(closureOf(MIXED).docIds).toEqual(['DOC-RM']);
  });

  it('T2 — direct citation admits the same document, and expands back along its structural edge', () => {
    // Both in one world, so a blanket exclusion of adopted documents cannot pass.
    expect(closureOf(DIRECT).docIds).toEqual(['DOC-RM', 'DOC-RN']);
  });

  it('T3 — the rule is driven by standing, not by which document it is', () => {
    const flipped = worldPack({ ...STANDING, 'SRC-912': 'in_force' });
    expect(closureOf(MIXED, worldIndex(), flipped).docIds).toEqual(['DOC-RM', 'DOC-RN']);
  });

  it('T4 — a multi-source document expands when every source it serves is in force', () => {
    expect(closureOf(INFORCE).docIds).toEqual(['DOC-RP', 'DOC-RQ']);
  });

  it('T5 — the references branch is gated too: DOC-RN is not reached along DOC-RQ’s reference edge', () => {
    const closure = closureOf(INFORCE);
    expect(closure.docIds).not.toContain('DOC-RN');
    // Positive control, failure mode 7: under the unconditional policy the
    // same edge does reach DOC-RN, and DOC-RM follows along DOC-RN's
    // structural edge — so the absence above is the gate, not the graph.
    expect(closureOf(INFORCE, worldIndex(), worldPack(), CLOSURE_POLICY_V0).docIds).toEqual([
      'DOC-RM', 'DOC-RN', 'DOC-RP', 'DOC-RQ',
    ]);
  });

  it('B17 — the expansion rule is behavioural: V0 reproduces the unconditional closures, V1 the gated ones', () => {
    const index = worldIndex();
    const standing = standingMapFor(index, worldPack());
    const under = (cites: string[], policy: typeof CLOSURE_POLICY_V0) =>
      computeClosure(index, docsForSources(index, cites), standing, policy).docIds;
    expect(under(MIXED, CLOSURE_POLICY_V0)).toEqual(['DOC-RM', 'DOC-RN']);
    expect(under(INFORCE, CLOSURE_POLICY_V0)).toEqual(['DOC-RM', 'DOC-RN', 'DOC-RP', 'DOC-RQ']);
    expect(under(DIRECT, CLOSURE_POLICY_V0)).toEqual(['DOC-RM', 'DOC-RN']);
    expect(under(MIXED, CLOSURE_POLICY_V1)).toEqual(['DOC-RM']);
    expect(under(INFORCE, CLOSURE_POLICY_V1)).toEqual(['DOC-RP', 'DOC-RQ']);
    expect(under(DIRECT, CLOSURE_POLICY_V1)).toEqual(['DOC-RM', 'DOC-RN']);
    // The two policies differ in exactly the field that names the rule.
    expect({ ...CLOSURE_POLICY_V0, expansion: CLOSURE_POLICY_V1.expansion }).toEqual(CLOSURE_POLICY_V1);
  });

  it('the production default is the gated policy', () => {
    expect(EntitledClosure.forSources(authorised(), worldRegister(), worldPack(), MIXED).policy).toEqual(CLOSURE_POLICY_V1);
  });
});

// ---------------------------------------------------------------------------
// B9: absence fails closed, over the declared field
// ---------------------------------------------------------------------------

describe('a served source with no temporal standing', () => {
  it('B9 — refuses at closure construction, naming the document and the source; the sibling with a standing succeeds', () => {
    const absent = worldPack({ ...STANDING, 'SRC-911': undefined });
    // The absence is of the *declared* field: the record went through the
    // production source schema and simply carries no `temporalStanding`.
    expect(absent.sources.find((s) => s.id === 'SRC-911')).not.toHaveProperty('temporalStanding');
    let thrown: unknown;
    try {
      closureOf(MIXED, worldIndex(), absent);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(MissingStandingError);
    expect((thrown as MissingStandingError).failures).toEqual([{ docId: 'DOC-RM', sourceId: 'SRC-911' }]);
    expect((thrown as Error).message).toContain('SRC-911');
    expect(closureOf(MIXED).docIds).toEqual(['DOC-RM']);
  });

  it('a misspelt standing key is refused by the source schema, not silently dropped into absence', () => {
    // zod strips unknown keys by default; the source record is `.strict()` so
    // that a typo is a load error naming the key rather than a fail-closed
    // refusal for the wrong reason two layers later.
    expect(() =>
      sourceRecordSchema.parse({
        id: 'SRC-911', title: 't', legalType: 'l', temporalStandng: 'in_force', usedFor: 'u', url: 'https://example.invalid/x',
      }),
    ).toThrow(/temporalStandng/);
    // And the retired free-text field is refused the same way.
    expect(() =>
      sourceRecordSchema.parse({
        id: 'SRC-911', title: 't', legalType: 'l', statusAtSnapshot: 'in force', usedFor: 'u', url: 'https://example.invalid/x',
      }),
    ).toThrow(/statusAtSnapshot/);
  });

  it('a neighbour with no standing is simply not reached; it is refused only if it becomes a member', () => {
    const index = worldIndex();
    const standing = standingMapFor(index, worldPack({ ...STANDING, 'SRC-913': undefined }));
    // DOC-RN is now ineligible for expansion (one source unknown), and no throw:
    // it never joins the closure.
    expect(computeClosure(index, docsForSources(index, MIXED), standing).docIds).toEqual(['DOC-RM']);
    // Cited directly, it is a member, and the refusal names the source.
    expect(() => computeClosure(index, docsForSources(index, DIRECT), standing)).toThrow(MissingStandingError);
    expect(() => computeClosure(index, docsForSources(index, DIRECT), standing)).toThrow(/SRC-913/);
    // No default is inferred anywhere: the map carries the absence as null.
    expect(standing.get('DOC-RN')).toEqual([
      { sourceId: 'SRC-912', temporalStanding: 'adopted_not_effective' },
      { sourceId: 'SRC-913', temporalStanding: null },
    ]);
    expect(() => pinnedStandingFor(standing, 'DOC-RN')).toThrow(MissingStandingError);
  });
});

// ---------------------------------------------------------------------------
// B2: the C-2 invariant — standing is committed by the closure hash
// ---------------------------------------------------------------------------

describe('the closure hash commits standing, authenticity and non-operative sections', () => {
  const baseline = closureOf(DIRECT).sha256;

  it('B2a — moves when a member’s artefact authenticity changes', () => {
    expect(closureOf(DIRECT, worldIndex({ 'DOC-RN': { artefactAuthenticity: 'official_pre_publication_text' } })).sha256).not.toBe(baseline);
  });

  it('B2b — moves when a member declares a non-operative section', () => {
    expect(closureOf(DIRECT, worldIndex({ 'DOC-RN': { nonOperativeSections: ['EXPLANATORY MEMORANDUM'] } })).sha256).not.toBe(baseline);
  });

  it('B2c — moves when a served source’s temporal standing changes', () => {
    expect(closureOf(DIRECT, worldIndex(), worldPack({ ...STANDING, 'SRC-913': 'superseded' })).sha256).not.toBe(baseline);
  });

  it('B2d — the order of declared sections is significant', () => {
    const ab = closureOf(DIRECT, worldIndex({ 'DOC-RN': { nonOperativeSections: ['A', 'B'] } })).sha256;
    const ba = closureOf(DIRECT, worldIndex({ 'DOC-RN': { nonOperativeSections: ['B', 'A'] } })).sha256;
    expect(ab).not.toBe(ba);
  });

  it('positive control — the hash is stable across two builds of one world, and blind to versionLabel', () => {
    expect(closureOf(DIRECT).sha256).toBe(baseline);
    expect(closureOf(DIRECT, worldIndex({ 'DOC-RN': { versionLabel: 'as published' } })).sha256).toBe(baseline);
  });
});

// ---------------------------------------------------------------------------
// Orthogonality and canonical form
// ---------------------------------------------------------------------------

describe('authenticity and standing are independent, and neither is read off the label', () => {
  it('two in-force documents with different authenticity project differently (standing does not determine authenticity)', () => {
    const closure = closureOf(INFORCE, worldIndex({ 'DOC-RP': { artefactAuthenticity: 'authentic_publication' } }));
    expect(closure.standingOf('DOC-RQ').artefactAuthenticity).toBe('official_consolidation');
    expect(closure.standingOf('DOC-RP').artefactAuthenticity).toBe('authentic_publication');
    expect(closure.standingOf('DOC-RQ').sources.map((s) => s.temporalStanding)).toEqual(['in_force']);
    expect(closure.standingOf('DOC-RP').sources.map((s) => s.temporalStanding)).toEqual(['in_force', 'in_force']);
  });

  it('a document labelled "as published" whose source is adopted projects adopted (standing is not inferred from versionLabel)', () => {
    const closure = closureOf(DIRECT, worldIndex({ 'DOC-RN': { versionLabel: 'as published' } }));
    expect(closure.standingOf('DOC-RN').sources).toEqual([
      { sourceId: 'SRC-912', temporalStanding: 'adopted_not_effective' },
      { sourceId: 'SRC-913', temporalStanding: 'in_force' },
    ]);
    expect(renderStanding(closure.standingOf('DOC-RN'))).toContain('adopted_not_effective');
  });

  it('B4g — one intended list has one spelling: undefined, null, blank, untrimmed and duplicate headings are refused; [] is accepted', () => {
    const base = worldIndex().documents[1]!;
    const withSections = (sections: unknown) =>
      parseCorpusIndex({ updated: '2026-09-05', documents: [{ ...base, edges: [], nonOperativeSections: sections }] });
    const missing = { ...base, edges: [] } as Record<string, unknown>;
    delete missing['nonOperativeSections'];
    expect(() => parseCorpusIndex({ updated: '2026-09-05', documents: [missing] })).toThrow(/nonOperativeSections/);
    expect(() => withSections(null)).toThrow(/nonOperativeSections/);
    expect(() => withSections([''])).toThrow(/non-empty and already trimmed/);
    expect(() => withSections([' ANNEX'])).toThrow(/non-empty and already trimmed/);
    expect(() => withSections(['ANNEX', 'ANNEX'])).toThrow(/declared more than once/);
    expect(withSections([]).documents[0]!.nonOperativeSections).toEqual([]);
    expect(withSections(['A', 'B']).documents[0]!.nonOperativeSections).toEqual(['A', 'B']);
    // Authenticity is an enum, not free text.
    expect(artefactAuthenticitySchema.options).toEqual(['authentic_publication', 'official_consolidation', 'official_pre_publication_text']);
    expect(() => z.object({ a: artefactAuthenticitySchema }).parse({ a: 'consolidated' })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// The rendered projection (pure) — B3, B4d–B4i, B6
// ---------------------------------------------------------------------------

describe('the standing block rendered beside every document', () => {
  const memo = 'EXPLANATORY MEMORANDUM';

  it('B3 — an adopted document says it is not current law; its in-force sibling in the same render carries no such sentence', () => {
    const rendered = renderEntitledClosure(closureOf(DIRECT));
    const [rm, rn] = rendered.split('## DOC-RN');
    expect(rm).toContain('Temporal standing of served sources: in_force.');
    expect(rm).not.toContain('not current law');
    expect(rn).toContain('Temporal standing of served sources: adopted_not_effective; in_force.');
    expect(rn).toContain('This artefact serves sources of differing legal standing.');
    expect(rn).toContain('must not be treated as current law for any source shown as adopted-not-effective');
  });

  it('B6 — a multi-source document renders one standing per served source, in source-id order, without printing the ids', () => {
    const standing = closureOf(DIRECT).standingOf('DOC-RN');
    const block = renderStanding(standing);
    expect(block).toContain('adopted_not_effective; in_force');
    expect(block).not.toMatch(/SRC-\d{3}/);
    expect(standing.sources.map((s) => s.sourceId)).toEqual(['SRC-912', 'SRC-913']);
  });

  it('B4d — a document declaring no non-operative sections renders no always-component', () => {
    const block = renderStanding(closureOf(INFORCE).standingOf('DOC-RQ'));
    expect(block).not.toContain('not an operative provision');
    expect(block).toContain('Artefact authenticity: official_consolidation.');
  });

  it('B4e — the in-force case with declared sections renders the always-component and no not-current-law claim', () => {
    const block = renderStanding(closureOf(INFORCE, worldIndex({ 'DOC-RQ': { nonOperativeSections: [memo] } })).standingOf('DOC-RQ'));
    expect(block).toContain(`Material under ${memo} is not an operative provision of this document.`);
    expect(block).not.toContain('not current law');
  });

  it('B4i — the standing components are not gated on a declaration: an adopted document declaring [] still says so', () => {
    const uniform = worldPack({ ...STANDING, 'SRC-913': 'adopted_not_effective' });
    const block = renderStanding(closureOf(DIRECT, worldIndex(), uniform).standingOf('DOC-RN'));
    expect(block).not.toContain('not an operative provision');
    expect(block).toContain('The adopted legal material in this document is not current law.');
  });

  it('B4f — the three standing projections are distinct, and the fourth form covers a uniform non-adopted standing', () => {
    expect(operativeStatusClause(['in_force'])).toBeNull();
    expect(operativeStatusClause(['in_force', 'in_force'])).toBeNull();
    expect(operativeStatusClause(['adopted_not_effective'])).toBe('The adopted legal material in this document is not current law.');
    expect(operativeStatusClause(['in_force', 'adopted_not_effective'])).toBe(
      'This artefact serves sources of differing legal standing. It must not be treated as current law for any source shown as adopted-not-effective.',
    );
    expect(operativeStatusClause(['superseded'])).toBe('The legal material in this document is shown as superseded; it is not current law.');
    expect(operativeStatusClause(['in_force', 'superseded'])).toContain('Nor for any source shown as superseded.');
  });

  it('B4h — the clause never characterises the remainder, nor calls the declared material explanatory', () => {
    // A heading that does not itself contain the word, so the assertion is
    // about the renderer's own prose and not about what the author declared.
    const block = renderStanding(closureOf(DIRECT, worldIndex({ 'DOC-RN': { nonOperativeSections: ['FRONT MATTER'] } })).standingOf('DOC-RN'));
    expect(block).toContain('Material under FRONT MATTER is not an operative provision of this document.');
    expect(block).toContain('This says nothing about any section not named here');
    // Exactly one sentence may mention the rest of the document: the qualifier that disclaims it.
    expect(block.match(/rest of the document is operative/g) ?? []).toHaveLength(1);
    expect(block).toContain('it must not be read as a statement that the rest of the document is operative.');
    expect(block).not.toMatch(/remainder .* operative material/i);
    expect(block).not.toMatch(/\bexplanatory\b/i);
  });
});
