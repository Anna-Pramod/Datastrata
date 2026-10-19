/**
 * The dashboard's view model — what the page prints, computed from the record
 * and the pack, kept out of the page so it can be tested without rendering.
 *
 * **Status is read, never assumed.** Each requirement's `derivedStatus` and
 * `statusReasons` come from the pack as the site loaded it — the signature
 * ledger projected through the freshness resolver in `lib/pack.ts` — and are
 * copied onto the row unchanged. Over the real repository every row reads
 * `draft`; that is a fact about the ledger, not a constant of this file, and
 * the test proves it by signing one requirement in a fixture repository and
 * watching one row move.
 *
 * **Facts are shown as stated.** Every fact in the document becomes a row with
 * its source, its confirmation and its value formatted without added
 * precision: a range stays a range, a stated unknown says so, an unconfirmed
 * extraction is marked as one the evaluator never saw. Nothing is inferred
 * from a fact's absence.
 */

import type {
  AssessmentResult,
  DerivedStatus,
  FactSource,
  FactType,
  FactValue,
  KnowledgePack,
  ReasonCode,
  ScopeType,
  StatusReason,
  Truth,
} from '@datastrata/engine';
import type { ProfileDocument } from '@/lib/profile';

export interface EntityColumn {
  id: string;
  name: string;
  /** The chart's column label: the record's short name, else the scope object's name. */
  short: string;
}

/** The legal entities of the profile, in profile order. */
export function entityColumns(document: ProfileDocument): EntityColumn[] {
  return document.profile.scopeObjects
    .filter((scope) => scope.type === 'legal_entity')
    .map((scope) => ({ id: scope.id, name: scope.name, short: document.record.shortNames?.[scope.id] ?? scope.name }));
}

export interface EntityResult {
  result: Truth;
  reason?: ReasonCode;
  selected?: string;
}

export interface RequirementStatusRow {
  id: string;
  title: string;
  version: number;
  scopeType: ScopeType;
  status: DerivedStatus;
  reasons: StatusReason[];
  /** The determination for each requested scope object; absent where the requirement is not of that scope type. */
  results: Record<string, EntityResult | undefined>;
}

/** One row per requirement in pack order, its status as loaded, its result per scope object. */
export function requirementStatusRows(
  pack: KnowledgePack,
  assessment: AssessmentResult,
  scopeIds: readonly string[],
): RequirementStatusRow[] {
  return pack.requirements.map((requirement) => {
    const results: Record<string, EntityResult | undefined> = {};
    for (const scopeId of scopeIds) {
      const determination = assessment.determinations.find(
        (d) => d.requirementId === requirement.id && d.scopeId === scopeId,
      );
      results[scopeId] =
        determination === undefined
          ? undefined
          : {
              result: determination.result,
              ...(determination.reason === undefined ? {} : { reason: determination.reason }),
              ...(determination.selected === undefined ? {} : { selected: determination.selected }),
            };
    }
    return {
      id: requirement.id,
      title: requirement.title,
      version: requirement.version,
      scopeType: requirement.scopeType,
      status: requirement.derivedStatus,
      reasons: [...requirement.statusReasons],
      results,
    };
  });
}

/** How many requirements the loaded pack carries at each status. */
export function statusSummary(pack: KnowledgePack): Record<DerivedStatus, number> {
  const summary: Record<DerivedStatus, number> = { draft: 0, verified: 0, ratified: 0 };
  for (const requirement of pack.requirements) summary[requirement.derivedStatus] += 1;
  return summary;
}

/** Digit groups by thousands, locale-independent: the same string on every machine. */
function thousands(n: number): string {
  const [whole, fraction] = String(n).split('.');
  const grouped = (whole ?? '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return fraction === undefined ? grouped : `${grouped}.${fraction}`;
}

/** A value as stated, with the fact type's unit where one is declared. */
export function formatFactValue(value: FactValue, factType?: Pick<FactType, 'unit'>): string {
  const unit = factType?.unit === undefined ? '' : ` ${factType.unit}`;
  switch (value.kind) {
    case 'number':
      return `${thousands(value.value)}${unit}`;
    case 'range':
      return `${thousands(value.min)} – ${thousands(value.max)}${unit}`;
    case 'boolean':
      return value.value ? 'yes' : 'no';
    case 'string':
      return value.value;
    case 'date':
      return value.value;
    case 'year':
      return String(value.value);
    case 'list':
      return value.values.join(', ');
    case 'unknown':
      return 'unknown (stated)';
  }
}

function formatSource(source: FactSource | undefined): string {
  if (source === undefined) return 'no source stated';
  const parts = [source.kind.replace(/_/g, ' '), source.ref];
  if (source.page !== undefined) parts.push(`p. ${source.page}`);
  return parts.join(' · ');
}

export interface FactRow {
  scopeId: string;
  scopeName: string;
  factType: string;
  label: string;
  value: string;
  source: string;
  confirmed: boolean;
  asOf?: string;
}

/** Every fact in the document, in document order, with its source. */
export function factRows(document: ProfileDocument, pack: Pick<KnowledgePack, 'factTypes'>): FactRow[] {
  const scopes = new Map(document.profile.scopeObjects.map((scope) => [scope.id, scope]));
  const factTypes = new Map(pack.factTypes.map((factType) => [factType.id, factType]));
  return document.profile.facts.map((fact) => {
    const factType = factTypes.get(fact.factType);
    return {
      scopeId: fact.scopeId,
      scopeName: scopes.get(fact.scopeId)?.name ?? fact.scopeId,
      factType: fact.factType,
      label: factType?.label ?? fact.factType,
      value: formatFactValue(fact.value, factType),
      source: formatSource(fact.source),
      confirmed: fact.confirmed,
      ...(fact.asOf === undefined ? {} : { asOf: fact.asOf }),
    };
  });
}
