/**
 * Seven prosecutors, one per declared lens — the milestone role configuration
 * (B-ADAPTER).
 *
 * The lens list has seven members and the count was three, so four lenses —
 * the sixth, superseded or miscited provision, among them — never reached a
 * prosecutor request. This proves, on the inputs orchestration actually
 * constructs, that every declared lens reaches exactly one prosecutor, that
 * each prosecutor's challenge reaches adjudication, and that B-PROMPT's
 * structural guarantee holds on these larger adjudicator inputs.
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_LENSES, DEFAULT_ROLE_CONFIG } from '../src/pipeline/config';
import { runVerificationPipeline } from '../src/pipeline/orchestrate';
import { qualifiedChallengeId } from '../src/pipeline/prosecutors';
import { EntitledClosure, beginFence, endFence, documentHeading } from '../src/pipeline/entitlement';
import { loadPromptSet } from '../src/pipeline/prompts';
import { sha256Hex } from '../src/corpus/hash';
import {
  docText,
  fixtureAuthorisedCorpus,
  fixtureRegister,
  fixtureRenderContext,
  fixtureRequirement,
  fixtureSourceUniverse,
  lensFromRequest,
  stubReaderOutput,
  stubRunner,
} from './pipeline-fixtures';

describe('seven prosecutors exercise the seven lenses', () => {
  it('L1 — the default configuration runs one prosecutor per declared lens, in order, each lens once', async () => {
    expect(DEFAULT_LENSES).toHaveLength(7);
    expect(DEFAULT_ROLE_CONFIG.prosecutorCount).toBe(DEFAULT_LENSES.length);
    expect(DEFAULT_LENSES[5]).toBe('superseded_or_miscited_provision');
    const corpus = fixtureAuthorisedCorpus();
    const closure = EntitledClosure.forSources(corpus, fixtureRegister(), fixtureSourceUniverse(), ['SRC-100']);
    const quote = { kind: 'quote' as const, docId: 'DOC-A', sha256Normalized: sha256Hex(docText('DOC-A')), text: 'The operative test is stated here.' };
    const runner = stubRunner((request) => {
      switch (request.role) {
        case 'reader':
          return JSON.stringify(stubReaderOutput());
        case 'prosecutor': {
          const lens = lensFromRequest(request);
          return JSON.stringify({
            lens,
            coverage: [
              { direction: 'reading_to_condition', readingElementId: 'RE-STUB', conditionPath: 'root', verdict: 'MAPPED' },
              { direction: 'condition_to_reading', conditionPath: 'root', verdict: 'UNSUPPORTED', challengeId: 'C1' },
            ],
            challenges: [{ id: 'C1', lens, statement: `FIXTURE challenge under ${lens}`, evidence: [quote] }],
            gaps: [],
          });
        }
        case 'adjudicator':
          return JSON.stringify({
            adjudications: DEFAULT_LENSES.map((_, i) => ({ challengeId: qualifiedChallengeId(i, 'C1'), verdict: 'CONFIRMED', resolution: 'FIXTURE resolution.', evidence: [quote] })),
            gaps: [],
          });
      }
    });
    const outcome = await runVerificationPipeline({
      packId: 'testpack',
      requirementId: 'TEST-R-001',
      requirement: fixtureRequirement(),
      renderContext: fixtureRenderContext(),
      closure,
      corpus,
      prompts: loadPromptSet(),
      config: DEFAULT_ROLE_CONFIG,
      runner,
    });
    const prosecutors = runner.requests.filter((r) => r.role === 'prosecutor');
    expect(prosecutors).toHaveLength(7);
    expect(prosecutors.map((r) => r.lens)).toEqual([...DEFAULT_LENSES]);
    expect(new Set(prosecutors.map((r) => r.lens)).size).toBe(7);
    expect(prosecutors.map((r) => r.index)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    // Every prosecutor's challenge reached the adjudicator's input, under its own qualified id and lens.
    const adjudicator = runner.requests.find((r) => r.role === 'adjudicator');
    const input = adjudicator?.messages.find((m) => m.from === 'input')?.content ?? '';
    for (const [i, lens] of DEFAULT_LENSES.entries()) {
      expect(input, lens).toContain(`"id": "${qualifiedChallengeId(i, 'C1')}"`);
      expect(input, lens).toContain(`FIXTURE challenge under ${lens}`);
    }
    // And the adjudicated result carries all seven, resolved.
    expect(outcome.prosecution.table.challenges.map((c) => c.lens)).toEqual([...DEFAULT_LENSES]);
    expect(outcome.prosecution.table.challenges.map((c) => c.id)).toEqual(DEFAULT_LENSES.map((_, i) => qualifiedChallengeId(i, 'C1')));
    // B-PROMPT holds on the larger inputs: every structural line is the pipeline's own.
    const owned = (headings: string[]) => [
      ...headings.map((h) => `# ${h}`),
      // Grammar 1.2.0: the closure's relationships, listed before the closure (the evidence-edge contract).
      '# Entitled relationships',
      `# Entitled closure (${closure.sha256})`,
      ...closure.documents().flatMap((d) => [documentHeading(d), beginFence(d), endFence(d)]),
    ];
    const structural = (text: string) => text.split('\n').filter((l) => l.startsWith('#') || l.startsWith('<<<'));
    expect(structural(input)).toEqual(owned(['Blind reading', 'Rendered condition', 'Coverage', 'Challenges']));
    for (const p of prosecutors) {
      expect(structural(p.messages.find((m) => m.from === 'input')?.content ?? '')).toEqual(owned(['Lens', 'Blind reading', 'Rendered condition', 'Condition addresses']));
    }
  });
});
