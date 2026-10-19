/**
 * The pilot profile — the company a record is about, read from a document and
 * validated against the pack before the engine ever sees it.
 *
 * **Why a document.** Until pilot step 1 the dashboard assessed one company
 * authored in TypeScript. A pilot needs the pilot company's own facts, stated
 * by the company with their sources, and the operator needs to be certain the
 * page shows that company and never the sample: a misconfigured path that
 * quietly rendered Meridian would be a wrong answer with a 200. So the record
 * is a document; the synthetic development profile is one such document,
 * bundled and labelled synthetic; the file `DATASTRATA_PILOT_PROFILE` names is
 * another; and both pass through the one parser below. Nothing here falls
 * back. An absent variable selects the synthetic document by name, and every
 * other failure is a refusal that says what is wrong.
 *
 * **Why the validation is referential, not only structural.** The engine's
 * `FactResolver` ignores a profile fact whose type the pack does not know, and
 * a fact stated on the wrong kind of scope object is simply never found —
 * both would render as "requires judgment" over a document that was mistyped.
 * An operator authoring a profile by hand needs those named at load time, as a
 * list of every problem, not discovered one at a time as an unexplained
 * INDETERMINATE. The same boundary refuses what the engine would misread
 * rather than reject: a parent chain that cycles (the resolver would walk it
 * forever), a range stated max to min, a date the calendar does not have, and
 * a fact without a non-blank source reference, which the record promises
 * beside every fact. Nothing is inferred or defaulted: an explicitly unknown value
 * stays unknown, an unconfirmed fact stays unconfirmed and invisible to the
 * evaluator, and an unknown key is refused rather than stripped (evidence
 * standard, failure mode 6).
 *
 * **Why the path never reaches the browser.** The page renders
 * `publicDetail`; the path and the system error travel only in
 * `operatorDetail`, which the server logs. A filesystem path printed into HTML
 * is browser-visible configuration, and the pilot keeps the profile and its
 * location out of public assets.
 *
 * Pure: no filesystem, no environment read, no clock. The server entry
 * (`lib/record.ts`) hands in the environment, the file reader and the pack.
 */

import { z } from 'zod';
import type { AssessmentContext, FactDataType, FactValue, KnowledgePack, Profile } from '@datastrata/engine';

/** The server-side variable naming the pilot profile file. Never `NEXT_PUBLIC_`. */
export const PILOT_PROFILE_ENV = 'DATASTRATA_PILOT_PROFILE';

/** A date that exists: the right shape, and a day the calendar has (no 30 February, no month 13, no 29 February outside a leap year). */
function isRealCalendarDate(text: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (match === null) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be an ISO date, YYYY-MM-DD')
  .refine(isRealCalendarDate, 'must be a real calendar date');

/** The engine's `FactValue`, kind by kind; `unknown` is a stated value, distinct from absent. */
const factValueSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('number'), value: z.number().finite() }).strict(),
  z.object({ kind: z.literal('range'), min: z.number().finite(), max: z.number().finite() }).strict(),
  z.object({ kind: z.literal('boolean'), value: z.boolean() }).strict(),
  z.object({ kind: z.literal('string'), value: z.string() }).strict(),
  z.object({ kind: z.literal('date'), value: isoDate }).strict(),
  z.object({ kind: z.literal('year'), value: z.number().int() }).strict(),
  z.object({ kind: z.literal('list'), values: z.array(z.string()) }).strict(),
  z.object({ kind: z.literal('unknown') }).strict(),
]);

const factSourceSchema = z
  .object({
    kind: z.enum(['document', 'registry', 'customer_statement', 'derived', 'extraction']),
    /** Non-blank: a reference of spaces names nothing. Not trimmed — the value is kept as stated. */
    ref: z.string().refine((ref) => ref.trim().length > 0, 'must not be blank'),
    page: z.string().optional(),
    extractionConfidence: z.number().min(0).max(1).optional(),
  })
  .strict();

