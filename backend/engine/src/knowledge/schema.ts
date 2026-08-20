/**
 * The authored shape of a knowledge pack, as one definition.
 *
 * These schemas were module-private inside `loader.ts`, which reads the
 * filesystem. That was fine while the only question they answered was "will
 * this pack load?". Version integrity asks a second question — "is this
 * requirement still the content its declared version named?" — and the honest
 * answer is a hash over *the authored record*, which means the hash function
 * needs the same definition of "authored" the loader enforces.
 *
 * Copying the requirement schema into `src/verification/` would answer it with
 * a second definition, and two definitions of one contract diverge the first
 * time somebody adds a field to only one of them — silently, because a hash
 * that fails to move looks exactly like content that did not change. So the
 * definition moved here instead, to a module that imports zod and the types
 * and nothing else. `src/verification/` stays free of `node:fs`, the loader
 * keeps validating exactly what it validated before, and there is one place
 * where "authored" is decided.
 *
 * Note that `requirementSchema` deliberately does **not** use `.strict()`.
 * zod's default strip behaviour is load-bearing here: it is what makes a
 * loader-attached field such as `derivedStatus` structurally incapable of
 * entering `requirementSha256`, and what makes a newly declared authored field
 * enter it automatically. Strict would turn the first case into a throw rather
 * than a strip, and the loader would reject packs carrying anything extra.
 */

import { z } from 'zod';
import type { Condition, QuestionShowWhen } from '../types';

export const truthSchema = z.enum(['APPLIES', 'DOES_NOT_APPLY', 'INDETERMINATE']);

export const reasonSchema = z.enum([
  'missing_fact',
  'range_crosses_threshold',
  'catalogue_unknown',
  'source_conflict',
  'legal_ambiguity',
  'customer_scope_ambiguity',
  'national_law_unresolved',
  'upstream_indeterminate',
  'source_status_unresolved',
  'not_yet_effective',
]);

export const scopeTypeSchema = z.enum(['organization', 'legal_entity', 'branch', 'facility', 'product', 'trade_lane', 'supplier', 'request', 'counterparty']);

export const cmpOpSchema = z.enum(['gt', 'gte', 'lt', 'lte']);

export const conditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.discriminatedUnion('op', [
    z.object({ op: z.literal('all'), of: z.array(conditionSchema).min(1) }),
    z.object({ op: z.literal('any'), of: z.array(conditionSchema).min(1) }),
    z.object({ op: z.literal('not'), of: conditionSchema }),
    z.object({ op: z.literal('cmp'), fact: z.string(), cmp: cmpOpSchema, value: z.number() }),
    z.object({ op: z.literal('eq'), fact: z.string(), value: z.union([z.string(), z.number(), z.boolean()]) }),
    z.object({ op: z.literal('in_set'), fact: z.string(), set: z.array(z.union([z.string(), z.number()])).min(1) }),
    z.object({ op: z.literal('in_catalogue'), fact: z.string(), catalogue: z.string(), missReason: reasonSchema.optional() }),
    z.object({ op: z.literal('prefix_in'), fact: z.string(), prefixes: z.array(z.string()).min(1) }),
    z.object({ op: z.literal('exists'), fact: z.string() }),
    z.object({ op: z.literal('count_cmp'), fact: z.string(), cmp: cmpOpSchema, value: z.number() }),
    z.object({ op: z.literal('quantifier_any'), scopeType: scopeTypeSchema, where: conditionSchema }),
    z.object({ op: z.literal('sum_cmp'), scopeType: scopeTypeSchema, fact: z.string(), cmp: cmpOpSchema, value: z.number() }),
    z.object({ op: z.literal('fy_starts_on_or_after'), date: z.string() }),
    z.object({ op: z.literal('fy_start_year_in'), years: z.array(z.number()).min(1) }),
    z.object({ op: z.literal('year_diff_lt'), fromFact: z.string(), years: z.number() }),
    z.object({ op: z.literal('requirement_ref'), requirement: z.string(), expect: truthSchema }),
    z.object({ op: z.literal('pack_flag'), flag: z.string() }),
  ]),
) as z.ZodType<Condition>;

export const showWhenSchema: z.ZodType<QuestionShowWhen> = z.lazy(() =>
  z
    .object({
      always: z.boolean().optional(),
      allOf: z.array(showWhenSchema).optional(),
      anyOf: z.array(showWhenSchema).optional(),
      factEquals: z.object({ fact: z.string(), value: z.union([z.string(), z.number(), z.boolean()]) }).optional(),
      factExists: z.object({ fact: z.string() }).optional(),
      factInSet: z.object({ fact: z.string(), set: z.array(z.string()), negate: z.boolean().optional() }).optional(),
      requirementIs: z.object({ requirement: z.string(), truth: truthSchema }).optional(),
      requirementResolved: z.object({ requirement: z.string() }).optional(),
    })
    .strict(),
) as z.ZodType<QuestionShowWhen>;

