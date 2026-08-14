/**
 * The free checker's question set, and the translation from answers to an
 * engine Profile.
 *
 * Every option here maps to a fact the CSRD pack actually consumes. Nothing is
 * asked that cannot change a determination, and nothing is invented: an "I'm not
 * sure" answer omits the fact entirely so the engine reports `missing_fact`
 * rather than guessing. The deliberately-straddling bands (€400m–€600m,
 * 800–1,500 employees) exist so the engine can demonstrate the behaviour that
 * defines the product — an honest INDETERMINATE with the exact fact that would
 * resolve it.
 */

export type FactValueInput =
  | { kind: 'number'; value: number }
  | { kind: 'range'; min: number; max: number }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'string'; value: string };

export interface CheckerAnswers {
  country?: string;
  legalForm?: string;
  groupPosition?: 'standalone' | 'parent' | 'subsidiary' | 'parent_and_subsidiary';
  turnover?: string;
  employees?: string;
}

export interface Option {
  id: string;
  label: string;
  hint?: string;
}

export const EU_COUNTRIES: Option[] = [
  { id: 'AT', label: 'Austria' }, { id: 'BE', label: 'Belgium' }, { id: 'BG', label: 'Bulgaria' },
  { id: 'HR', label: 'Croatia' }, { id: 'CY', label: 'Cyprus' }, { id: 'CZ', label: 'Czechia' },
  { id: 'DK', label: 'Denmark' }, { id: 'EE', label: 'Estonia' }, { id: 'FI', label: 'Finland' },
  { id: 'FR', label: 'France' }, { id: 'DE', label: 'Germany' }, { id: 'GR', label: 'Greece' },
  { id: 'HU', label: 'Hungary' }, { id: 'IE', label: 'Ireland' }, { id: 'IT', label: 'Italy' },
  { id: 'LV', label: 'Latvia' }, { id: 'LT', label: 'Lithuania' }, { id: 'LU', label: 'Luxembourg' },
  { id: 'MT', label: 'Malta' }, { id: 'NL', label: 'Netherlands' }, { id: 'PL', label: 'Poland' },
  { id: 'PT', label: 'Portugal' }, { id: 'RO', label: 'Romania' }, { id: 'SK', label: 'Slovakia' },
  { id: 'SI', label: 'Slovenia' }, { id: 'ES', label: 'Spain' }, { id: 'SE', label: 'Sweden' },
];

export const NON_EU_COUNTRIES: Option[] = [
  { id: 'GB', label: 'United Kingdom' }, { id: 'US', label: 'United States' },
  { id: 'CH', label: 'Switzerland' }, { id: 'NO', label: 'Norway' },
  { id: 'IN', label: 'India' }, { id: 'CN', label: 'China' },
  { id: 'JP', label: 'Japan' }, { id: 'TR', label: 'Türkiye' },
  { id: 'BR', label: 'Brazil' }, { id: 'CA', label: 'Canada' },
  { id: 'AU', label: 'Australia' }, { id: 'ZA', label: 'South Africa' },
];

export const LEGAL_FORMS: Option[] = [
  { id: 'private_limited_company', label: 'Private limited company', hint: 'Ltd, GmbH, BV, SARL, SAS…' },
  { id: 'public_limited_company', label: 'Public limited company', hint: 'PLC, AG, NV, SA…' },
  { id: 'listed_company', label: 'Listed company', hint: 'securities admitted to an EU regulated market' },
  { id: 'partnership_all_members_limited', label: 'Partnership, all members limited' },
  { id: 'credit_institution', label: 'Bank or credit institution' },
  { id: 'insurance_undertaking', label: 'Insurance undertaking' },
  { id: 'sole_trader', label: 'Sole trader' },
  { id: 'other', label: 'Something else', hint: 'routes to analyst review, never silently out of scope' },
];

export const GROUP_POSITIONS: Option[] = [
  { id: 'standalone', label: 'Standalone', hint: 'no parent, no subsidiaries' },
  { id: 'parent', label: 'Parent of a group', hint: 'prepares consolidated accounts' },
  { id: 'subsidiary', label: 'Subsidiary', hint: 'consolidated into a parent' },
  { id: 'parent_and_subsidiary', label: 'Both', hint: 'an intermediate parent' },
];