const profileFactSchema = z
  .object({
    factType: z.string().min(1),
    scopeId: z.string().min(1),
    value: factValueSchema,
    /** Required for every stated fact, a stated unknown included: the record promises a source beside each fact. */
    source: factSourceSchema,
    asOf: isoDate.optional(),
    reviewDue: isoDate.optional(),
    confirmed: z.boolean(),
  })
  .strict();

const scopeTypeSchema = z.enum([
  'organization', 'legal_entity', 'branch', 'facility', 'product', 'trade_lane', 'supplier', 'request', 'counterparty',
]);

const scopeObjectSchema = z
  .object({
    id: z.string().min(1),
    type: scopeTypeSchema,
    name: z.string().min(1),
    parentId: z.string().min(1).optional(),
    links: z.object({ counterparty: z.string().min(1).optional() }).strict().optional(),
  })
  .strict();

const profileSchema = z
  .object({ scopeObjects: z.array(scopeObjectSchema).min(1), facts: z.array(profileFactSchema) })
  .strict();

const contextSchema = z
  .object({
    assessmentDate: isoDate,
    financialYear: z.object({ start: isoDate, end: isoDate }).strict(),
    subjectId: z.string().min(1),
  })
  .strict();

/**
 * What the record says about itself. `kind` is what the page labels the
 * record by; `note` is printed beside the label; `shortNames` are the column
 * labels of the cross-section chart, keyed by scope object, and fall back to
 * the scope object's name.
 */
const recordSchema = z
  .object({
    kind: z.enum(['synthetic', 'pilot']),
    name: z.string().min(1),
    note: z.string().min(1),
    statedOn: isoDate.optional(),
    shortNames: z.record(z.string().min(1), z.string().min(1)).optional(),
  })
  .strict();

const documentSchema = z.object({ record: recordSchema, context: contextSchema, profile: profileSchema }).strict();

type ParsedDocument = z.infer<typeof documentSchema>;

/**
 * Compile-time proof that what the schema accepts is what the engine takes.
 * A field added to the engine's `Profile` or `AssessmentContext`, or a kind
 * added to `FactValue`, that this schema does not know fails `tsc` here rather
 * than at the first pilot file that uses it.
 */
type Assert<T extends true> = T;
type _ProfileFitsEngine = Assert<ParsedDocument['profile'] extends Profile ? true : false>;
type _ContextFitsEngine = Assert<ParsedDocument['context'] extends AssessmentContext ? true : false>;
type _EveryEngineKindIsParsed = Assert<FactValue['kind'] extends ParsedDocument['profile']['facts'][number]['value']['kind'] ? true : false>;

export type ProfileRecordMeta = ParsedDocument['record'];

export interface ProfileDocument {
  record: ProfileRecordMeta;
  context: AssessmentContext;
  profile: Profile;
}

/** Where the document came from. Never the path: that is operator detail. */
export type ProfileOrigin = { kind: 'synthetic' } | { kind: 'file' };

export type ProfileProblemCode = 'unreadable' | 'invalid_json' | 'invalid_document';

/**
 * A refusal to serve a profile, in two voices. `publicDetail` is what the page
 * may print: the variable's name, what kind of failure, and for an invalid
 * document every problem by field. `operatorDetail` is for the server log and
 * may carry the path and the system error.
 */
export class ProfileConfigurationError extends Error {
  readonly code: ProfileProblemCode;
  readonly headline: string;
  readonly problems: readonly string[];
  readonly operatorDetail: string;

  constructor(code: ProfileProblemCode, headline: string, problems: readonly string[], operatorDetail: string) {
    super(`${code}: ${headline}${problems.length > 0 ? ` ${problems.join('; ')}` : ''}`);
    this.name = 'ProfileConfigurationError';
    this.code = code;
    this.headline = headline;
    this.problems = [...problems];
    this.operatorDetail = operatorDetail;
  }

  get publicDetail(): string {
    return this.problems.length === 0
      ? this.headline
      : `${this.headline} ${this.problems.map((problem) => `– ${problem}`).join(' ')}`;
  }
}

