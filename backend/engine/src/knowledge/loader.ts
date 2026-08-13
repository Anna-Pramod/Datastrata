/**
 * Knowledge-pack loader + content firewall.
 *
 * Every pack is validated structurally (zod) and referentially before the
 * engine will touch it: unknown FactTypes, dangling source citations,
 * requirement_refs to nothing, obligation triggers pointing at missing
 * requirements — all are load-time errors, never runtime surprises.
 * This is the first layer of "regression testing for law" (Pass 2 §4).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import type { Condition, KnowledgePack, QuestionShowWhen } from '../types';

const truth = z.enum(['APPLIES', 'DOES_NOT_APPLY', 'INDETERMINATE']);
const reason = z.enum([
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
const scopeType = z.enum(['organization', 'legal_entity', 'branch', 'facility', 'product', 'trade_lane', 'supplier', 'request', 'counterparty']);
const cmpOp = z.enum(['gt', 'gte', 'lt', 'lte']);

const condition: z.ZodType<Condition> = z.lazy(() =>
  z.discriminatedUnion('op', [
    z.object({ op: z.literal('all'), of: z.array(condition).min(1) }),
    z.object({ op: z.literal('any'), of: z.array(condition).min(1) }),
    z.object({ op: z.literal('not'), of: condition }),
    z.object({ op: z.literal('cmp'), fact: z.string(), cmp: cmpOp, value: z.number() }),
    z.object({ op: z.literal('eq'), fact: z.string(), value: z.union([z.string(), z.number(), z.boolean()]) }),
    z.object({ op: z.literal('in_set'), fact: z.string(), set: z.array(z.union([z.string(), z.number()])).min(1) }),
    z.object({ op: z.literal('in_catalogue'), fact: z.string(), catalogue: z.string(), missReason: reason.optional() }),
    z.object({ op: z.literal('prefix_in'), fact: z.string(), prefixes: z.array(z.string()).min(1) }),
    z.object({ op: z.literal('exists'), fact: z.string() }),
    z.object({ op: z.literal('count_cmp'), fact: z.string(), cmp: cmpOp, value: z.number() }),
    z.object({ op: z.literal('quantifier_any'), scopeType, where: condition }),
    z.object({ op: z.literal('sum_cmp'), scopeType, fact: z.string(), cmp: cmpOp, value: z.number() }),
    z.object({ op: z.literal('fy_starts_on_or_after'), date: z.string() }),
    z.object({ op: z.literal('fy_start_year_in'), years: z.array(z.number()).min(1) }),
    z.object({ op: z.literal('year_diff_lt'), fromFact: z.string(), years: z.number() }),
    z.object({ op: z.literal('requirement_ref'), requirement: z.string(), expect: truth }),
    z.object({ op: z.literal('pack_flag'), flag: z.string() }),
  ]),
) as z.ZodType<Condition>;

const showWhen: z.ZodType<QuestionShowWhen> = z.lazy(() =>
  z
    .object({
      always: z.boolean().optional(),
      allOf: z.array(showWhen).optional(),
      anyOf: z.array(showWhen).optional(),
      factEquals: z.object({ fact: z.string(), value: z.union([z.string(), z.number(), z.boolean()]) }).optional(),
      factExists: z.object({ fact: z.string() }).optional(),
      factInSet: z.object({ fact: z.string(), set: z.array(z.string()), negate: z.boolean().optional() }).optional(),
      requirementIs: z.object({ requirement: z.string(), truth }).optional(),
      requirementResolved: z.object({ requirement: z.string() }).optional(),
    })
    .strict(),
) as z.ZodType<QuestionShowWhen>;

const sourceRecord = z.object({
  id: z.string(),
  title: z.string(),
  legalType: z.string(),
  statusAtSnapshot: z.string(),
  usedFor: z.string(),
  keyProvisions: z.string().optional(),
  url: z.string().url(),
  monitor: z.string().optional(),
});

const factType = z.object({
  id: z.string(),
  scopeType,
  dataType: z.enum(['number_or_range', 'boolean', 'boolean_or_unknown', 'enum', 'country', 'date', 'year', 'url', 'entity_list', 'item_list', 'status']),
  module: z.string(),
  reusableAcrossPrograms: z.enum(['yes', 'no', 'potentially']),
  typicalSource: z.string().optional(),
  reviewCadence: z.string().optional(),
  missingReason: reason.optional(),
  enumValues: z.array(z.string()).optional(),
  notes: z.string().optional(),
});

const requirement = z.object({
  id: z.string(),
  ruleRef: z.string().optional(),
  title: z.string(),
  program: z.string(),
  decisionArea: z.string(),
  plainEnglish: z.string(),
  scopeType,
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
  condition: condition.optional(),
  cases: z.array(z.object({ when: condition, value: z.string(), label: z.string().optional() })).optional(),
  defaultValue: z.string().optional(),
  legalStatus: z.enum(['in_force', 'adopted_not_effective', 'proposed', 'superseded']),
  ratification: z.object({ status: z.enum(['draft', 'ratified']), by: z.string().optional(), date: z.string().optional() }),
  sources: z.array(z.string()).min(1),
  provisions: z.string().optional(),
  caution: z.string().optional(),
  obligationTemplates: z.array(z.string()).optional(),
});

const obligationTemplate = z.object({
  id: z.string(),
  obligation: z.string(),
  actor: z.string(),
  trigger: z.object({ allOf: z.array(z.string()).optional(), anyOf: z.array(z.string()).optional() }),
  defaultOwnerRole: z.string(),
  deadlineLogic: z.string(),
  evidenceExpectation: z.string(),
  completionCriterion: z.string(),
});

const gapTest = z.object({
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

const question = z.object({
  id: z.string(),
  order: z.number(),
  module: z.string(),
  text: z.string(),
  factTypes: z.array(z.string()),
  showWhen,
  inputPath: z.string(),
  whyAsked: z.string(),
});

const catalogue = z.object({ entries: z.record(z.boolean()), missReason: reason, note: z.string().optional() });

const changeWatchItem = z.object({
  id: z.string(),
  title: z.string(),
  status: z.string(),
  expected: z.string().optional(),
  affectsRequirements: z.array(z.string()),
  sources: z.array(z.string()),
  note: z.string().optional(),
});

const manifest = z.object({
  id: z.string(),
  version: z.string(),
  program: z.string(),
  legalSnapshot: z.string(),
  packFlags: z.record(z.boolean()),
  changeWatch: z.array(changeWatchItem),
});

export class PackIntegrityError extends Error {
  constructor(public problems: string[]) {
    super(`Knowledge pack failed integrity checks:\n - ${problems.join('\n - ')}`);
  }
}

function collectFactRefs(c: Condition, into: Set<string>): void {
  switch (c.op) {
    case 'all':
    case 'any':
      c.of.forEach((x) => collectFactRefs(x, into));
      break;
    case 'not':
      collectFactRefs(c.of, into);
      break;
    case 'quantifier_any':
      collectFactRefs(c.where, into);
      break;
    case 'cmp':
    case 'eq':
    case 'in_set':
    case 'in_catalogue':
    case 'prefix_in':
    case 'exists':
    case 'count_cmp':
      into.add(c.fact);
      break;
    case 'sum_cmp':
      into.add(c.fact);
      break;
    case 'year_diff_lt':
      into.add(c.fromFact);
      break;
    default:
      break;
  }
}

function collectReqRefs(c: Condition, into: Set<string>): void {
  if (c.op === 'all' || c.op === 'any') c.of.forEach((x) => collectReqRefs(x, into));
  else if (c.op === 'not') collectReqRefs(c.of, into);
  else if (c.op === 'quantifier_any') collectReqRefs(c.where, into);
  else if (c.op === 'requirement_ref') into.add(c.requirement);
}

function collectCatalogueRefs(c: Condition, into: Set<string>): void {
  if (c.op === 'all' || c.op === 'any') c.of.forEach((x) => collectCatalogueRefs(x, into));
  else if (c.op === 'not') collectCatalogueRefs(c.of, into);
  else if (c.op === 'quantifier_any') collectCatalogueRefs(c.where, into);
  else if (c.op === 'in_catalogue') into.add(c.catalogue);
}

export function loadPack(dir: string): KnowledgePack {
  const read = (name: string) => JSON.parse(readFileSync(join(dir, name), 'utf8'));

  const m = manifest.parse(read('pack.json'));
  const pack: KnowledgePack = {
    ...m,
    sources: z.array(sourceRecord).parse(read('sources.json')),
    factTypes: z.array(factType).parse(read('fact-types.json')),
    requirements: z.array(requirement).parse(read('requirements.json')),
    obligationTemplates: z.array(obligationTemplate).parse(read('obligation-templates.json')),
    gapTests: z.array(gapTest).parse(read('gap-tests.json')),
    questions: z.array(question).parse(read('questionnaire.json')),
    catalogues: z.record(catalogue).parse(read('catalogues.json')),
  };
  verifyIntegrity(pack);
  return pack;
}

export function verifyIntegrity(pack: KnowledgePack): void {
  const problems: string[] = [];
  const sourceIds = new Set(pack.sources.map((s) => s.id));
  const factIds = new Set(pack.factTypes.map((f) => f.id));
  const reqIds = new Set(pack.requirements.map((r) => r.id));
  const tplIds = new Set(pack.obligationTemplates.map((t) => t.id));

  for (const r of pack.requirements) {
    for (const s of r.sources) if (!sourceIds.has(s)) problems.push(`${r.id}: cites unknown source ${s}`);
    if (r.kind === 'boolean' && !r.condition) problems.push(`${r.id}: boolean requirement missing condition`);
    if (r.kind === 'selection' && (!r.cases || r.cases.length === 0)) problems.push(`${r.id}: selection requirement missing cases`);
    const conds = [
      ...(r.condition ? [r.condition] : []),
      ...(r.cases ?? []).map((c) => c.when),
    ];
    for (const c of conds) {
      const facts = new Set<string>();
      const refs = new Set<string>();
      const cats = new Set<string>();
      collectFactRefs(c, facts);
      collectReqRefs(c, refs);
      collectCatalogueRefs(c, cats);
      for (const f of facts) if (!factIds.has(f)) problems.push(`${r.id}: references unknown FactType ${f}`);
      for (const ref of refs) if (!reqIds.has(ref)) problems.push(`${r.id}: requirement_ref to unknown requirement ${ref}`);
      for (const cat of cats) if (!pack.catalogues[cat]) problems.push(`${r.id}: references unknown catalogue ${cat}`);
    }
    for (const t of r.obligationTemplates ?? []) if (!tplIds.has(t)) problems.push(`${r.id}: references unknown obligation template ${t}`);
  }

  for (const t of pack.obligationTemplates) {
    for (const ref of [...(t.trigger.allOf ?? []), ...(t.trigger.anyOf ?? [])]) {
      if (!reqIds.has(ref)) problems.push(`${t.id}: trigger references unknown requirement ${ref}`);
    }
    if ((t.trigger.allOf ?? []).length === 0 && (t.trigger.anyOf ?? []).length === 0) {
      problems.push(`${t.id}: has no trigger — obligations must derive from determinations`);
    }
  }

  for (const g of pack.gapTests) {
    if (!tplIds.has(g.obligationTemplate)) problems.push(`${g.id}: references unknown obligation template ${g.obligationTemplate}`);
    if (g.readinessFact && !factIds.has(g.readinessFact)) problems.push(`${g.id}: references unknown FactType ${g.readinessFact}`);
  }

  for (const q of pack.questions) {
    for (const f of q.factTypes) if (!factIds.has(f)) problems.push(`${q.id}: references unknown FactType ${f}`);
  }

  for (const w of pack.changeWatch) {
    for (const r of w.affectsRequirements) if (!reqIds.has(r)) problems.push(`${w.id}: affects unknown requirement ${r}`);
    for (const s of w.sources) if (!sourceIds.has(s)) problems.push(`${w.id}: cites unknown source ${s}`);
  }

  if (problems.length > 0) throw new PackIntegrityError(problems);
}