export interface BandOption extends Option {
  /** Omitted entirely when the user says they do not know. */
  value?: FactValueInput;
}

export const TURNOVER_BANDS: BandOption[] = [
  { id: 'lt50', label: 'Under €50m', value: { kind: 'range', min: 0, max: 50_000_000 } },
  { id: '50-450', label: '€50m – €450m', value: { kind: 'range', min: 50_000_000, max: 450_000_000 } },
  { id: '400-600', label: '€400m – €600m', hint: 'crosses the threshold', value: { kind: 'range', min: 400_000_000, max: 600_000_000 } },
  { id: 'gt600', label: 'Over €600m', value: { kind: 'range', min: 600_000_000, max: 100_000_000_000 } },
  { id: 'unknown', label: "I'm not sure" },
];

export const EMPLOYEE_BANDS: BandOption[] = [
  { id: 'lt250', label: 'Under 250', value: { kind: 'range', min: 0, max: 250 } },
  { id: '250-1000', label: '250 – 1,000', value: { kind: 'range', min: 250, max: 1_000 } },
  { id: '800-1500', label: '800 – 1,500', hint: 'crosses the threshold', value: { kind: 'range', min: 800, max: 1_500 } },
  { id: 'gt1500', label: 'Over 1,500', value: { kind: 'range', min: 1_500, max: 5_000_000 } },
  { id: 'unknown', label: "I'm not sure" },
];

/** The financial year the free check assesses. Stated on the result, never hidden. */
export const CHECK_FINANCIAL_YEAR = { start: '2027-01-01', end: '2027-12-31' };

interface FactInput {
  factType: string;
  scopeId: string;
  value: FactValueInput;
  confirmed: true;
  source: { kind: 'customer_statement'; ref: string };
}

const stated = (factType: string, scopeId: string, value: FactValueInput): FactInput => ({
  factType,
  scopeId,
  value,
  // Answers typed into a public checker are customer statements, not sourced
  // documents. They are confirmed (the user asserted them) but the result is
  // labelled preliminary because nothing here is evidenced.
  confirmed: true,
  source: { kind: 'customer_statement', ref: 'Free checker answer' },
});

/**
 * Build the minimal scope graph + facts the CSRD pack needs. Unanswered
 * questions contribute no facts at all — that is what makes the engine say
 * `missing_fact` instead of assuming a value.
 */
export function buildAssessmentInput(answers: CheckerAnswers, assessmentDate: string) {
  const entityId = 'e1';
  const orgId = 'org1';
  const facts: FactInput[] = [];

  if (answers.country) {
    facts.push(stated('entity.incorporation_country', entityId, { kind: 'string', value: answers.country }));
    facts.push(stated('entity.governing_member_state', entityId, { kind: 'string', value: answers.country }));
  }
  if (answers.legalForm) {
    facts.push(stated('entity.legal_form', entityId, { kind: 'string', value: answers.legalForm }));
  }
  if (answers.groupPosition) {
    const isParent = answers.groupPosition === 'parent' || answers.groupPosition === 'parent_and_subsidiary';
    const isSubsidiary = answers.groupPosition === 'subsidiary' || answers.groupPosition === 'parent_and_subsidiary';
    facts.push(stated('entity.is_parent_undertaking', entityId, { kind: 'boolean', value: isParent }));
    facts.push(stated('entity.is_subsidiary', entityId, { kind: 'boolean', value: isSubsidiary }));
  }

  const turnover = TURNOVER_BANDS.find((b) => b.id === answers.turnover)?.value;
  if (turnover) {
    facts.push(stated('entity.net_turnover_eur', entityId, turnover));
    // A parent's consolidated threshold runs on group figures; the checker only
    // has the one number, so it is applied at group level too and the result
    // says so rather than pretending the two were measured separately.
    if (answers.groupPosition === 'parent' || answers.groupPosition === 'parent_and_subsidiary') {
      facts.push(stated('group.consolidated_net_turnover_eur', orgId, turnover));
    }
  }

  const employees = EMPLOYEE_BANDS.find((b) => b.id === answers.employees)?.value;
  if (employees) {
    facts.push(stated('entity.avg_employees', entityId, employees));
    if (answers.groupPosition === 'parent' || answers.groupPosition === 'parent_and_subsidiary') {
      facts.push(stated('group.avg_employees', orgId, employees));
    }
  }

  return {
    profile: {
      scopeObjects: [
        { id: orgId, type: 'organization' as const, name: 'Your organisation' },
        { id: entityId, type: 'legal_entity' as const, name: 'Your entity', parentId: orgId },
      ],
      facts,
    },
    context: {
      assessmentDate,
      financialYear: CHECK_FINANCIAL_YEAR,
      subjectId: entityId,
    },
  };
}

