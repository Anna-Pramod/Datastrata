/**
 * DataStrata applicability engine — core types (schema v0).
 *
 * Design source: Pass 2 §3–4, Pass 3 §7, CSRD Applicability Pack v1.
 * Product laws enforced by these types:
 *  - three-valued truth; unknown NEVER coerces to DOES_NOT_APPLY
 *  - every determination carries a derivation trace and source citations
 *  - facts are sourced objects, not form fields; unconfirmed facts are invisible to the evaluator
 *  - requirements are data; the engine contains no program-specific code paths
 */

export type Truth = 'APPLIES' | 'DOES_NOT_APPLY' | 'INDETERMINATE';

export type ReasonCode =
  | 'missing_fact'
  | 'range_crosses_threshold'
  | 'catalogue_unknown'
  | 'source_conflict'
  | 'legal_ambiguity'
  | 'customer_scope_ambiguity'
  | 'national_law_unresolved'
  | 'upstream_indeterminate'
  | 'source_status_unresolved'
  | 'not_yet_effective';

export type ScopeType =
  | 'organization'
  | 'legal_entity'
  | 'branch'
  | 'facility'
  | 'product'
  | 'trade_lane'
  | 'supplier'
  | 'request'
  | 'counterparty';

export type RelationshipClass =
  | 'direct_legal'
  | 'direct_legal_exemption'
  | 'indirect_operational'
  | 'voluntary_commitment'
  | 'contractual'
  | 'advisory_readiness'
  | 'standard_selection'
  | 'timing_context'
  | 'legal_status_gate';

export type LegalStatus = 'in_force' | 'adopted_not_effective' | 'proposed' | 'superseded';

export type Severity = 'critical' | 'high' | 'medium' | 'low';

// ---------------------------------------------------------------------------
// Facts and profile (the private customer graph, minimal v0 slice)
// ---------------------------------------------------------------------------

export type FactValue =
  | { kind: 'number'; value: number }
  | { kind: 'range'; min: number; max: number } // inclusive bounds
  | { kind: 'boolean'; value: boolean }
  | { kind: 'string'; value: string }
  | { kind: 'date'; value: string } // ISO 8601
  | { kind: 'year'; value: number }
  | { kind: 'list'; values: string[] }
  | { kind: 'unknown' }; // explicitly recorded as unknown (distinct from absent)

export interface FactSource {
  kind: 'document' | 'registry' | 'customer_statement' | 'derived' | 'extraction';
  ref: string;
  page?: string;
  extractionConfidence?: number;
}

export interface ProfileFact {
  factType: string;
  scopeId: string;
  value: FactValue;
  source?: FactSource;
  asOf?: string;
  reviewDue?: string;
  /**
   * Trust boundary (Pack README, "OCR is candidate-fact capture"):
   * only confirmed facts are visible to the deterministic evaluator.
   * Extracted candidates default to false until a human confirms them.
   */
  confirmed: boolean;
}

export interface ScopeObject {
  id: string;
  type: ScopeType;
  name: string;
  /** Parent in the customer graph (entity -> organization, branch -> organization, request -> organization). */
  parentId?: string;
  /** Typed links that are not parent/child (e.g. a request's counterparty). */
  links?: Partial<Record<'counterparty', string>>;
}

export interface Profile {
  scopeObjects: ScopeObject[];
  facts: ProfileFact[];
}

export interface AssessmentContext {
  /** Date at which the assessment is made (drives effective-version selection). */
  assessmentDate: string;
  /** Financial year being assessed. */
  financialYear: { start: string; end: string };
  /** The scope object the customer asked to assess (report framing only; all matching scopes evaluate). */
  subjectId: string;
}

// ---------------------------------------------------------------------------
// FactType registry (shared knowledge graph vocabulary)
// ---------------------------------------------------------------------------

export type FactDataType =
  | 'number_or_range'
  | 'boolean'
  | 'boolean_or_unknown'
  | 'enum'
  | 'country'
  | 'date'
  | 'year'
  | 'url'
  | 'entity_list'
  | 'item_list'
  | 'status';

