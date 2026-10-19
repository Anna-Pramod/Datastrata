/**
 * The pilot profile loader — a record read from a file the environment names,
 * validated against the pack, never substituted.
 *
 * Pilot step 1 (2026-10-19). The dashboard used to be wired to one sample
 * company authored in TypeScript. A pilot needs the company's own facts, so
 * the record now comes from a document: the synthetic development profile
 * bundled with the site when nothing is configured, or the file
 * `DATASTRATA_PILOT_PROFILE` names. Both go through one parser.
 *
 * What this file holds the loader to:
 *
 * ```
 * variable unset            -> the synthetic document, labelled synthetic
 * variable names a file     -> that document, facts verbatim (sources, unknowns, unconfirmed)
 * variable set but blank    -> refused: the operator meant a file
 * file missing / unreadable -> refused by name; the path reaches the server log only
 * file not JSON             -> refused; no sample substituted
 * document invalid          -> refused naming every problem; strict on unknown keys
 * ```
 *
 * The negative claim "the browser-visible detail never carries the path" is
 * paired with its positive control: the operator detail does carry it. A
 * loader that dropped the path from both would pass the first and fail the
 * second (evidence standard, failure mode 7).
 */

import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { csrdPack } from '@/lib/pack';
import {
  loadProfileDocument,
  parseProfileDocument,
  PILOT_PROFILE_ENV,
  ProfileConfigurationError,
  type ProfileDocument,
} from '@/lib/profile';
import synthetic from '@/profiles/synthetic-meridian.json';

const pack = csrdPack();
const deps = (readFile: (path: string) => string = () => { throw new Error('ENOENT'); }) => ({
  readFile,
  synthetic: synthetic as unknown,
  pack,
});

/** A pilot document derived from the synthetic one, with the two fact shapes a real company produces. */
function pilotDocument(): ProfileDocument {
  const document = JSON.parse(JSON.stringify(synthetic)) as ProfileDocument;
  document.record = {
    kind: 'pilot',
    name: 'Test Pilot AG',
    note: 'Facts as stated on the onboarding call; nothing inferred.',
    statedOn: '2026-10-19',
  };
  document.profile.facts.push(
    // Explicitly unknown: distinct from absent, and it must stay unknown.
    { factType: 'entity.avg_employees', scopeId: 'e-in', value: { kind: 'unknown' }, confirmed: true, source: { kind: 'customer_statement', ref: 'onboarding call 2026-10-19' } },
    // An extracted candidate a human has not confirmed: kept in the record, invisible to the evaluator.
    { factType: 'entity.is_public_interest_entity', scopeId: 'e-nl', value: { kind: 'boolean', value: false }, confirmed: false, source: { kind: 'extraction', ref: 'annual report OCR', page: '3', extractionConfidence: 0.4 } },
  );
  return document;
}

function tempFile(name: string, text: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'pilot-profile-'));
  const path = join(dir, name);
  writeFileSync(path, text, 'utf8');
  return path;
}

function refusal(run: () => unknown): ProfileConfigurationError {
  try {
    run();
  } catch (error) {
    if (error instanceof ProfileConfigurationError) return error;
    throw error;
  }
  throw new Error('expected a ProfileConfigurationError and none was thrown');
}

describe('selecting the profile', () => {
  it('serves the synthetic development document, labelled as such, when the variable is unset', () => {
    const { origin, document } = loadProfileDocument({}, deps());
    expect(origin).toEqual({ kind: 'synthetic' });
    expect(document.record.kind).toBe('synthetic');
    expect(document.record.note.toLowerCase()).toContain('synthetic');
    expect(document.profile.scopeObjects).toHaveLength(7);
    expect(document.profile.facts).toHaveLength(42);
  });

  it('serves the named file verbatim: sources, unknown values and unconfirmed facts preserved', () => {
    const written = pilotDocument();
    const path = tempFile('pilot.json', JSON.stringify(written));
    const { origin, document } = loadProfileDocument({ [PILOT_PROFILE_ENV]: path }, deps((p) => {
      expect(p).toBe(path);
      return JSON.stringify(written);
    }));
    expect(origin).toEqual({ kind: 'file' });
    expect(document).toEqual(written);
    const unknown = document.profile.facts.find((f) => f.scopeId === 'e-in' && f.factType === 'entity.avg_employees');
    expect(unknown?.value).toEqual({ kind: 'unknown' });
    const unconfirmed = document.profile.facts.find((f) => f.factType === 'entity.is_public_interest_entity');
    expect(unconfirmed?.confirmed).toBe(false);
    expect(unconfirmed?.source?.extractionConfidence).toBe(0.4);
  });

  it('refuses a variable that is set but blank rather than reading the sample', () => {
    const error = refusal(() => loadProfileDocument({ [PILOT_PROFILE_ENV]: '   ' }, deps()));
    expect(error.code).toBe('unreadable');
    expect(error.publicDetail).toContain(PILOT_PROFILE_ENV);
  });
});

