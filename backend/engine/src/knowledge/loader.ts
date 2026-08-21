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
import type { Condition, KnowledgePack, Requirement } from '../types';
import { assertFactVocabularyCoverage } from '../verification/vocabulary';
import { requirementSha256 } from '../verification/canonical';
import { assertVersionIntegrity, parseVersionRegistry, VersionIntegrityError } from '../verification/registry';
import { governingEntry, parseLedger } from '../verification/ledger';
import { deriveStatus } from '../verification/status';
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
 * Where the verification records live, relative to a pack directory.
 *
 * They sit under `verification/`, not beside the authored content they police
 * — a hash file or a signature ledger shelved next to regulatory knowledge
 * invites being read as knowledge. Packs live at `<engine>/knowledge/<packId>`,
 * so the directory is two levels up. The convention is expressed once, here,
 * and each path can be overridden per call rather than re-derived at each call
 * site.
 */
function defaultVerificationDir(packDir: string): string {
  return join(packDir, '..', '..', 'verification');
}

/** `verification/requirement-versions/<packId>.json` — the version registry. */
function defaultVersionRegistryDir(packDir: string): string {
  return join(defaultVerificationDir(packDir), 'requirement-versions');
}

/** The append-only signature ledger, under the same `verification/` root. */
function defaultLedgerPath(packDir: string): string {
  return join(defaultVerificationDir(packDir), 'signatures.jsonl');
}

export interface LoadPackOptions {
  /** Overrides the directory holding `<packId>.json`. Defaults to the convention above. */
  versionRegistryDir?: string;
  /** Overrides `verification/signatures.jsonl`. An absent file is an empty ledger. */
  ledgerPath?: string;
}

/** A requirement as the file authored it, before the loader projects a status. */
type AuthoredRequirement = Omit<Requirement, 'derivedStatus' | 'statusReasons'>;

/**
 * Every requirement's status, projected from the ledger at load time.
 *
 * **The loader answers from the ledger and from nothing else, and that boundary
 * is deliberate.** Staleness is the other axis of the §7 projection, and
 * computing it needs the corpus, the rendered condition and the pinned
 * verification result — none of which `loadPack` reads. Pulling them in would
 * make every page load depend on the corpus being intact, which is a far larger
 * change than this migration, and answering with a *partial* staleness set
 * would be worse still: a "fresh" claim from a check that only looked at half
 * the world. So a governing signature is reported at its own `kind`, and drift
 * is detected where the bytes are — the sign CLI's post-write check and the
 * review sheet, both of which call `deriveStaleness` and then this same
 * `deriveStatus`.
 *
 * An absent ledger file is an empty ledger: nothing has been signed, so every
 * requirement is `draft` with no reasons. A ledger that exists but cannot be
 * parsed is **not** treated as empty — `parseLedger` throws and the load fails,
 * because a damaged history reading as "nothing signed" is the one failure mode
 * an append-only record exists to prevent.
 */
function attachDerivedStatus(
  packId: string,
  requirements: AuthoredRequirement[],
  ledgerFile: string,
): Requirement[] {
  let text: string;
  try {
    text = readFileSync(ledgerFile, 'utf8');
  } catch {
    text = '';
  }
  const entries = parseLedger(text);
  return requirements.map((r) => ({ ...r, ...deriveStatus(governingEntry(entries, packId, r.id), []) }));
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
  // Kept unparsed as well as parsed: zod strips unknown keys, so a deleted
  // authored field such as `ratification` is invisible in the parsed record and
  // has to be looked for in what the file actually said.
  const authoredRequirements: unknown[] = read('requirements.json');
  const pack: KnowledgePack = {
    ...m,
    sources: z.array(sourceRecordSchema).parse(read('sources.json')),
    factTypes: z.array(factTypeSchema).parse(read('fact-types.json')),
    requirements: attachDerivedStatus(
      m.id,
      z.array(requirementSchema).parse(authoredRequirements),
      options.ledgerPath ?? defaultLedgerPath(dir),
    ),
    obligationTemplates: z.array(obligationTemplateSchema).parse(read('obligation-templates.json')),
    gapTests: z.array(gapTestSchema).parse(read('gap-tests.json')),
    questions: z.array(questionSchema).parse(read('questionnaire.json')),
    catalogues: z.record(catalogueSchema).parse(read('catalogues.json')),
  };
  verifyIntegrity(pack, authoredRequirements);
  assertFactVocabularyCoverage(pack);
  assertRequirementVersions(pack, options.versionRegistryDir ?? defaultVersionRegistryDir(dir));
  return pack;
}

/**
 * Referential integrity, plus the one check the schema cannot make.
 *
 * `authored` is the requirement records **as the file wrote them**, before zod
 * stripped what it does not declare. It matters for exactly one rule: a
 * `ratification` left behind after status became derived would otherwise be
 * discarded in silence, since `requirementSchema` is not `.strict()` and the
 * content hash is taken over the parsed record. Verified during the migration —
 * dropping the field from the schema produced the same `requirementSha256`
 * whether or not the data still carried it, so nothing else in the system can
 * see the leftover.
 *
 * It defaults to `pack.requirements`, so a pack object constructed in code
 * rather than read from disk is checked on the same rule.
 */
export function verifyIntegrity(pack: KnowledgePack, authored: readonly unknown[] = pack.requirements): void {
  const problems: string[] = [];
  const sourceIds = new Set(pack.sources.map((s) => s.id));

  for (const record of authored) {
    if (typeof record !== 'object' || record === null || !('ratification' in record)) continue;
    const id = (record as { id?: unknown }).id;
    problems.push(
      `${typeof id === 'string' ? id : 'a requirement'}: carries an asserted \`ratification\` field — ` +
        'status is derived from the signature ledger and may not be authored; delete the field',
    );
  }

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