export interface FactType {
  id: string;
  scopeType: ScopeType;
  dataType: FactDataType;
  module: string;
  reusableAcrossPrograms: 'yes' | 'no' | 'potentially';
  typicalSource?: string;
  reviewCadence?: string;
  /** Reason code emitted when this fact is missing/unknown. Defaults to missing_fact. */
  missingReason?: ReasonCode;
  enumValues?: string[];
  notes?: string;
  /**
   * Human-readable label for this fact, e.g. "net turnover". Source of truth
   * for `factLabel` (verification/vocabulary.ts); a fact referenced by a
   * requirement but missing this fails the coverage gate.
   */
  label?: string;
  /**
   * Unit for numeric values, e.g. "EUR" or "employees". Required by the
   * coverage gate for any fact used in a `cmp`, `count_cmp` or `sum_cmp`
   * comparison, since `dataType` alone cannot distinguish a currency
   * threshold from a headcount threshold.
   */
  unit?: string;
  /**
   * Marks `label` as not yet resolved to confirmed legal wording. The value
   * "requires review" fails the coverage gate by design — recording
   * uncertainty is not the same as resolving it.
   */
  labelNote?: string;
}

// ---------------------------------------------------------------------------
// Closed condition language (Pass 3 §7.2 — deliberately NOT Turing-complete)
// ---------------------------------------------------------------------------

export type CmpOp = 'gt' | 'gte' | 'lt' | 'lte';

export type Condition =
  | { op: 'all'; of: Condition[] }
  | { op: 'any'; of: Condition[] }
  | { op: 'not'; of: Condition }
  | { op: 'cmp'; fact: string; cmp: CmpOp; value: number }
  | { op: 'eq'; fact: string; value: string | number | boolean }
  | { op: 'in_set'; fact: string; set: (string | number)[] }
  | { op: 'in_catalogue'; fact: string; catalogue: string; missReason?: ReasonCode }
  | { op: 'prefix_in'; fact: string; prefixes: string[] }
  | { op: 'exists'; fact: string }
  | { op: 'count_cmp'; fact: string; cmp: CmpOp; value: number }
  | { op: 'quantifier_any'; scopeType: ScopeType; where: Condition }
  | { op: 'sum_cmp'; scopeType: ScopeType; fact: string; cmp: CmpOp; value: number }
  | { op: 'fy_starts_on_or_after'; date: string }
  | { op: 'fy_start_year_in'; years: number[] }
  | { op: 'year_diff_lt'; fromFact: string; years: number }
  | { op: 'requirement_ref'; requirement: string; expect: Truth }
  | { op: 'pack_flag'; flag: string };

// ---------------------------------------------------------------------------
// Requirements (shared knowledge graph, versioned)
// ---------------------------------------------------------------------------

export interface Ratification {
  status: 'draft' | 'ratified';
  by?: string;
  date?: string;
}

export interface SelectionCase {
  when: Condition;
  value: string;
  label?: string;
}

export interface Requirement {
  id: string;
  /**
   * Content revision of this requirement, an integer >= 1 bumped by hand as
   * part of any content edit. It is what a signature's `requirementVersion`
   * pins, and `verification/requirement-versions/<packId>.json` binds each
   * version to the content hash it named — so an edit without a bump, or a
   * bump without a registration, fails the load. Generated versions were
   * rejected deliberately: they cannot tell a revision from a reformat.
   */
  version: number;
  /** Plain-English rule this executes (02_Regulatory_Rules row). */
  ruleRef?: string;
  title: string;
  program: string;
  decisionArea: string;
  plainEnglish: string;
  scopeType: ScopeType;
  relationshipClass: RelationshipClass;
  severity: Severity;
  kind: 'boolean' | 'selection';
  condition?: Condition;
  cases?: SelectionCase[];
  defaultValue?: string;
  /** Legal status of the underlying rule. Only in_force requirements may instantiate obligations. */
  legalStatus: LegalStatus;
  ratification: Ratification;
  sources: string[];
  provisions?: string;
  caution?: string;
  obligationTemplates?: string[];
}

export interface SourceRecord {
  id: string;
  title: string;
  legalType: string;
  statusAtSnapshot: string;
  usedFor: string;
  keyProvisions?: string;
  url: string;
  monitor?: string;
}

export interface ObligationTrigger {
  allOf?: string[];
  anyOf?: string[];
}

export interface ObligationTemplate {
  id: string;
  obligation: string;
  actor: string;
  trigger: ObligationTrigger;
  defaultOwnerRole: string;
  deadlineLogic: string;
  evidenceExpectation: string;
  completionCriterion: string;
}

