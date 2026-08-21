/**
 * The seam: what each role is allowed to hand back.
 *
 * A malformed agent response has to fail at the boundary of the role that
 * produced it, named, rather than travelling three stages downstream and
 * surfacing as an invalid `verification-result.json` whose message points at a
 * schema path. So each role's output has a schema, and the schema is applied
 * the moment the response is parsed.
 *
 * **`.strict()` everywhere, and that is the runtime half of the pin rule.**
 * `roles.ts` states at the type level that a role output may not carry
 * `corpusClosureSha256` or any of its five siblings. Types are gone by the time
 * a response arrives: it is text, parsed into `unknown`. `.strict()` is what
 * enforces the same rule on a value that never had a type — a response carrying
 * a pin is *rejected*, by name, rather than having the field quietly stripped
 * and the caller left believing the agent complied.
 *
 * **These schemas are Task 1's contract and Tasks 2–4 own their contents.** The
 * reader's blindness projection (§3.1), the prosecutor's lens discipline (§3.2)
 * and the adjudicator's verdict binding (§3.3) are those tasks' rules. What is
 * fixed here is the shape of the seam and the fact that something checks it.
 *
 * No `.refine()` anywhere, for the reason `result.ts` gives: a refinement wraps
 * an object in a node the field-accounting walker refuses, and keeping these
 * schemas walkable keeps the option of holding role outputs to account open.
 */

import { z } from 'zod';
import { evidenceItemSchema } from '../corpus/evidence';
import {
  challengeVerdictSchema,
  coverageDirectionSchema,
  coverageVerdictSchema,
} from '../verification/result';
import { RoleOutputError, type PinFree, type RoleName } from './roles';

/**
 * A structural gap, in the role's own words.
 *
 * Every reading role may halt on one (§3.0): the closure is the whole evidence
 * surface, and a document outside it is not a document that said nothing. The
 * vocabulary is `result.ts`'s, deliberately — two spellings of `corpus_gap`
 * would be two refusals the sign gate could only half see.
 */
export const roleGapSchema = z
  .object({
    kind: z.enum(['corpus_gap', 'closure_gap']),
    docId: z.string(),
    detail: z.string(),
  })
  .strict();

export type RoleGap = z.infer<typeof roleGapSchema>;

/** One proposition of the blind reading, with the text behind it. */
const readingElementSchema = z
  .object({
    id: z.string(),
    statement: z.string(),
    evidence: z.array(evidenceItemSchema).min(1),
  })
  .strict();

/**
 * The reader's output.
 *
 * `gaps` is a required array rather than an optional one: an empty list is a
 * reader saying it needed nothing it could not reach, which is a different
 * statement from a reader that never considered the question. `.strict()` plus
 * a required field is how the difference stays visible.
 */
export const readerOutputSchema = z
  .object({
    elements: z.array(readingElementSchema),
    gaps: z.array(roleGapSchema),
  })
  .strict();

export type ReaderOutput = z.infer<typeof readerOutputSchema>;

/** One cell of the bidirectional coverage table. */
const coverageCellSchema = z
  .object({
    direction: coverageDirectionSchema,
    readingElementId: z.string().optional(),
    conditionPath: z.string().optional(),
    verdict: coverageVerdictSchema,
    challengeId: z.string().optional(),
  })
  .strict();

/**
 * One challenge, *without* a verdict.
 *
 * The omission is the rule (§3.2): a prosecutor's vocabulary is `CHALLENGE` and
 * nothing else, and a prosecutor that could emit `MISMATCH` would be making the
 * judgment adjudication exists to reserve. `.strict()` makes the absence
 * enforced rather than merely intended — a prosecutor returning a `verdict` key
 * is refused at this seam.
 */
const prosecutorChallengeSchema = z
  .object({
    id: z.string(),
    lens: z.string(),
    statement: z.string(),
    evidence: z.array(evidenceItemSchema).min(1),
  })
  .strict();

export const prosecutorOutputSchema = z
  .object({
    lens: z.string(),
    coverage: z.array(coverageCellSchema),
    challenges: z.array(prosecutorChallengeSchema),
    gaps: z.array(roleGapSchema),
  })
  .strict();

export type ProsecutorOutput = z.infer<typeof prosecutorOutputSchema>;

/** One adjudication, bound to evidence. */
const adjudicationSchema = z
  .object({
    challengeId: z.string(),
    verdict: challengeVerdictSchema,
    resolution: z.string().optional(),
    evidence: z.array(evidenceItemSchema).min(1),
  })
  .strict();

export const adjudicatorOutputSchema = z
  .object({
    adjudications: z.array(adjudicationSchema),
    openQuestions: z.array(z.object({ id: z.string(), statement: z.string() }).strict()),
    gaps: z.array(roleGapSchema),
  })
  .strict();

export type AdjudicatorOutput = z.infer<typeof adjudicatorOutputSchema>;

/**
 * The three seam parsers, keyed by role.
 *
 * Each is `PinFree` by construction — none of the schemas above declares a pin
 * field, and each is `.strict()`, so one arriving in the payload is refused.
 */
export type RoleOutputShapes = {
  reader: ReaderOutput;
  prosecutor: ProsecutorOutput;
  adjudicator: AdjudicatorOutput;
};

/**
 * Each of the three satisfies the pin-free constraint.
 *
 * Asserted here rather than left to the call sites: these are the shapes the
 * whole pipeline is built on, and `PinFree` is only a boundary if something
 * holds them to it at the point they are declared. Adding a pin field to any of
 * the schemas above makes this line fail to compile.
 */
export type PinFreeRoleOutputs = {
  reader: ReaderOutput extends PinFree<ReaderOutput> ? true : never;
  prosecutor: ProsecutorOutput extends PinFree<ProsecutorOutput> ? true : never;
  adjudicator: AdjudicatorOutput extends PinFree<AdjudicatorOutput> ? true : never;
};

export const PIN_FREE_ROLE_OUTPUTS: PinFreeRoleOutputs = {
  reader: true,
  prosecutor: true,
  adjudicator: true,
};

const SCHEMAS = {
  reader: readerOutputSchema,
  prosecutor: prosecutorOutputSchema,
  adjudicator: adjudicatorOutputSchema,
} as const;

/**
 * Validates one role's output at its own boundary.
 *
 * Every problem is reported, not the first: an agent repairing one field at a
 * time costs a whole run per defect, and a run is the expensive thing here.
 */
export function parseRoleOutput<R extends RoleName>(
  role: R,
  index: number,
  raw: unknown,
): RoleOutputShapes[R] {
  const parsed = SCHEMAS[role].safeParse(raw);
  if (!parsed.success) {
    throw new RoleOutputError(
      role,
      index,
      parsed.error.issues.map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`),
    );
  }
  return parsed.data as RoleOutputShapes[R];
}