describe('refusing a file that cannot serve', () => {
  it('names the variable, keeps the path out of the browser-visible detail, and keeps it in the operator detail', () => {
    const path = '/pilot/secret-location/acme.json';
    const error = refusal(() => loadProfileDocument({ [PILOT_PROFILE_ENV]: path }, deps(() => { throw new Error(`ENOENT: no such file, open '${path}'`); })));
    expect(error.code).toBe('unreadable');
    expect(error.publicDetail).toContain(PILOT_PROFILE_ENV);
    expect(error.publicDetail).not.toContain('secret-location');
    expect(error.operatorDetail).toContain(path);
  });

  it('refuses a file that is not JSON, and substitutes nothing', () => {
    const error = refusal(() => loadProfileDocument({ [PILOT_PROFILE_ENV]: '/p/x.json' }, deps(() => '{ not json')));
    expect(error.code).toBe('invalid_json');
    expect(error.publicDetail).not.toContain('/p/x.json');
  });
});

describe('validating a document against the pack', () => {
  it('accepts the synthetic document through the same parser the pilot file uses', () => {
    const document = parseProfileDocument(synthetic, pack);
    expect(document.record.kind).toBe('synthetic');
    expect(document.context.subjectId).toBe('org');
  });

  it('refuses a fact type the pack does not know, naming it', () => {
    const document = pilotDocument();
    document.profile.facts.push({ factType: 'entity.made_up', scopeId: 'e-de', value: { kind: 'boolean', value: true }, confirmed: true, source: { kind: 'customer_statement', ref: 'test' } });
    const error = refusal(() => parseProfileDocument(document, pack));
    expect(error.code).toBe('invalid_document');
    expect(error.publicDetail).toContain('entity.made_up');
  });

  it('refuses a fact stated on a scope object of the wrong type, naming both', () => {
    const document = pilotDocument();
    document.profile.facts.push({ factType: 'group.avg_employees', scopeId: 'e-de', value: { kind: 'number', value: 10 }, confirmed: true, source: { kind: 'customer_statement', ref: 'test' } });
    const error = refusal(() => parseProfileDocument(document, pack));
    expect(error.code).toBe('invalid_document');
    expect(error.publicDetail).toContain('group.avg_employees');
    expect(error.publicDetail).toContain('e-de');
  });

  it('refuses a fact whose scope object does not exist, and a subject that does not exist', () => {
    const document = pilotDocument();
    document.profile.facts.push({ factType: 'entity.avg_employees', scopeId: 'e-missing', value: { kind: 'number', value: 10 }, confirmed: true, source: { kind: 'customer_statement', ref: 'test' } });
    document.context.subjectId = 'nobody';
    const error = refusal(() => parseProfileDocument(document, pack));
    expect(error.publicDetail).toContain('e-missing');
    expect(error.publicDetail).toContain('nobody');
  });

  it('refuses the same fact stated twice for one scope object', () => {
    const document = pilotDocument();
    document.profile.facts.push({ factType: 'entity.avg_employees', scopeId: 'e-de', value: { kind: 'number', value: 1 }, confirmed: true, source: { kind: 'customer_statement', ref: 'test' } });
    const error = refusal(() => parseProfileDocument(document, pack));
    expect(error.publicDetail).toContain('entity.avg_employees');
    expect(error.publicDetail).toContain('twice');
  });

  it('refuses a value whose kind does not fit the fact type', () => {
    const document = pilotDocument();
    document.profile.facts.push({ factType: 'entity.is_public_interest_entity', scopeId: 'e-de', value: { kind: 'string', value: 'yes' }, confirmed: true, source: { kind: 'customer_statement', ref: 'test' } });
    const error = refusal(() => parseProfileDocument(document, pack));
    expect(error.publicDetail).toContain('entity.is_public_interest_entity');
    expect(error.publicDetail).toContain('string');
  });

  it('refuses an unknown key on a fact instead of stripping it', () => {
    const document = JSON.parse(JSON.stringify(pilotDocument())) as { profile: { facts: Record<string, unknown>[] } };
    document.profile.facts[0] = { ...document.profile.facts[0], verified: true };
    const error = refusal(() => parseProfileDocument(document, pack));
    expect(error.code).toBe('invalid_document');
    expect(error.publicDetail).toContain('verified');
  });

  it('refuses a short-name label for a scope object that is not in the profile', () => {
    const document = pilotDocument();
    document.record.shortNames = { 'e-nowhere': 'Nowhere' };
    const error = refusal(() => parseProfileDocument(document, pack));
    expect(error.publicDetail).toContain('e-nowhere');
  });

  it('reports every problem in one refusal, not only the first', () => {
    const document = pilotDocument();
    document.profile.facts.push(
      { factType: 'entity.made_up', scopeId: 'e-de', value: { kind: 'boolean', value: true }, confirmed: true, source: { kind: 'customer_statement', ref: 'test' } },
      { factType: 'entity.avg_employees', scopeId: 'e-missing', value: { kind: 'number', value: 10 }, confirmed: true, source: { kind: 'customer_statement', ref: 'test' } },
    );
    const error = refusal(() => parseProfileDocument(document, pack));
    expect(error.problems.length).toBeGreaterThanOrEqual(2);
    expect(error.publicDetail).toContain('entity.made_up');
    expect(error.publicDetail).toContain('e-missing');
  });
});
