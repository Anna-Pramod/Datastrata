/**
 * The free check — eight questions, each one a fact the CSRD pack actually
 * consumes, and the translation from answers to an engine Profile.
 *
 * Nothing is asked that cannot move a determination, and nothing is invented:
 * an "I'm not sure" answer omits the fact entirely, so the engine reports
 * `missing_fact` rather than guessing. The straddling bands (€400m–€600m,
 * 800–1,500) exist so the evaluator can demonstrate the behaviour that defines
 * the product — an honest INDETERMINATE naming the fact that would resolve it.
 *
 * Question numbering follows the pack's own questionnaire: Q-003, Q-004, Q-005,
 * Q-007, Q-008, Q-011, Q-014 / Q-012.
 */

export type FactValueInput =
  | { kind: 'number'; value: number }
  | { kind: 'range'; min: number; max: number }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'string'; value: string };

export type GroupPosition = 'standalone' | 'parent' | 'subsidiary' | 'parent_and_subsidiary';

export interface CheckerAnswers {
  country?: string;
  legalForm?: string;
  financialYear?: string;
  groupPosition?: GroupPosition;
  turnover?: string;
  employees?: string;
  reportedFy2024?: string;
  parentReport?: string;
  /** EU entities: whether the governing Member State is the country of incorporation. */
  governingChoice?: 'same' | 'other' | 'unknown';
  /** Only meaningful when governingChoice === 'other'. */
  governingState?: string;
  /** Non-EU entities: the Article 40a EU-turnover test over the last two financial years. */
  euTurnover?: 'both' | 'one' | 'neither' | 'unknown';
}

export interface Option { id: string; label: string; hint?: string }

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
  { id: 'CH', label: 'Switzerland' }, { id: 'NO', label: 'Norway' }, { id: 'IN', label: 'India' },
  { id: 'CN', label: 'China' }, { id: 'JP', label: 'Japan' }, { id: 'TR', label: 'Türkiye' },
  { id: 'BR', label: 'Brazil' }, { id: 'CA', label: 'Canada' }, { id: 'AU', label: 'Australia' },
  { id: 'ZA', label: 'South Africa' }, { id: 'KR', label: 'South Korea' }, { id: 'AE', label: 'United Arab Emirates' },
];

export const LEGAL_FORMS: Option[] = [
  { id: 'private_limited_company', label: 'Private limited company', hint: 'Ltd · GmbH · BV · SARL · SAS' },
  { id: 'public_limited_company', label: 'Public limited company', hint: 'PLC · AG · NV · SA' },
  { id: 'listed_company', label: 'Listed company', hint: 'admitted to an EU regulated market' },
  { id: 'partnership_all_members_limited', label: 'Partnership, all members limited' },
  { id: 'credit_institution', label: 'Bank or credit institution' },
  { id: 'insurance_undertaking', label: 'Insurance undertaking' },
  { id: 'sole_trader', label: 'Sole trader' },
  { id: 'other', label: 'Something else', hint: 'routes to analyst review, never silently out of scope' },
];

export const FINANCIAL_YEARS: Option[] = [
  { id: '2025', label: 'FY 2025' },
  { id: '2026', label: 'FY 2026' },
  { id: '2027', label: 'FY 2027' },
  { id: '2028', label: 'FY 2028' },
];

export const GROUP_POSITIONS: Option[] = [
  { id: 'standalone', label: 'Standalone', hint: 'no parent, no subsidiaries' },
  { id: 'parent', label: 'Parent of a group', hint: 'prepares consolidated accounts' },
  { id: 'subsidiary', label: 'Subsidiary', hint: 'consolidated into a parent' },
  { id: 'parent_and_subsidiary', label: 'Both', hint: 'an intermediate parent' },
];

export interface BandOption extends Option { value?: FactValueInput }

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

export const GOVERNING_CHOICES: Option[] = [
  { id: 'same', label: 'The country it is incorporated in', hint: 'the usual case' },
  { id: 'other', label: 'A different Member State' },
  { id: 'unknown', label: "I'm not sure" },
];

/**
 * Article 40a turns on EU turnover exceeding EUR 450m in EACH of the last two
 * financial years, so "only one year" is a genuine, definitive no — not a
 * missing fact. The options make that distinction available.
 */
export const EU_TURNOVER_OPTIONS: BandOption[] = [
  { id: 'both', label: 'Yes — in both of the last two years' },
  { id: 'one', label: 'In one year only', hint: 'the test needs both' },
  { id: 'neither', label: 'No — under €450m' },
  { id: 'unknown', label: "I'm not sure" },
];

export const YES_NO_UNSURE: Option[] = [
  { id: 'yes', label: 'Yes' },
  { id: 'no', label: 'No' },
  { id: 'unknown', label: "I'm not sure" },
];

export const isEu = (code?: string) => Boolean(code && EU_COUNTRIES.some((c) => c.id === code));

/** Step 8 changes shape for a subsidiary — the exemption route is the live question. */
export const stepEightIsParentReport = (a: CheckerAnswers) =>
  a.groupPosition === 'subsidiary' || a.groupPosition === 'parent_and_subsidiary';

const OVER_450M = { kind: 'range', min: 450_000_001, max: 100_000_000_000 } as const;
const UNDER_450M = { kind: 'range', min: 0, max: 450_000_000 } as const;

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
  // documents. Confirmed (the user asserted them), but the report says plainly
  // that nothing here is evidenced.
  confirmed: true,
  source: { kind: 'customer_statement', ref: 'Free check answer' },
});