/** The value kinds each fact data type takes; `unknown` is taken by every one. */
const KINDS_FOR: Record<FactDataType, ReadonlyArray<FactValue['kind']>> = {
  number_or_range: ['number', 'range'],
  boolean: ['boolean'],
  boolean_or_unknown: ['boolean'],
  enum: ['string'],
  country: ['string'],
  date: ['date'],
  year: ['year'],
  url: ['string'],
  entity_list: ['list'],
  item_list: ['list'],
  status: ['string'],
};

/** Every problem a structurally valid document has against the pack and against itself. */
function referentialProblems(document: ParsedDocument, pack: Pick<KnowledgePack, 'factTypes'>): string[] {
  const problems: string[] = [];
  const factTypes = new Map(pack.factTypes.map((factType) => [factType.id, factType]));
  const scopes = new Map<string, ParsedDocument['profile']['scopeObjects'][number]>();

  document.profile.scopeObjects.forEach((scope, i) => {
    if (scopes.has(scope.id)) problems.push(`profile.scopeObjects[${i}]: scope object "${scope.id}" is declared twice`);
    scopes.set(scope.id, scope);
  });
  document.profile.scopeObjects.forEach((scope, i) => {
    if (scope.parentId === scope.id) {
      problems.push(`profile.scopeObjects[${i}] ("${scope.id}"): is its own parent`);
    } else if (scope.parentId !== undefined && !scopes.has(scope.parentId)) {
      problems.push(`profile.scopeObjects[${i}] ("${scope.id}"): parent "${scope.parentId}" is not a scope object in this profile`);
    } else {
      // Walk the parent chain; a return to the start is a cycle. It is reported
      // once, from its lexicographically smallest member, so a cycle of n
      // objects is one problem and not n rotations of the same one.
      const chain = [scope.id];
      const seen = new Set(chain);
      let current = scope.parentId;
      while (current !== undefined && scopes.has(current)) {
        if (current === scope.id) {
          chain.push(current);
          if (chain.slice(0, -1).every((member) => member >= scope.id)) {
            problems.push(`profile.scopeObjects[${i}] ("${scope.id}"): parent chain forms a cycle (${chain.join(' → ')})`);
          }
          break;
        }
        if (seen.has(current)) break; // leads into a cycle that does not contain this object; reported by its members
        seen.add(current);
        chain.push(current);
        current = scopes.get(current)?.parentId;
      }
    }
    const counterparty = scope.links?.counterparty;
    if (counterparty !== undefined && !scopes.has(counterparty)) {
      problems.push(`profile.scopeObjects[${i}] ("${scope.id}"): counterparty "${counterparty}" is not a scope object in this profile`);
    }
  });

  if (!scopes.has(document.context.subjectId)) {
    problems.push(`context.subjectId: "${document.context.subjectId}" is not a scope object in this profile`);
  }
  if (document.context.financialYear.end < document.context.financialYear.start) {
    problems.push('context.financialYear: ends before it starts');
  }
  for (const scopeId of Object.keys(document.record.shortNames ?? {})) {
    if (!scopes.has(scopeId)) problems.push(`record.shortNames: "${scopeId}" is not a scope object in this profile`);
  }

  const stated = new Set<string>();
  document.profile.facts.forEach((fact, i) => {
    const where = `profile.facts[${i}] (${fact.factType} on ${fact.scopeId})`;
    const factType = factTypes.get(fact.factType);
    const scope = scopes.get(fact.scopeId);
    if (factType === undefined) problems.push(`${where}: fact type "${fact.factType}" is not in the pack`);
    if (scope === undefined) problems.push(`${where}: scope object "${fact.scopeId}" is not in this profile`);
    if (factType !== undefined && scope !== undefined && factType.scopeType !== scope.type) {
      problems.push(
        `${where}: fact type "${fact.factType}" is stated of a ${factType.scopeType}, but "${fact.scopeId}" is a ${scope.type}`,
      );
    }
    if (fact.value.kind === 'range' && fact.value.min > fact.value.max) {
      problems.push(`${where}: range min ${fact.value.min} exceeds max ${fact.value.max}; a range is stated min to max`);
    }
    if (factType !== undefined && fact.value.kind !== 'unknown' && !KINDS_FOR[factType.dataType].includes(fact.value.kind)) {
      problems.push(
        `${where}: a value of kind "${fact.value.kind}" does not fit fact type "${fact.factType}" (${factType.dataType})`,
      );
    }
    const key = `${fact.factType}::${fact.scopeId}`;
    if (stated.has(key)) problems.push(`${where}: "${fact.factType}" is stated twice for "${fact.scopeId}"`);
    stated.add(key);
  });

  return problems;
}

