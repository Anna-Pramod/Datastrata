/**
 * Field accounting — tests.
 *
 * B1b-i shipped a checker that agreed with the renderer about every variant it
 * knew, while `in_catalogue.missReason` escaped both: a field nobody had
 * classified, so nobody noticed it was unverified. Exhaustiveness over
 * *variants* was not enough. These tests exercise a guard that closes the class
 * instead of the instance, so most of them are written to fail against a
 * plausible wrong walker rather than to confirm a right one.
 *
 * Four carry the load:
 *
 *  - **An unrecognised node kind throws.** A walker that treats an unfamiliar
 *    node as a leaf classifies a whole composite as one field and hides every
 *    field beneath it — the `missReason` failure reproduced by the very tool
 *    meant to prevent it. `ZodEffects` is the realistic way that happens: a
 *    reviewer adds `.refine()` to a nested object and the guard goes quiet.
 *  - **The guard fails in both directions.** An emitted path with no role is
 *    the obvious half. A classified path no schema emits is the half that
 *    matters more, because a stale row is a lie about the shape that hides a
 *    removal — and a guard checking only one direction reports "all accounted
 *    for" over a table describing a schema that no longer exists.
 *  - **A container's role never satisfies a descendant.** Asserted directly,
 *    because "the container is accounted for" is the same excuse "the op has a
 *    handler" was in B1b-i.
 *  - **Both discriminated-union variants are walked.** Asserted as a set
 *    equality against the union of the two variants' own paths, so a walker
 *    that reads `_def.options[0]` and stops fails rather than merely under-
 *    reporting.
 */

import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  accountablePaths,
  assertFieldAccounting,
  FieldAccountingError,
  FIELD_ROLES,
  RECORD_SCHEMAS,
  type FieldRole,
} from '../src/verification/accounting';
import {
  ledgerEntrySchema,
  revocationEntrySchema,
  signingEntrySchema,
} from '../src/verification/ledger';
import { verificationResultSchema } from '../src/verification/result';

/**
 * One schema exercising every row of the traversal table: an object, an array
 * of objects, an array of scalars, a record, a discriminated union, a plain
 * union, all three wrappers, and every terminal kind.
 */
const fixtureSchema = z.object({
  name: z.string(),
  count: z.number(),
  enabled: z.boolean(),
  tier: z.enum(['a', 'b']),
  version: z.literal('1'),
  note: z.string().optional(),
  label: z.string().nullable(),
  mode: z.string().default('x'),
  tags: z.array(z.string()),
  items: z.array(z.object({ id: z.string(), score: z.number() })),
  index: z.record(z.object({ docId: z.string() })),
  payload: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('alpha'), alphaOnly: z.string() }),
    z.object({ kind: z.literal('beta'), betaOnly: z.number() }),
  ]),
  either: z.union([z.object({ left: z.string() }), z.object({ right: z.string() })]),
});

const FIXTURE_PATHS = [
  'count',
  'either.left',
  'either.right',
  'enabled',
  'index{}',
  'index{}.docId',
  'items[]',
  'items[].id',
  'items[].score',
  'label',
  'mode',
  'name',
  'note',
  'payload.alphaOnly',
  'payload.betaOnly',
  'payload.kind',
  'tags[]',
  'tier',
  'version',
];

/** Every fixture path given the same role, so a test can vary one row at a time. */
function allRoles(paths: readonly string[], role: FieldRole = 'audit'): Record<string, FieldRole[]> {
  return Object.fromEntries(paths.map((path) => [path, [role]]));
}