export function buildAssessmentInput(answers: CheckerAnswers, assessmentDate: string) {
  const entityId = 'e1';
  const orgId = 'org1';
  const facts: FactInput[] = [];
  const isGroupParent = answers.groupPosition === 'parent' || answers.groupPosition === 'parent_and_subsidiary';

  if (answers.country) {
    facts.push(stated('entity.incorporation_country', entityId, { kind: 'string', value: answers.country }));
    // Q-012, asked properly at step 8 for an EU entity. "Not sure" contributes no
    // fact at all, so the engine reports it as unresolved rather than assuming
    // the country of incorporation.
    const governing =
      answers.governingChoice === 'other' ? answers.governingState
      : answers.governingChoice === 'unknown' ? undefined
      : answers.governingChoice === 'same' ? answers.country
      : undefined;
    if (governing && isEu(governing)) {
      facts.push(stated('entity.governing_member_state', entityId, { kind: 'string', value: governing }));
    }
  }
  if (answers.legalForm) {
    facts.push(stated('entity.legal_form', entityId, { kind: 'string', value: answers.legalForm }));
  }
  if (answers.groupPosition) {
    facts.push(stated('entity.is_parent_undertaking', entityId, { kind: 'boolean', value: isGroupParent }));
    facts.push(stated('entity.is_subsidiary', entityId, {
      kind: 'boolean',
      value: answers.groupPosition === 'subsidiary' || answers.groupPosition === 'parent_and_subsidiary',
    }));
  }

  const turnover = TURNOVER_BANDS.find((b) => b.id === answers.turnover)?.value;
  if (turnover) {
    facts.push(stated('entity.net_turnover_eur', entityId, turnover));
    // A parent's consolidated route runs on group figures. The check has one
    // number, so it is applied at group level too — and the report says that.
    if (isGroupParent) facts.push(stated('group.consolidated_net_turnover_eur', orgId, turnover));
  }

  const employees = EMPLOYEE_BANDS.find((b) => b.id === answers.employees)?.value;
  if (employees) {
    facts.push(stated('entity.avg_employees', entityId, employees));
    if (isGroupParent) facts.push(stated('group.avg_employees', orgId, employees));
  }

  // Article 40a route, for a non-EU entity (step 8 on that path).
  if (answers.country && !isEu(answers.country)) {
    // The entity is the top of its own group in these two cases, so its country
    // IS the ultimate parent's. For a subsidiary we genuinely do not know, and
    // the engine correctly reports that as a missing fact.
    if (answers.groupPosition === 'standalone' || answers.groupPosition === 'parent') {
      facts.push(stated('group.ultimate_parent_country', orgId, { kind: 'string', value: answers.country }));
    }
    const t = answers.euTurnover;
    if (t === 'both') {
      facts.push(stated('third_country.eu_turnover_year_1_eur', orgId, OVER_450M));
      facts.push(stated('third_country.eu_turnover_year_2_eur', orgId, OVER_450M));
    } else if (t === 'one') {
      facts.push(stated('third_country.eu_turnover_year_1_eur', orgId, OVER_450M));
      facts.push(stated('third_country.eu_turnover_year_2_eur', orgId, UNDER_450M));
    } else if (t === 'neither') {
      facts.push(stated('third_country.eu_turnover_year_1_eur', orgId, UNDER_450M));
      facts.push(stated('third_country.eu_turnover_year_2_eur', orgId, UNDER_450M));
    }
  }

  if (answers.reportedFy2024 === 'yes' || answers.reportedFy2024 === 'no') {
    facts.push(stated('entity.reported_csrd_fy2024', entityId, { kind: 'boolean', value: answers.reportedFy2024 === 'yes' }));
  }
  if (answers.parentReport === 'yes' || answers.parentReport === 'no') {
    facts.push(stated('parent.report_includes_entity', entityId, { kind: 'boolean', value: answers.parentReport === 'yes' }));
  }

  const year = Number(answers.financialYear ?? '2027');
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
      financialYear: { start: `${year}-01-01`, end: `${year}-12-31` },
      subjectId: entityId,
    },
  };
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
  'entity.member_state_transposition_status': 'National transposition status',
  'entity.member_state_transition_option': 'National transition option',
  'entity.national_publication_conditions_met': 'National publication conditions',
  'group.consolidated_net_turnover_eur': 'Consolidated group turnover',
  'group.avg_employees': 'Group average headcount',
  'group.ultimate_parent_country': "Ultimate parent's country",
  'group.reporting_perimeter_entities': 'Group reporting perimeter',
  'parent.report_includes_entity': 'Whether the parent report covers you',
  'parent.report_standard': 'Which standard the parent reports under',
  'parent.report_public_url': "The parent report's publication URL",
  'parent.assurance_opinion_available': 'Parent assurance opinion',
  'parent.taxonomy_information_included': 'Parent taxonomy information',
  'third_country.eu_turnover_year_1_eur': 'Group EU turnover, prior year',
  'third_country.eu_turnover_year_2_eur': 'Group EU turnover, year before that',
  'third_country.eu_subsidiary_turnover_eur': 'EU subsidiary turnover',
  'third_country.qualifying_eu_subsidiary_exists': 'Whether a qualifying EU subsidiary exists',
  'third_country.eu_branch_turnover_eur': 'EU branch turnover',
  'reporting.first_reporting_year': 'First reporting year',
  'reporting.value_chain_info_unavailable': 'Value-chain data availability',
};

export const factLabel = (id: string) => FACT_COPY[id] ?? id.split('.').pop()!.replace(/_/g, ' ');
