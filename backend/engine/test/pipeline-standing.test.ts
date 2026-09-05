/**
 * Standing reaching every role, every pin and every identity.
 *
 * `corpus-standing.test.ts` proves what the closure *is* under standing; this
 * file proves that what the closure carries actually reaches the three roles'
 * rendered inputs (B4a–B4c, B1), the pins a record and a signature carry (B5),
 * the pipeline identity (B10, B18) and the two records that name the closure
 * renderer's grammar (B14, B15). Each is asserted on its own surface: one role
 * carrying the clause proves nothing about the other two.
 */

import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { CLOSURE_POLICY_V0, CLOSURE_POLICY_V1 } from '../src/corpus/closure';
import { loadCorpus } from '../src/corpus/store';
import { authoriseCorpus } from '../src/corpus/authority';
import { loadPackContext } from '../src/knowledge/loader';
import { sourceIdsOf } from '../src/knowledge/provenance';
import { CLOSURE_RENDERER_VERSION, EntitledClosure } from '../src/pipeline/entitlement';
import { readerInputFor, renderReaderInput } from '../src/pipeline/reader';
import { prosecutorInputFor, renderProsecutorInput } from '../src/pipeline/prosecutors';
import { adjudicatorInputFor, renderAdjudicatorInput } from '../src/pipeline/adjudicator';
import { buildPipelineIdentity, type PipelineIdentityInput } from '../src/pipeline/identity';
import { assembleVerificationResult } from '../src/pipeline/assemble';
import { producePins } from '../src/verification/current-state';
import { corpusPinSchema } from '../src/verification/corpus-pin';
import { buildSignature } from '../src/verification/sign';
import { signingEntrySchema } from '../src/verification/ledger';
import { citing, fixtureRenderContext, fixtureRequirement, stubReaderOutput } from './pipeline-fixtures';
import { REGISTERS, REGISTRY, REQUIREMENT, runPipeline } from './pipeline-run-fixtures';
import { DIRECT, INFORCE, capabilityOver, closureOf, engineRootOf, worldIndex } from './standing-world';

const DIFFERING = 'This artefact serves sources of differing legal standing.';
const NOT_CURRENT = 'not current law';

describe('the operative-status clause reaches every role', () => {
  const closure = closureOf(DIRECT);
  const requirement = fixtureRequirement({ provenance: citing('SRC-912') });

  it('B4a — the reader', () => {
    const rendered = renderReaderInput(readerInputFor({ packId: 'testpack', requirement, closure }));
    expect(rendered).toContain(DIFFERING);
    expect(rendered).toContain('Artefact authenticity: official_consolidation.');
    // The reader stays blind to source identities even now that standing is shown.
    expect(rendered).not.toMatch(/SRC-\d{3}/);
  });

  it('B4b — each prosecutor', () => {
    for (const lens of ['lens_one', 'lens_two']) {
      const rendered = renderProsecutorInput(
        prosecutorInputFor({ reading: stubReaderOutput(), renderedCondition: 'x > 1', conditionPaths: ['root'], lens, closure }),
      );
      expect(rendered, lens).toContain(DIFFERING);
    }
  });

  it('B4c — the adjudicator', () => {
    const rendered = renderAdjudicatorInput(
      adjudicatorInputFor({ reading: stubReaderOutput(), renderedCondition: 'x > 1', table: { cells: [], challenges: [] } as never, closure }),
    );
    expect(rendered).toContain(DIFFERING);
  });

  it('positive control — an all-in-force closure renders standing and no not-current-law claim, on the same three surfaces', () => {
    const inForce = closureOf(INFORCE);
    const reader = renderReaderInput(readerInputFor({ packId: 'testpack', requirement: fixtureRequirement({ provenance: citing('SRC-914') }), closure: inForce }));
    const prosecutor = renderProsecutorInput(prosecutorInputFor({ reading: stubReaderOutput(), renderedCondition: 'x', conditionPaths: ['root'], lens: 'l', closure: inForce }));
    const adjudicator = renderAdjudicatorInput(adjudicatorInputFor({ reading: stubReaderOutput(), renderedCondition: 'x', table: { cells: [], challenges: [] } as never, closure: inForce }));
    for (const rendered of [reader, prosecutor, adjudicator]) {
      expect(rendered).toContain('Temporal standing of served sources: in_force.');
      expect(rendered).not.toContain(NOT_CURRENT);
      expect(rendered).not.toContain(DIFFERING);
    }
  });
});