export const sourceRecordSchema = z.object({
  id: z.string(),
  title: z.string(),
  legalType: z.string(),
  statusAtSnapshot: z.string(),
  usedFor: z.string(),
  keyProvisions: z.string().optional(),
  url: z.string().url(),
  monitor: z.string().optional(),
});

export const factTypeSchema = z.object({
  id: z.string(),
  scopeType: scopeTypeSchema,
  dataType: z.enum(['number_or_range', 'boolean', 'boolean_or_unknown', 'enum', 'country', 'date', 'year', 'url', 'entity_list', 'item_list', 'status']),
  module: z.string(),
  reusableAcrossPrograms: z.enum(['yes', 'no', 'potentially']),
  typicalSource: z.string().optional(),
  reviewCadence: z.string().optional(),
  missingReason: reasonSchema.optional(),
  enumValues: z.array(z.string()).optional(),
  notes: z.string().optional(),
  label: z.string().optional(),
  unit: z.string().optional(),
  labelNote: z.string().optional(),
});

/**
 * The authored requirement, and the domain of `requirementSha256`.
 *
 * `version` is an integer bumped by hand as part of any content edit. It is
 * not generated: a generated version cannot tell a revision from a reformat,
 * and that is the distinction a signature's `requirementVersion` pin depends
 * on. Because `version` is itself an authored field it is inside the hash, so
 * bumping the version is a content change in its own right and the registry
 * records a new mapping for it rather than silently reusing the old one.
 */
export const requirementSchema = z.object({
  id: z.string(),
  version: z.number().int().min(1),
  ruleRef: z.string().optional(),
  title: z.string(),
  program: z.string(),
  decisionArea: z.string(),
  plainEnglish: z.string(),
  scopeType: scopeTypeSchema,
  relationshipClass: z.enum([
    'direct_legal',
    'direct_legal_exemption',
    'indirect_operational',
    'voluntary_commitment',
    'contractual',
    'advisory_readiness',
    'standard_selection',
    'timing_context',
    'legal_status_gate',
  ]),
  severity: z.enum(['critical', 'high', 'medium', 'low']),
  kind: z.enum(['boolean', 'selection']),
  condition: conditionSchema.optional(),
  cases: z.array(z.object({ when: conditionSchema, value: z.string(), label: z.string().optional() })).optional(),
  defaultValue: z.string().optional(),
  legalStatus: z.enum(['in_force', 'adopted_not_effective', 'proposed', 'superseded']),
  ratification: z.object({ status: z.enum(['draft', 'ratified']), by: z.string().optional(), date: z.string().optional() }),
  sources: z.array(z.string()).min(1),
  provisions: z.string().optional(),
  caution: z.string().optional(),
  obligationTemplates: z.array(z.string()).optional(),
});

export const obligationTemplateSchema = z.object({
  id: z.string(),
  obligation: z.string(),
  actor: z.string(),
  trigger: z.object({ allOf: z.array(z.string()).optional(), anyOf: z.array(z.string()).optional() }),
  defaultOwnerRole: z.string(),
  deadlineLogic: z.string(),
  evidenceExpectation: z.string(),
  completionCriterion: z.string(),
});

export const gapTestSchema = z.object({
  id: z.string(),
  obligationTemplate: z.string(),
  readinessTest: z.string(),
  readinessFact: z.string().optional(),
  satisfiedWhen: z.array(z.string()).optional(),
  existingEvidenceToCredit: z.string(),
  priority: z.enum(['critical', 'high', 'medium', 'low']),
  firstAction: z.string(),
  consequence: z.string(),
});

export const questionSchema = z.object({
  id: z.string(),
  order: z.number(),
  module: z.string(),
  text: z.string(),
  factTypes: z.array(z.string()),
  showWhen: showWhenSchema,
  inputPath: z.string(),
  whyAsked: z.string(),
});

export const catalogueSchema = z.object({ entries: z.record(z.boolean()), missReason: reasonSchema, note: z.string().optional() });

export const changeWatchItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.string(),
  expected: z.string().optional(),
  affectsRequirements: z.array(z.string()),
  sources: z.array(z.string()),
  note: z.string().optional(),
});

export const manifestSchema = z.object({
  id: z.string(),
  version: z.string(),
  program: z.string(),
  legalSnapshot: z.string(),
  packFlags: z.record(z.boolean()),
  changeWatch: z.array(changeWatchItemSchema),
});
