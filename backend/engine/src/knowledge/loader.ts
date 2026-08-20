/**
 * Knowledge-pack loader + content firewall.
 *
 * Every pack is validated structurally (zod) and referentially before the
 * engine will touch it: unknown FactTypes, dangling source citations,
 * requirement_refs to nothing, obligation triggers pointing at missing
 * requirements — all are load-time errors, never runtime surprises. A
 * referenced FactType with no human label, an unresolved `labelNote`, or
 * (where it is compared numerically) no unit is the same kind of failure —
 * see `assertFactVocabularyCoverage` — so it is gated here too, not left to
 * surface downstream as a wrong-looking rendered sentence.
 * This is the first layer of "regression testing for law" (Pass 2 §4).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import type { Condition, KnowledgePack } from '../types';
import { assertFactVocabularyCoverage } from '../verification/vocabulary';
import { requirementSha256 } from '../verification/canonical';
import { assertVersionIntegrity, parseVersionRegistry, VersionIntegrityError } from '../verification/registry';
import {
  catalogueSchema,
  factTypeSchema,
  gapTestSchema,
  manifestSchema,
  obligationTemplateSchema,
  questionSchema,
  requirementSchema,
  sourceRecordSchema,
} from './schema';

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

/**
 * Where the version registry lives, relative to a pack directory.
 *
 * The registry sits under `verification/`, not beside the authored content it
 * polices — a hash file shelved next to regulatory knowledge invites being
 * read as knowledge. Packs live at `<engine>/knowledge/<packId>`, so the
 * registry is two levels up. The convention is expressed once, here, and can
 * be overridden per call rather than being re-derived at each call site.
 */
function defaultVersionRegistryDir(packDir: string): string {
  return join(packDir, '..', '..', 'verification', 'requirement-versions');
}

export interface LoadPackOptions {
  /** Overrides the directory holding `<packId>.json`. Defaults to the convention above. */
  versionRegistryDir?: string;
}

/**
 * Reads the registry and asserts every requirement still hashes to the digest
 * recorded against its declared `version`.
 *
 * A missing registry file is a failure rather than a skipped check. Treating
 * absence as "nothing to verify" would mean the one action that disables
 * version integrity everywhere — deleting a file — is also the one action
 * that produces no complaint, and an integrity check that can be switched off
 * by accident is not an integrity check.
 */
function assertRequirementVersions(pack: KnowledgePack, registryDir: string): void {
  const path = join(registryDir, `${pack.id}.json`);
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    throw new VersionIntegrityError([
      `no version registry for pack ${pack.id} at ${path} — every requirement's version is unverifiable without it`,
    ]);
  }
  assertVersionIntegrity(pack.requirements, parseVersionRegistry(JSON.parse(raw)), requirementSha256);
}

export function loadPack(dir: string, options: LoadPackOptions = {}): KnowledgePack {
  const read = (name: string) => JSON.parse(readFileSync(join(dir, name), 'utf8'));

  const m = manifestSchema.parse(read('pack.json'));
  const pack: KnowledgePack = {
    ...m,
    sources: z.array(sourceRecordSchema).parse(read('sources.json')),
    factTypes: z.array(factTypeSchema).parse(read('fact-types.json')),
    requirements: z.array(requirementSchema).parse(read('requirements.json')),
    obligationTemplates: z.array(obligationTemplateSchema).parse(read('obligation-templates.json')),
    gapTests: z.array(gapTestSchema).parse(read('gap-tests.json')),
    questions: z.array(questionSchema).parse(read('questionnaire.json')),
    catalogues: z.record(catalogueSchema).parse(read('catalogues.json')),
  };
  verifyIntegrity(pack);
  assertFactVocabularyCoverage(pack);
  assertRequirementVersions(pack, options.versionRegistryDir ?? defaultVersionRegistryDir(dir));
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