describe('B1 — over the real pack, no role-facing render omits standing', () => {
  it('every entitled document of every model-reachable requirement carries the two standing lines', () => {
    const root = engineRootOf();
    const { pack, sourceRegister } = loadPackContext(join(root, 'knowledge', 'csrd'), { sourceRegisterDir: join(root, 'monitoring') });
    const corpus = authoriseCorpus(loadCorpus(join(root, 'corpus')), sourceRegister, pack);
    let rendered = 0;
    for (const requirement of pack.requirements) {
      const closure = EntitledClosure.forSources(corpus, sourceRegister, pack, sourceIdsOf(requirement));
      const text = renderReaderInput(readerInputFor({ packId: pack.id, requirement, closure }));
      const headings = (text.match(/^## DOC-/gm) ?? []).length;
      expect(headings, requirement.id).toBe(closure.docIds.length);
      expect((text.match(/^Artefact authenticity: /gm) ?? []).length, requirement.id).toBe(headings);
      expect((text.match(/^Temporal standing of served sources: /gm) ?? []).length, requirement.id).toBe(headings);
      rendered += headings;
    }
    // Not vacuous: the real corpus renders documents.
    expect(rendered).toBeGreaterThan(0);
  });
});

describe('B5 — the pin carries what the closure carried', () => {
  it('round-trips authenticity, sections and per-source standing through the pin contracts', () => {
    const closure = closureOf(DIRECT);
    const pins = producePins({
      requirement: fixtureRequirement(),
      renderContext: fixtureRenderContext(),
      closure: closure.pinInput,
      corpus: capabilityOver(worldIndex()),
    });
    for (const pin of pins.corpus) {
      expect(() => corpusPinSchema.parse(pin)).not.toThrow();
      const standing = closure.standingOf(pin.docId);
      expect(pin.artefactAuthenticity).toBe(standing.artefactAuthenticity);
      expect(pin.nonOperativeSections).toEqual([...standing.nonOperativeSections]);
      expect(pin.sources).toEqual([...standing.sources]);
    }
    const rn = pins.corpus.find((p) => p.docId === 'DOC-RN')!;
    expect(rn.sources).toEqual([
      { sourceId: 'SRC-912', temporalStanding: 'adopted_not_effective' },
      { sourceId: 'SRC-913', temporalStanding: 'in_force' },
    ]);
    // A pin missing any of the three is refused by the shared contract.
    const { sources: _s, ...withoutSources } = rn;
    expect(() => corpusPinSchema.parse(withoutSources)).toThrow(/sources/);
  });
});

describe('the identity hashes the closure grammar and the expansion rule', () => {
  function baseline(): PipelineIdentityInput {
    return {
      promptSha256: { reader: 'r'.repeat(64), prosecutor: 'p'.repeat(64), adjudicator: 'a'.repeat(64) },
      models: { reader: 'm-r', prosecutor: 'm-p', adjudicator: 'm-a' },
      roleConfig: { prosecutorCount: 2, lenses: ['l1', 'l2'], order: ['reader', 'prosecutor', 'adjudicator'] },
      resultSchemaVersion: '1.3.0',
      closureRendererVersion: CLOSURE_RENDERER_VERSION,
      providerAdapter: { id: 'test-provider', version: '1' },
      closurePolicy: CLOSURE_POLICY_V1,
    };
  }

  it('B10 — changing CLOSURE_RENDERER_VERSION moves pipelineVersion', () => {
    const a = buildPipelineIdentity(baseline());
    const b = buildPipelineIdentity({ ...baseline(), closureRendererVersion: '1.0.1' });
    expect(a).not.toBe(b);
    expect(buildPipelineIdentity(baseline())).toBe(a); // and it is a fixed function
    expect(a.startsWith('pipeline-v3-')).toBe(true);
  });

  it('B18 — two policies differing only in expansion yield different identities', () => {
    const gated = buildPipelineIdentity(baseline());
    const unconditional = buildPipelineIdentity({ ...baseline(), closurePolicy: CLOSURE_POLICY_V0 });
    expect(gated).not.toBe(unconditional);
    // The only difference between the two policies is the behavioural field.
    expect({ ...CLOSURE_POLICY_V0, expansion: 'served_sources_in_force' }).toEqual(CLOSURE_POLICY_V1);
  });
});

describe('the record names the closure grammar, and the signature copies it', () => {
  it('B15 — a run’s result carries CLOSURE_RENDERER_VERSION', async () => {
    const run = await runPipeline();
    const result = assembleVerificationResult({ run, requirement: REQUIREMENT, registry: REGISTRY, registers: REGISTERS });
    expect(result.closureRendererVersion).toBe(CLOSURE_RENDERER_VERSION);
    expect(run.tail.closureRendererVersion).toBe(CLOSURE_RENDERER_VERSION);
    expect(result.resultSchemaVersion).toBe('1.3.0');
  });

  it('B14 — the signature’s value is the result’s, copied, never a parameter or the constant', async () => {
    const run = await runPipeline();
    const result = assembleVerificationResult({ run, requirement: REQUIREMENT, registry: REGISTRY, registers: REGISTERS });
    const sign = (r: typeof result) =>
      buildSignature({
        kind: 'verified',
        packId: 'testpack',
        packVersion: '0.1.0',
        requirement: REQUIREMENT,
        result: r,
        renderedConditionSha256: r.renderedConditionSha256,
        rendererVersion: r.rendererVersion,
        corpusClosureSha256: r.corpusClosureSha256,
        corpus: r.corpus,
        by: 'A. Reviewer',
        on: '2026-09-05',
      }).entry;
    expect(sign(result).closureRendererVersion).toBe(result.closureRendererVersion);
    expect(() => signingEntrySchema.parse(sign(result))).not.toThrow();
    // Copied: a result recorded under another grammar yields a signature that
    // says so, rather than one that restates today's constant.
    const other = { ...result, closureRendererVersion: 'closure-renderer-0.9.0' };
    expect(sign(other).closureRendererVersion).toBe('closure-renderer-0.9.0');
    expect(sign(other).closureRendererVersion).not.toBe(CLOSURE_RENDERER_VERSION);
  });
});