/**
 * A document, or a refusal naming every problem. Structure first (the schema,
 * strict), then the references a structurally valid document makes to the
 * pack and to itself. The headline is origin-neutral; `loadProfileDocument`
 * re-voices it for the file it read.
 */
export function parseProfileDocument(input: unknown, pack: Pick<KnowledgePack, 'factTypes'>): ProfileDocument {
  const headline = 'The profile document does not describe a profile this pack can assess.';
  const structural = documentSchema.safeParse(input);
  if (!structural.success) {
    const problems = structural.error.issues.map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`);
    throw new ProfileConfigurationError('invalid_document', headline, problems, problems.join('; '));
  }
  const problems = referentialProblems(structural.data, pack);
  if (problems.length > 0) {
    throw new ProfileConfigurationError('invalid_document', headline, problems, problems.join('; '));
  }
  return structural.data;
}

export interface ProfileDeps {
  /** Reads a file's text, or throws. Handed in so the parser stays pure and the test can refuse by name. */
  readFile: (path: string) => string;
  /** The bundled synthetic development document, parsed like any other. */
  synthetic: unknown;
  pack: Pick<KnowledgePack, 'factTypes'>;
}

/**
 * The document the environment selects: the synthetic one when the variable is
 * unset, otherwise the named file. Every failure after the variable is set is a
 * refusal — a set variable means the operator intended a file, and the sample
 * is never substituted for it.
 */
export function loadProfileDocument(
  env: Readonly<Record<string, string | undefined>>,
  deps: ProfileDeps,
): { origin: ProfileOrigin; document: ProfileDocument } {
  const configured = env[PILOT_PROFILE_ENV];
  if (configured === undefined) {
    return { origin: { kind: 'synthetic' }, document: parseProfileDocument(deps.synthetic, deps.pack) };
  }

  const path = configured.trim();
  if (path === '') {
    throw new ProfileConfigurationError(
      'unreadable',
      `${PILOT_PROFILE_ENV} is set but blank. Name a profile file, or unset it to render the synthetic development profile.`,
      [],
      `${PILOT_PROFILE_ENV} is set but blank`,
    );
  }

  let text: string;
  try {
    text = deps.readFile(path);
  } catch (error) {
    throw new ProfileConfigurationError(
      'unreadable',
      `The profile file named by ${PILOT_PROFILE_ENV} could not be read. The server log carries the path and the system error.`,
      [],
      `${path}: ${String(error)}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new ProfileConfigurationError(
      'invalid_json',
      `The profile file named by ${PILOT_PROFILE_ENV} is not valid JSON.`,
      [error instanceof Error ? error.message : String(error)],
      `${path}: ${String(error)}`,
    );
  }

  try {
    return { origin: { kind: 'file' }, document: parseProfileDocument(parsed, deps.pack) };
  } catch (error) {
    if (!(error instanceof ProfileConfigurationError)) throw error;
    throw new ProfileConfigurationError(
      error.code,
      `The profile file named by ${PILOT_PROFILE_ENV} does not describe a profile this pack can assess.`,
      error.problems,
      `${path}: ${error.operatorDetail}`,
    );
  }
}