describe('accountablePaths', () => {
  it('returns exactly the expected paths for a schema covering every node kind', () => {
    expect(accountablePaths(fixtureSchema)).toEqual(FIXTURE_PATHS);
  });

  it('emits array containers as well as their descendants', () => {
    const paths = accountablePaths(fixtureSchema);
    expect(paths).toContain('items[]');
    expect(paths).toContain('items[].id');
  });

  it('emits the `[]` form only, never a bare container key beside it', () => {
    // The plan is explicit: `openQuestions[]` is the container path, and
    // emitting `openQuestions` alongside it would contradict the classification
    // table, which classifies only the `[]` form.
    expect(accountablePaths(fixtureSchema)).not.toContain('items');
    expect(accountablePaths(fixtureSchema)).not.toContain('tags');
  });

  it('emits a record container and its value paths', () => {
    const paths = accountablePaths(fixtureSchema);
    expect(paths).toContain('index{}');
    expect(paths).toContain('index{}.docId');
  });

  it('collapses an array of scalars onto its container path', () => {
    // The element is a leaf with no key of its own, so it has nowhere to go
    // but the `[]` path. A walker that mishandles this either loses the row or
    // invents `tags[].` with an empty segment.
    const paths = accountablePaths(fixtureSchema);
    expect(paths.filter((p) => p.startsWith('tags'))).toEqual(['tags[]']);
  });

  it('unwraps optional, nullable and default without emitting a segment', () => {
    const paths = accountablePaths(fixtureSchema);
    expect(paths).toContain('note');
    expect(paths).toContain('label');
    expect(paths).toContain('mode');
    expect(paths.some((p) => p.includes('innerType'))).toBe(false);
  });

  it('surfaces a path present on only one discriminated-union variant', () => {
    const paths = accountablePaths(fixtureSchema);
    expect(paths).toContain('payload.alphaOnly');
    expect(paths).toContain('payload.betaOnly');
  });

  it('walks every variant of a plain union too', () => {
    const paths = accountablePaths(fixtureSchema);
    expect(paths).toContain('either.left');
    expect(paths).toContain('either.right');
  });

  it('applies a prefix so paths are schema-qualified', () => {
    expect(accountablePaths(z.object({ a: z.string() }), 'result')).toEqual(['result.a']);
  });

  it('returns paths sorted and deduplicated', () => {
    // `kind` occurs on both variants, so a walker that unions without
    // deduplicating returns it twice.
    const paths = accountablePaths(fixtureSchema);
    expect([...paths].sort()).toEqual(paths);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('throws on an unrecognised node kind, naming the type and the path', () => {
    const refined = z.object({ outer: z.object({ inner: z.string() }).refine(() => true) });
    let thrown: unknown;
    try {
      accountablePaths(refined);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect(String(thrown)).toContain('ZodEffects');
    expect(String(thrown)).toContain('outer');
  });

  it('throws rather than treating a refined nested object as a leaf', () => {
    // The defect this guards against is not "fails to throw" but "emits
    // `outer` as a leaf and silently loses `outer.inner`", which reads as a
    // clean walk. Asserting the throw is the only way to tell them apart.
    const refined = z.object({ outer: z.object({ inner: z.string() }).refine(() => true) });
    expect(() => accountablePaths(refined)).toThrow(FieldAccountingError);
  });

  it('throws on a lazy node rather than guessing at it', () => {
    const lazy = z.object({ later: z.lazy(() => z.string()) });
    expect(() => accountablePaths(lazy)).toThrow(/ZodLazy/);
  });
});

describe('assertFieldAccounting', () => {
  it('accepts a table classifying exactly the emitted paths', () => {
    expect(() =>
      assertFieldAccounting({ '': fixtureSchema }, allRoles(FIXTURE_PATHS)),
    ).not.toThrow();
  });

  it('fails naming an unclassified path', () => {
    const roles = allRoles(FIXTURE_PATHS);
    delete roles['items[].score'];
    let thrown: unknown;
    try {
      assertFieldAccounting({ '': fixtureSchema }, roles);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(FieldAccountingError);
    expect((thrown as FieldAccountingError).problems.join('\n')).toContain('items[].score');
  });

  it('fails naming a stale classified path no schema emits', () => {
    const roles = { ...allRoles(FIXTURE_PATHS), 'items[].removedLongAgo': ['audit' as FieldRole] };
    let thrown: unknown;
    try {
      assertFieldAccounting({ '': fixtureSchema }, roles);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(FieldAccountingError);
    expect((thrown as FieldAccountingError).problems.join('\n')).toContain('items[].removedLongAgo');
  });

  it('names every discrepancy, not the first', () => {
    const roles = allRoles(FIXTURE_PATHS);
    delete roles['items[].score'];
    delete roles['payload.betaOnly'];
    const stale = { ...roles, 'gone[].away': ['audit' as FieldRole] };
    try {
      assertFieldAccounting({ '': fixtureSchema }, stale);
      expect.unreachable('expected the guard to throw');
    } catch (error) {
      const problems = (error as FieldAccountingError).problems.join('\n');
      expect(problems).toContain('items[].score');
      expect(problems).toContain('payload.betaOnly');
      expect(problems).toContain('gone[].away');
    }
  });

  it("does not let a container's role satisfy its descendants", () => {
    // `items[]` is classified; `items[].id` and `items[].score` are not. A
    // guard that credits descendants to their container reports clean here,
    // which is "the op has a handler" all over again.
    const roles = allRoles(FIXTURE_PATHS);
    delete roles['items[].id'];
    delete roles['items[].score'];
    try {
      assertFieldAccounting({ '': fixtureSchema }, roles);
      expect.unreachable('expected the guard to throw');
    } catch (error) {
      const problems = (error as FieldAccountingError).problems.join('\n');
      expect(problems).toContain('items[].id');
      expect(problems).toContain('items[].score');
    }
  });

  it('treats an empty role list as no classification at all', () => {
    const roles = { ...allRoles(FIXTURE_PATHS), 'items[].score': [] as FieldRole[] };
    expect(() => assertFieldAccounting({ '': fixtureSchema }, roles)).toThrow(FieldAccountingError);
  });

  it('qualifies paths by schema, so one name cannot govern two artifacts', () => {
    const a = z.object({ requirementVersion: z.number() });
    const b = z.object({ requirementVersion: z.number() });
    const roles: Record<string, FieldRole[]> = { 'x.requirementVersion': ['audit'] };
    try {
      assertFieldAccounting({ x: a, y: b }, roles);
      expect.unreachable('expected the guard to throw');
    } catch (error) {
      const problems = (error as FieldAccountingError).problems.join('\n');
      expect(problems).toContain('y.requirementVersion');
      expect(problems).not.toContain('x.requirementVersion');
    }
  });
});

describe('the real schemas', () => {
  it('are fully accounted for by FIELD_ROLES', () => {
    expect(() => assertFieldAccounting(RECORD_SCHEMAS)).not.toThrow();
  });

  it('classify every path the result schema emits', () => {
    for (const path of accountablePaths(verificationResultSchema, 'result')) {
      expect(FIELD_ROLES[path], `unclassified: ${path}`).toBeDefined();
    }
  });

  it('cover both ledger variants, including revocation-only paths', () => {
    expect(FIELD_ROLES['ledger.revocation.revokes']).toBeDefined();
    expect(FIELD_ROLES['ledger.revocation.reason']).toBeDefined();
    // And a signing-only path, so the assertion is not satisfied by a table
    // that happens to describe only the revocation variant.
    expect(FIELD_ROLES['ledger.signing.corpusClosureSha256']).toBeDefined();
  });

  it('walks both variants of the ledger discriminated union', () => {
    const union = new Set(accountablePaths(ledgerEntrySchema, 'ledger'));
    const variants = new Set([
      ...accountablePaths(signingEntrySchema, 'ledger'),
      ...accountablePaths(revocationEntrySchema, 'ledger'),
    ]);
    expect(union).toEqual(variants);
    // Non-trivially: each variant carries a path the other does not.
    expect(union.has('ledger.corpusClosureSha256')).toBe(true);
    expect(union.has('ledger.revokes')).toBe(true);
  });

  it('uses the verbatim classifications from the plan', () => {
    expect(FIELD_ROLES['ledger.signing.kind']).toEqual(['authority']);
    expect(FIELD_ROLES['ledger.signing.entryId']).toEqual(['integrity', 'audit']);
    expect(FIELD_ROLES['ledger.signing.resultSha256']).toEqual(['freshness', 'integrity', 'audit']);
    expect(FIELD_ROLES['ledger.signing.corpus[].sha256Raw']).toEqual(['freshness', 'audit']);
    expect(FIELD_ROLES['ledger.signing.corpus[].versionLabel']).toEqual(['display', 'audit']);
    expect(FIELD_ROLES['ledger.signing.note']).toEqual(['audit']);
    expect(FIELD_ROLES['ledger.signing.packVersion']).toEqual(['integrity', 'audit']);
    expect(FIELD_ROLES['ledger.signing.on']).toEqual(['display', 'audit']);
    expect(FIELD_ROLES['ledger.revocation.revokes']).toEqual(['authority', 'integrity']);
    expect(FIELD_ROLES['result.openQuestions[]']).toEqual(['signability', 'display']);
    expect(FIELD_ROLES['result.challenges[].verdict']).toEqual(['signability', 'display']);
    expect(FIELD_ROLES['result.challenges[].evidence[]']).toEqual(['signability', 'audit']);
    expect(FIELD_ROLES['result.gaps[]']).toEqual(['signability']);
    // The two gap identities carry one classification between them: whether
    // `gaps[]` is empty is what refuses a signature, and neither identity
    // changes that answer. Asserted as a pair so a later reader cannot conclude
    // the newer field is the weaker one.
    expect(FIELD_ROLES['result.gaps[].sourceId']).toEqual(FIELD_ROLES['result.gaps[].docId']);
    expect(FIELD_ROLES['result.gaps[].sourceId']).toEqual(['display', 'audit']);
    expect(FIELD_ROLES['result.pipelineVersion']).toEqual(['signability', 'audit']);
    expect(FIELD_ROLES['result.resultSchemaVersion']).toEqual(['integrity', 'audit']);
  });

  it('holds the promotion ledger to account, with pipelineVersion signable', () => {
    // The promotion schema arrived carrying three unclassified fields — the
    // exact class §6 exists to close, reproduced by the change that added it.
    // Signing refuses a `pipelineVersion` with no promotion record, so that
    // field is `signability` at minimum.
    expect(RECORD_SCHEMAS['promotion']).toBeDefined();
    expect(FIELD_ROLES['promotion.pipelineVersion']).toContain('signability');
    expect(FIELD_ROLES['promotion.by']).toEqual(['display', 'audit']);
    expect(FIELD_ROLES['promotion.on']).toEqual(['display', 'audit']);
  });

  it('classifies a promotion `on` as display and audit, never authority', () => {
    // Promotion is a set-membership question, not a recency one. This row is
    // what stops a later reader deciding the most recent promotion wins.
    expect(FIELD_ROLES['promotion.on']).not.toContain('authority');
  });

  it('classifies `on` as display and audit, never authority', () => {
    // Task 3 orders by file position. This row is what stops a later reader
    // "improving" that into a date comparison.
    expect(FIELD_ROLES['ledger.signing.on']).not.toContain('authority');
    expect(FIELD_ROLES['ledger.revocation.on']).not.toContain('authority');
  });

  it('carries no classification for a schema name it is not asked about', () => {
    // Every key in the table must belong to one of the three walked schemas,
    // or it is unreachable and the both-directions check cannot see it.
    const prefixes = Object.keys(RECORD_SCHEMAS);
    for (const key of Object.keys(FIELD_ROLES)) {
      expect(
        prefixes.some((prefix) => key.startsWith(`${prefix}.`)),
        `orphan classification: ${key}`,
      ).toBe(true);
    }
  });
});