export interface GapTest {
  id: string;
  obligationTemplate: string;
  readinessTest: string;
  readinessFact?: string;
  /** Fact values (for status facts) that count as satisfied. */
  satisfiedWhen?: string[];
  existingEvidenceToCredit: string;
  priority: Severity;
  firstAction: string;
  consequence: string;
}

export interface ChangeWatchItem {
  id: string;
  title: string;
  status: string;
  expected?: string;
  affectsRequirements: string[];
  sources: string[];
  note?: string;
}

export interface QuestionShowWhen {
  always?: boolean;
  allOf?: QuestionShowWhen[];
  anyOf?: QuestionShowWhen[];
  factEquals?: { fact: string; value: string | number | boolean };
  factExists?: { fact: string };
  factInSet?: { fact: string; set: string[]; negate?: boolean };
  requirementIs?: { requirement: string; truth: Truth };
  requirementResolved?: { requirement: string };
}

export interface Question {
  id: string;
  order: number;
  module: string;
  text: string;
  factTypes: string[];
  showWhen: QuestionShowWhen;
  inputPath: string;
  whyAsked: string;
}

export interface Catalogue {
  /** Known keys mapped to in-scope true/false. Absent key => INDETERMINATE with missReason. */
  entries: Record<string, boolean>;
  missReason: ReasonCode;
  note?: string;
}

export interface KnowledgePack {
  id: string;
  version: string;
  program: string;
  legalSnapshot: string;
  /** Knowledge-side boolean state (e.g. whether an adopted act is in force yet). */
  packFlags: Record<string, boolean>;
  sources: SourceRecord[];
  factTypes: FactType[];
  requirements: Requirement[];
  obligationTemplates: ObligationTemplate[];
  gapTests: GapTest[];
  questions: Question[];
  catalogues: Record<string, Catalogue>;
  changeWatch: ChangeWatchItem[];
}

// ---------------------------------------------------------------------------
// Engine outputs
// ---------------------------------------------------------------------------

export interface FactNeed {
  factType: string;
  scopeId: string;
  reason: ReasonCode;
}

export interface TraceNode {
  op: string;
  detail: string;
  truth: Truth;
  reason?: ReasonCode;
  children?: TraceNode[];
  factsUsed?: { factType: string; scopeId: string; value: FactValue; source?: FactSource }[];
}

export interface Determination {
  requirementId: string;
  requirementTitle: string;
  program: string;
  decisionArea: string;
  scopeId: string;
  scopeName: string;
  result: Truth;
  /** For selection-kind requirements: the selected value (e.g. applicable ESRS version). */
  selected?: string;
  relationshipClass: RelationshipClass;
  severity: Severity;
  reason?: ReasonCode;
  needs: FactNeed[];
  trace: TraceNode;
  sources: string[];
  provisions?: string;
  caution?: string;
  legalStatus: LegalStatus;
  ratificationStatus: 'draft' | 'ratified';
  evaluatedAt: string;
  packVersion: string;
}

export interface ObligationInstance {
  templateId: string;
  obligation: string;
  actor: string;
  scopeId: string;
  scopeName: string;
  defaultOwnerRole: string;
  deadlineLogic: string;
  evidenceExpectation: string;
  completionCriterion: string;
  derivedFrom: string[];
}

export interface Gap {
  gapId: string;
  obligationTemplateId: string;
  scopeId: string;
  readinessTest: string;
  status: 'open' | 'satisfied' | 'unknown';
  priority: Severity;
  firstAction: string;
  consequence: string;
  existingEvidenceToCredit: string;
}

export interface RankedQuestion {
  question: Question;
  weight: number;
  blockedDeterminations: string[];
}

export interface ProgramSummary {
  program: string;
  headline: string;
  statusFlags: string[];
  nationalLawResolved: boolean;
}

export interface AssessmentResult {
  context: AssessmentContext;
  determinations: Determination[];
  obligations: ObligationInstance[];
  gaps: Gap[];
  nextQuestions: RankedQuestion[];
  summary: ProgramSummary;
  changeWatch: ChangeWatchItem[];
  /** True when any content used is draft (unratified) — customer outputs must surface this. */
  containsDraftContent: boolean;
}