/**
 * Requirements the checker surfaces, in the order a reader should meet them.
 *
 * The Article 40a third-country gate (S-007) is added for a non-EU entity.
 * Without it such an entity reads a clean "does not apply" on every row, when
 * the route that actually catches non-EU groups is the one the free check never
 * asked about — a silent negative in all but name. Shown, the engine states it
 * plainly: unresolved, and here are the facts that would settle it. For an EU
 * entity the gate is genuinely not its route, so it stays off the card list.
 */
const BASE_REQUIREMENTS = ['CSRD-S-014', 'CSRD-S-001', 'CSRD-S-002', 'CSRD-S-015', 'CSRD-S-013'];

export function headlineRequirements(answers: CheckerAnswers): string[] {
  const isEu = Boolean(answers.country && EU_COUNTRIES.some((c) => c.id === answers.country));
  if (isEu) return BASE_REQUIREMENTS;
  return [...BASE_REQUIREMENTS.slice(0, 3), 'CSRD-S-007', ...BASE_REQUIREMENTS.slice(3)];
}

export const REASON_COPY: Record<string, string> = {
  missing_fact: 'A fact we need is missing',
  range_crosses_threshold: 'Your band crosses the legal threshold',
  catalogue_unknown: 'This value is not in our catalogue yet',
  source_conflict: 'Sources conflict',
  legal_ambiguity: 'The law is ambiguous here',
  customer_scope_ambiguity: 'The scope is ambiguous',
  national_law_unresolved: 'National law is not encoded yet',
  upstream_indeterminate: 'An earlier question is unresolved',
  source_status_unresolved: 'The legal status of a source is unresolved',
  not_yet_effective: 'The rule is not in force yet',
};

export const FACT_COPY: Record<string, string> = {
  'entity.incorporation_country': 'Country of incorporation',
  'entity.legal_form': 'Legal form',
  'entity.governing_member_state': 'Governing Member State',
  'entity.net_turnover_eur': 'Exact net turnover',
  'entity.avg_employees': 'Exact average headcount',
  'entity.is_parent_undertaking': 'Whether the entity is a parent',
  'entity.is_subsidiary': 'Whether the entity is a subsidiary',
  'entity.reported_csrd_fy2024': 'Whether you reported for FY2024',
  'group.consolidated_net_turnover_eur': 'Consolidated group turnover',
  'group.avg_employees': 'Group average headcount',
  'group.ultimate_parent_country': "Ultimate parent's country",
  'entity.member_state_transposition_status': 'National transposition status',
  'entity.member_state_transition_option': 'National transition option',
  'parent.report_includes_entity': 'Whether the parent report covers you',
  'parent.report_standard': 'Which standard the parent reports under',
  'third_country.eu_turnover_year_1_eur': 'Group EU turnover, prior year',
  'third_country.eu_turnover_year_2_eur': 'Group EU turnover, year before that',
  'third_country.eu_subsidiary_turnover_eur': 'EU subsidiary turnover',
  'third_country.qualifying_eu_subsidiary_exists': 'Whether a qualifying EU subsidiary exists',
  'third_country.eu_branch_turnover_eur': 'EU branch turnover',
};

export const factLabel = (id: string) => FACT_COPY[id] ?? id.split('.').pop()!.replace(/_/g, ' ');
