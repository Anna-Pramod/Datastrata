/**
 * The capture harness's own account of included usage (plan 2026-09-25,
 * D-5, D-6; Task 5b).
 *
 * Why a module of its own, importing nothing: this account is the backstop to
 * `claude-code-cli@2`'s projection. The projection refuses a launch that
 * reports overage, exhaustion, credits, the paid long-context route or fast
 * mode (D-7), and the harness then reads the same stream again, here, and
 * withholds a run the projection let through (`IncludedUsageUnconfirmed`). A
 * backstop built from the projection's own readers would agree with every
 * defect in them (TEST-EVIDENCE-STANDARD failure mode 1), so nothing here is
 * imported from the projection, the transport, the runner or the harness —
 * not even a type (Task 5b, a parent decision P-5b-1, stricter than the
 * plan's "imports only types from `claude-code-cli.ts`"); the fields are
 * re-read by name, as literals, and a static test (`included-usage.test.ts`)
 * holds every import this file may ever gain to `import type`. The rules
 * below say what D-6 and D-5 say, as Task 2's parent decisions (R1-R4, S2,
 * S7, U1, U2) refined them; where they differ from the projection on
 * purpose, the block after the constants says so.
 *
 * It is also where the two stops no projection rule covers are decided:
 * `long_context_boundary` (D-5) and `unnatural_reset` (D-6), which the
 * harness applies in flight, after each launch the projection accepted.
 *
 * Pure: no filesystem, network or clock. The one time it reads is each launch
 * line's `at`, the instant the harness took from its injectable clock when it
 * filed the launch.
 */

type Rec = Record<string, unknown>;

// ---------------------------------------------------------------------------
// What D-6 names, as literals
// ---------------------------------------------------------------------------

/** D-6's included windows. */
const INCLUDED_RATE_LIMIT_TYPES: ReadonlySet<unknown> = new Set(['five_hour', 'seven_day', 'seven_day_opus', 'seven_day_sonnet']);
/** The statuses a rate-limit reading is understood under: D-6's two allowed ones, and `rejected`, which is exhaustion. */
const RECOGNISED_STATUSES: ReadonlySet<unknown> = new Set(['allowed', 'allowed_warning', 'rejected']);
/** D-7 rule 3's kinds. */
const CREDIT_KINDS: ReadonlySet<string> = new Set(['model_requires_usage_credits', 'long_context_credits_required', 'consent_unanswered']);
/** The top-level fields an API-error kind may sit in, in the order read (review repairs R2 and S7). */
const API_ERROR_KIND_FIELDS = ['error', 'apiError', 'api_error'] as const;
/** D-6's own overage fields: inside a window their names are not refused as names, only their values (review repair U1). */
const OVERAGE_FIELD_NAMES: ReadonlySet<string> = new Set(['isUsingOverage', 'overageInUse', 'overageStatus']);
/** The `rate_limit_info` fields a reading copies, each only where present. */
const RATE_LIMIT_FIELDS = [
  'status',
  'rateLimitType',
  'resetsAt',
  'isUsingOverage',
  'overageInUse',
  'overageStatus',
  'rateLimitGraceActive',
  'utilization',
  'errorCode',
  'unifiedWindows',
  'surpassedThreshold',
  'overageScope',
  'canUserPurchaseCredits',
  'hasChargeableSavedPaymentMethod',
] as const;
/**
 * D-5's per-request context ceiling, in tokens: the plan's proposed value,
 * for the user to confirm. 2.1.280 says a request over a 200K-token context
 * needs usage credits; this stops short of that boundary.
 */
const CONTEXT_CEILING_TOKENS = 190_000;
/** The count label for a block type or system subtype that is not a string. */
const NOT_A_STRING = '<not a string>';
/** Every usage stop carries this, word for word (D-6). */
export const USAGE_STOP_NOTE = 'a resume is a new, separately approved execution';

/*
 * Where these rules deliberately differ from the projection's (recorded for
 * the checkpoint):
 *
 * - Only included usage is read. The projection's other rules are not
 *   mirrored: D-7 rules 5 (substitution), 6 (refusal), 7 (truncation) and 9
 *   (other API-error kinds); D-8's lifecycle walk and its allowlists, the CLI
 *   version, `permissionMode`, `terminal_reason`, the `modelUsage` count, the
 *   tool-call and stop-reason rules; and review repairs R5, R6/S3, U3, U4,
 *   U5, U6, S1 and S8. A recorded limitation: a projection defect on any of
 *   those rules is not caught by this backstop.
 * - `is_using_overage` and `overage_status_not_rejected` are kind `overage`
 *   for any value present other than the allowed one (`false`, `"rejected"`).
 *   The projection classifies only `true`, and "allowed" or
 *   "allowed_warning", as overage (rule 1) and refuses other values as
 *   unobserved (D-8 step 6). An absent value at the top level is kind
 *   `unobserved` here, as there.
 * - `rate_limit_type_not_included` is kind `overage` for any value or name
 *   containing "overage", case-insensitively; the projection classifies only
 *   `rateLimitType` "overage" as overage and refuses other overage names as
 *   unobserved. The scan of names inside a window skips the string value of
 *   a `rateLimitType` key, which the type rule already reads at every depth,
 *   so one value is one fact (the projection lists it twice in one refusal).
 * - `utilization_over_1` keeps the plan's name and also covers a negative or
 *   non-number utilization (review repairs S2, R3).
 * - `rate_limit_unobserved` per launch asks for one object `rate_limit_info`
 *   whose status is "allowed", "allowed_warning" or "rejected": a launch
 *   whose one event is rejected has no per-launch fact, since
 *   `rate_limit_rejected` reports it. The projection refuses a launch with no
 *   event at all (D-8 step 6). A `unifiedWindows` entry that is not an object
 *   is a `rate_limit_unobserved` fact of its own, and every object inside it
 *   (an array entry's) is still held to facts 1-8 at its own path, as the
 *   projection's `windowObjectsOf` reads it (Task 5b review repair R1); the
 *   projection refuses such an entry by its shape.
 * - Fast mode and the betas are read at every init and every result event,
 *   one entry per event (Task 5b review repair R4): the projection's rules 8
 *   and 4 read every such line in classification, before its walk and its
 *   result check refuse a second one, which are not mirrored. The CLI version
 *   is the first init's, the record. No init event is no `fast_mode_init`
 *   fact and no result event no `fast_mode_result` fact; the projection
 *   refuses both streams by lifecycle.
 * - `credits_required` is one fact per credit kind a carrier reports, not the
 *   first.
 * - `long_context_route` mirrors D-7 rule 4 (Task 5b, a parent decision
 *   P-5b-2): the plan's fifteen facts did not name it, and the [1m] route is
 *   paid.
 * - `long_context_boundary` (D-5) and `unnatural_reset` (D-6) have no
 *   projection rule at all; they are the harness's in-flight stops.
 * - The context figure is per request (Task 5b, a parent decision P-5b-3): a
 *   cache field that is absent, or is not a non-negative integer, counts 0,
 *   and a usage without a non-negative integer `input_tokens` counts nothing.
 *   The result's usage, which may sum the tool loop's requests, is read only
 *   when no message usage counted.
 * - `unnatural_reset` compares a window's readings by name: a top-level
 *   reading by its `rateLimitType`, a window object by its own
 *   `rateLimitType` (array form included), and a `unifiedWindows` entry of
 *   the object form by its key when it names none; a nested object is named
 *   only by its own type. A window named neither way (array form, no type) is
 *   not compared: a recorded limitation. A reading's reset time is one it
 *   reports itself — the event's `resetsAt` for the top-level reading, whose
 *   `rateLimitType` names that reset's window, and a window object's own,
 *   never its event's (Task 5b review repair R2); its `utilization` is its
 *   own. Each named window carries a state across the events of this launch
 *   and earlier ones (Task 5b review repair N1): its time gate, the finite
 *   reset time it reported itself in the most recent event that reported
 *   one, and its utilization, the finite one from the most recent event that
 *   reported one — each the smallest where that event reported several, each
 *   kept past an event that reports none, and each with where it was
 *   reported. Every reading of an event is compared with the state as it
 *   stood before that event, never with another reading of the same event
 *   (Task 5b review repair R3), and the state moves only after the whole
 *   event: an own reset time earlier than the gate, or a utilization lower
 *   than the state's, while the launch is before the gate, is a fact. So a
 *   window an event reports twice, at the top level and in `unifiedWindows`,
 *   is never compared with itself, and a utilization that falls across a
 *   reading reporting none is still seen. A recorded limitation: a window
 *   that has never reported its own reset time has no gate, so neither its
 *   reset nor its utilization is judged, and no fact is made. "Before" is
 *   judged at the launch line's `at`, the instant the harness filed the
 *   launch after it ended. A recorded limitation (Task 5b review repair M5, a
 *   parent comment-only edit): a reading inside a launch that straddles a
 *   window's reset is therefore judged after that reset, so an unnatural
 *   reset reported there makes no fact; this direction fails open.
 * - A rate-limit fact's `resetsAt` (facts 1-8) is the reading's own, else its
 *   event's, a null counting as no report (U2). A name found in a window
 *   takes the reset time of the innermost object holding it, else its
 *   event's, and a string no object holds, in an array entry, its event's
 *   (Task 5b review repair N2); an object-form key naming overage takes its
 *   entry's, else its event's. `unnatural_reset` carries the reading's own
 *   only, `null` when it reports none (R2).
 * - A recorded limitation (Task 5b review repairs R15 and N3, a parent
 *   decision P-5b-11, extended): the harness files each launch line's
 *   observation redacted as its stream sanitiser redacts outside the model's
 *   output — the value of every key it redacts by name, wherever it sits in a
 *   subtree copied here, and every string that matches an email pattern or
 *   carries the inherited HOME or USER value — and the facts are computed
 *   from the lines as filed. A value under such a key — a string naming
 *   overage, an object carrying a status, a window nested under an `orgId`
 *   key — is therefore read by no rule here, except that an object-form
 *   `unifiedWindows` entry whose own key is one of them is filed as the string
 *   `[REDACTED]` and so read as an entry that is not an object: a false
 *   `rate_limit_unobserved` fact on a run the projection accepted, failing
 *   closed (Task 5b review repair M7, a parent comment-only edit). A replaced
 *   string is read as
 *   `[REDACTED]`: a status, a type or an overage status so replaced (a short
 *   inherited USER value could do it) is a fact of another kind, never none,
 *   but a "rejected" so replaced is not read as exhaustion. The projection,
 *   which reads the raw stream, still reads both. So when it refuses such a
 *   launch as exhausted, the filed `usageStop` can lack the exhausted fact,
 *   and with it the reset time the reset-pending check holds a new
 *   execution to; the launch is still refused (Task 5b review repair N7).
 *   This limitation covers every rule a replaced string affects (Task 5b
 *   review repair O3, a parent decision P-5b-13): a replaced credit kind, a
 *   `[1m]` model, a context-1M beta or a window string naming overage leaves
 *   no fact at all while the projection still refuses the launch; a replaced
 *   "off" or "standard" makes a false `fast_mode` fact on a clean run; a
 *   replaced rate-limit status, type or overage status becomes a fact of
 *   another kind; and a replaced "rejected" loses the exhaustion and its
 *   reset hold.
 * - A recorded limitation (Task 5b review repair O3, a parent decision
 *   P-5b-13): a window reported in two positions with different values, in
 *   events that alternate between reporting both and reporting one, can make
 *   a false in-flight `unnatural_reset` stop, since the state kept from an
 *   event that reported both is the smallest of the two. A false stop fails
 *   closed; how 2.1.280 reports windows is a probe question.
 * - A recorded limitation (Task 5b review repair O3, a parent decision
 *   P-5b-13): the harness renames only a count map's keys. A key inside a
 *   copied subtree that matches the email pattern or carries the inherited
 *   HOME or USER value is not renamed, so `onLaunch`'s leak check still
 *   refuses that launch line, and that launch's facts, a rejected window's
 *   reset hold among them, are filed nowhere. It fails closed: the projection
 *   still judges the launch.
 * - A recorded limitation (Task 5b review repair O3, a parent decision
 *   P-5b-13): the value rule depends on the inherited USER and HOME. An
 *   operator whose USER or HOME is contained in any literal these rules
 *   compare — "rejected", "allowed", "allowed_warning", "five_hour",
 *   "seven_day", "seven_day_opus", "seven_day_sonnet", "overage", "standard",
 *   "off", the three credit kinds, "claude-opus-5-5" — would meet the
 *   replaced-string limitation above on every launch. That both are contained
 *   in none of them is a precondition for the user to confirm before the
 *   first `@2` execution; nothing here enforces it.
 * - Two notes (Task 5b review repair M7, a parent comment-only edit):
 *   `apiErrors[].kinds` files every string of `error`, `apiError` and
 *   `api_error` as reported, as the projection reads them, so a
 *   human-readable message there would be filed (which field 2.1.280 fills,
 *   and with what, is a probe question); and a reading's `line` counts the
 *   non-blank stdout lines, as the filed stream does, where the projection
 *   counts raw stdout lines, so a fact's detail and the projection's refusal
 *   can name different lines for one event.
 */

// ---------------------------------------------------------------------------
// The observation
// ---------------------------------------------------------------------------

/** One stdout line as the harness parsed it: the event, or `null` for a line that was not one JSON object. */
export interface UsageStreamLine {
  event: Record<string, unknown> | null;
}

/** A model the stream reports. `line` is the line of the filed stream, one per non-blank stdout line. `model` is absent where the event names none. */
export interface ModelReading {
  line: number;
  where: string;
  model?: unknown;
  onApiError: boolean;
}

/** One `rate_limit_event`: the named fields of its `rate_limit_info`, each only where present, or what it is instead of an object. */
export interface RateLimitReading {
  line: number;
  info: Rec | null;
  /** `null` when `rate_limit_info` is an object; otherwise "absent", "null", "an array", "a string" and so on. */
  notAnObject: string | null;
}

/** The fields of an init or result event whose names begin with `fast_mode`, as reported. */
export interface FastModeEventReading {
  line: number;
  fields: Rec;
}

/** An own `speed` of a usage object, where it sits, and whether that is an API-error item's usage. */
export interface SpeedReading {
  line: number;
  where: string;
  speed: unknown;
  onApiError: boolean;
}

export interface FastModeReading {
  /** Every init event's `fast_mode*` fields, one entry per init event, in order; empty when there is none (Task 5b review repair R4). */
  init: FastModeEventReading[];
  /** Every result event's `fast_mode*` fields, one entry per result event, in order; empty when there is none (R4). */
  result: FastModeEventReading[];
  speeds: SpeedReading[];
}

/** An init event's `betas`, as reported: absent when the event states none. */
export interface InitBetasReading {
  line: number;
  betas?: unknown;
}

/** A stop the stream reports: the reason where one is reported, and the category, never the explanation. */
export interface StopReading {
  line: number;
  where: string;
  reason?: unknown;
  /** `stop_details.category`. */
  category?: unknown;
  /** On a `model_refusal_no_fallback` event, or an API-error carrier of kind `safety_monitor_blocked`. */
  apiRefusalCategory?: unknown;
}

/** An API-error carrier and every string kind it carries, in field order. */
export interface ApiErrorReading {
  line: number;
  where: string;
  kinds: string[];
}

/**
 * What one launch's stream says about included usage, as reported: absent
 * stays absent, and nothing is defaulted. Never a model's output — no delta
 * text, block or message content, `result` or `structured_output` — and never
 * a stop or refusal explanation.
 */
export interface UsageObservation {
  reportedModels: ModelReading[];
  /** The first init event's `claude_code_version`, the record; `null` when there is no init event, absent when the first states none. */
  cliVersion?: unknown;
  /** Every init event's `betas`, one entry per init event, in order; empty when there is none (Task 5b review repair R4). */
  initBetas: InitBetasReading[];
  rateLimits: RateLimitReading[];
  fastMode: FastModeReading;
  stops: StopReading[];
  apiErrors: ApiErrorReading[];
  /** How many `content_block_start` events opened a block of each type. */
  blockTypes: Record<string, number>;
  /** How many system events carried each subtype. */
  systemSubtypes: Record<string, number>;
  /** The largest per-request context the launch reports, or the result's figure when no request reports one; `null` when neither does. */
  reportedContextTokens: number | null;
}

const isRecord = (value: unknown): value is Rec => typeof value === 'object' && value !== null && !Array.isArray(value);
const hasOwn = (value: Rec, key: string): boolean => Object.hasOwn(value, key);
const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0;
const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** What a value is, when it is not an object. */
function whatItIs(value: unknown): string {
  if (value === undefined) return 'absent';
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'an array';
  return `a ${typeof value}`;
}

/** A value as reported, for a detail: absent, or its JSON. */
const shown = (value: unknown): string => (value === undefined ? 'absent' : JSON.stringify(value));

function modelReading(line: number, where: string, holder: Rec | null, onApiError: boolean): ModelReading {
  return { line, where, ...(holder !== null && hasOwn(holder, 'model') ? { model: holder['model'] } : {}), onApiError };
}

function fastModeFieldsOf(event: Rec): Rec {
  return Object.fromEntries(Object.entries(event).filter(([key]) => key.startsWith('fast_mode')));
}

/** One request's context: input plus both cache figures, or `null` when the usage reports no input count. */
function perRequestContext(usage: Rec): number | null {
  const input = usage['input_tokens'];
  if (!isCount(input)) return null;
  const counted = (key: string): number => {
    const value = usage[key];
    return isCount(value) ? value : 0;
  };
  return input + counted('cache_creation_input_tokens') + counted('cache_read_input_tokens');
}

const largest = (current: number | null, next: number | null): number | null => (next === null ? current : current === null ? next : Math.max(current, next));

function increment(counts: Map<string, number>, key: unknown): void {
  const label = typeof key === 'string' ? key : NOT_A_STRING;
  counts.set(label, (counts.get(label) ?? 0) + 1);
}

/**
 * Reads what a launch's stream reports about included usage. Never throws:
 * a stream that says nothing observes nothing.
 */
export function observeUsage(parsed: readonly UsageStreamLine[]): UsageObservation {
  const reportedModels: ModelReading[] = [];
  const rateLimits: RateLimitReading[] = [];
  const speeds: SpeedReading[] = [];
  const stops: StopReading[] = [];
  const apiErrors: ApiErrorReading[] = [];
  const blockTypes = new Map<string, number>();
  const systemSubtypes = new Map<string, number>();
  const inits: FastModeEventReading[] = [];
  const results: FastModeEventReading[] = [];
  const initBetas: InitBetasReading[] = [];
  let firstInit: Rec | null = null;
  let perRequest: number | null = null;
  let fromResult: number | null = null;

  for (let i = 0; i < parsed.length; i += 1) {
    const event = parsed[i]!.event;
    if (event === null) continue;
    const line = i + 1;
    const type = event['type'];
    const inner = type === 'stream_event' && isRecord(event['event']) ? event['event'] : null;
    const innerType = inner === null ? undefined : inner['type'];
    const message = type === 'assistant' && isRecord(event['message']) ? event['message'] : null;
    const onApiError = type === 'assistant' && event['is_api_error_message'] === true;
    const subtype = type === 'system' ? event['subtype'] : undefined;

    // Models, where the projection's reportedModels reads them. Every init and every result event is read, as the
    // projection's rules 4 and 8 read them (Task 5b review repair R4); the CLI version is the first init's.
    if (type === 'system' && subtype === 'init') {
      reportedModels.push(modelReading(line, 'init.model', event, false));
      inits.push({ line, fields: fastModeFieldsOf(event) });
      initBetas.push({ line, ...(hasOwn(event, 'betas') ? { betas: event['betas'] } : {}) });
      if (firstInit === null) firstInit = event;
    }
    if (inner !== null && innerType === 'message_start') reportedModels.push(modelReading(line, 'message_start message.model', isRecord(inner['message']) ? inner['message'] : null, false));
    if (type === 'assistant') reportedModels.push(modelReading(line, 'assistant message.model', message, onApiError));
    if (type === 'result') {
      results.push({ line, fields: fastModeFieldsOf(event) });
      const modelUsage = event['modelUsage'];
      if (isRecord(modelUsage)) {
        for (const [key, entry] of Object.entries(modelUsage)) {
          reportedModels.push({ line, where: 'result.modelUsage key', model: key, onApiError: false });
          if (isRecord(entry) && hasOwn(entry, 'canonicalModel')) reportedModels.push({ line, where: `result.modelUsage[${JSON.stringify(key)}].canonicalModel`, model: entry['canonicalModel'], onApiError: false });
        }
      }
    }

    // Rate limits: the named fields, only where present.
    if (type === 'rate_limit_event') {
      const info = event['rate_limit_info'];
      if (isRecord(info)) {
        const copied: Rec = {};
        for (const field of RATE_LIMIT_FIELDS) if (hasOwn(info, field)) copied[field] = info[field];
        rateLimits.push({ line, info: copied, notAnObject: null });
      } else {
        rateLimits.push({ line, info: null, notAnObject: whatItIs(info) });
      }
    }

    // Usage objects: their speeds, and the per-request context.
    const usages: { where: string; usage: Rec; request: boolean }[] = [];
    if (type === 'result' && isRecord(event['usage'])) usages.push({ where: 'result usage', usage: event['usage'], request: false });
    if (message !== null && isRecord(message['usage'])) usages.push({ where: 'assistant message.usage', usage: message['usage'], request: true });
    if (inner !== null && innerType === 'message_start' && isRecord(inner['message']) && isRecord(inner['message']['usage'])) usages.push({ where: 'message_start message.usage', usage: inner['message']['usage'], request: true });
    if (inner !== null && innerType === 'message_delta' && isRecord(inner['usage'])) usages.push({ where: 'message_delta usage', usage: inner['usage'], request: false });
    for (const { where, usage, request } of usages) {
      if (hasOwn(usage, 'speed')) speeds.push({ line, where, speed: usage['speed'], onApiError: where === 'assistant message.usage' && onApiError });
      if (request) perRequest = largest(perRequest, perRequestContext(usage));
      else if (where === 'result usage') fromResult = largest(fromResult, perRequestContext(usage));
    }

    // API errors, on the two carriers the projection reads them on.
    let kinds: string[] = [];
    if (onApiError || (type === 'system' && subtype === 'api_error')) {
      kinds = API_ERROR_KIND_FIELDS.map((field) => event[field]).filter((value): value is string => typeof value === 'string');
      apiErrors.push({ line, where: onApiError ? 'assistant API-error item' : 'system api_error', kinds });
    }
    const safetyBlocked = kinds.includes('safety_monitor_blocked');
    const refusalCategory = (): Rec => (hasOwn(event, 'apiRefusalCategory') ? { apiRefusalCategory: event['apiRefusalCategory'] } : {});
    const categoryOf = (details: unknown): Rec => (isRecord(details) && hasOwn(details, 'category') ? { category: details['category'] } : {});
    const reported = (reason: unknown): boolean => reason !== null && reason !== undefined;

    // Stops: the reason and the category, never the explanation.
    if (inner !== null && innerType === 'message_delta' && isRecord(inner['delta'])) {
      const delta = inner['delta'];
      if (reported(delta['stop_reason'])) stops.push({ line, where: 'message_delta', reason: delta['stop_reason'], ...categoryOf(delta['stop_details']) });
    }
    if (type === 'assistant') {
      const reason = message === null ? undefined : message['stop_reason'];
      if (reported(reason) || safetyBlocked) {
        stops.push({ line, where: 'assistant message', ...(reported(reason) ? { reason } : {}), ...categoryOf(message === null ? undefined : message['stop_details']), ...(safetyBlocked ? refusalCategory() : {}) });
      }
    }
    if (type === 'system' && subtype === 'api_error' && safetyBlocked) stops.push({ line, where: 'system api_error', ...refusalCategory() });
    if (type === 'system' && subtype === 'model_refusal_no_fallback') stops.push({ line, where: 'system model_refusal_no_fallback', ...refusalCategory() });
    if (type === 'result' && reported(event['stop_reason'])) stops.push({ line, where: 'result', reason: event['stop_reason'], ...categoryOf(event['stop_details']) });

    // Counts.
    if (inner !== null && innerType === 'content_block_start') increment(blockTypes, isRecord(inner['content_block']) ? inner['content_block']['type'] : undefined);
    if (type === 'system') increment(systemSubtypes, subtype);
  }

  return {
    reportedModels,
    ...(firstInit === null ? { cliVersion: null } : hasOwn(firstInit, 'claude_code_version') ? { cliVersion: firstInit['claude_code_version'] } : {}),
    initBetas,
    rateLimits,
    fastMode: { init: inits, result: results, speeds },
    stops,
    apiErrors,
    blockTypes: Object.fromEntries(blockTypes),
    systemSubtypes: Object.fromEntries(systemSubtypes),
    reportedContextTokens: perRequest ?? fromResult,
  };
}

// ---------------------------------------------------------------------------
// The facts
// ---------------------------------------------------------------------------

/** What a usage stop is, highest priority first (Task 5b, a parent decision P-5b-4): the costliest fact decides. */
export type UsageStopKind = 'overage' | 'exhausted' | 'unnatural_reset' | 'credits' | 'long_context_route' | 'long_context_boundary' | 'fast_mode' | 'unobserved';
export const USAGE_STOP_KINDS: readonly UsageStopKind[] = ['overage', 'exhausted', 'unnatural_reset', 'credits', 'long_context_route', 'long_context_boundary', 'fast_mode', 'unobserved'];

/** The sixteen facts, in their fixed order: D-6's fifteen as the plan names them, and the long-context route (P-5b-2). */
export const USAGE_FACTS = [
  'rate_limit_rejected',
  'is_using_overage',
  'overage_in_use',
  'overage_status_not_rejected',
  'rate_limit_type_not_included',
  'grace_active',
  'utilization_over_1',
  'rate_limit_error_code',
  'rate_limit_unobserved',
  'fast_mode_init',
  'fast_mode_result',
  'speed_not_standard',
  'credits_required',
  'long_context_route',
  'long_context_boundary',
  'unnatural_reset',
] as const;
export type UsageFactName = (typeof USAGE_FACTS)[number];

/** One fact against included usage, on one launch. `detail` names the field and the value as reported, never model output. */
export interface UsageFact {
  fact: UsageFactName;
  kind: UsageStopKind;
  seq: number;
  role: string | null;
  index: number | null;
  detail: string;
  /** A rate-limit fact's reading's `resetsAt`, as reported (its own, else its event's; U2); for a name found in a window, the innermost holding object's, else its event's (Task 5b review repair N2); for `unnatural_reset`, the reading's own only (Task 5b review repair R2); `null` for any other fact, or none reported. */
  resetsAt: unknown;
}

/** The structural minimum of a harness launch line this module reads. */
export interface UsageLine {
  seq: number;
  kind: string;
  role: string | null;
  index: number | null;
  at: string;
  observed: UsageObservation | null;
}

/** A fact found on a launch, before it is placed: by its event's line (end of launch for a launch-level fact), then by the fixed fact order. */
interface Found {
  position: number;
  order: number;
  fact: UsageFactName;
  kind: UsageStopKind;
  detail: string;
  resetsAt: unknown;
}

/** Where a reading was reported: its launch and its event's line. */
interface ReportedAt {
  seq: number;
  line: number;
}

/** One reading of a named window in the event being read. */
interface WindowReading {
  id: string;
  path: string;
  /** The reset time the reading reports itself, never one borrowed from its event (Task 5b review repair R2); `null` when it reports none. */
  resetsAt: unknown;
  utilization: unknown;
}

/**
 * What a named window has reported, carried from event to event (Task 5b review repair N1): each value is the
 * one from the most recent earlier event that reported one for the window — the smallest, where that event
 * reported several — with where it was reported, and is kept past an event that reports none; `null` while no
 * event has.
 */
interface WindowState {
  /** The time gate: a finite reset time the window reported itself (R2). */
  gate: (ReportedAt & { resetsAt: number }) | null;
  /** A finite utilization the window reported. */
  utilization: (ReportedAt & { utilization: number }) | null;
}

/** Where a compared value was reported, for a detail. */
const reportedAt = ({ seq, line }: ReportedAt): string => `as reported at launch ${seq} line ${line}`;

const ORDER: ReadonlyMap<string, number> = new Map(USAGE_FACTS.map((fact, i) => [fact, i + 1]));
const namesOverage = (value: unknown): boolean => typeof value === 'string' && /overage/i.test(value);
const reportedOrNull = (value: unknown): unknown => value ?? null;
const pathKey = (key: string): string => (/^[A-Za-z_$][\w$]*$/.test(key) ? `.${key}` : `[${JSON.stringify(key)}]`);

/** Every object in a value at any depth, through arrays and objects alike, each with where it sits; the value itself first. */
function objectsIn(value: unknown, where: string): { where: string; object: Rec }[] {
  if (Array.isArray(value)) return value.flatMap((item, i) => objectsIn(item, `${where}[${i}]`));
  if (!isRecord(value)) return [];
  return [{ where, object: value }, ...Object.entries(value).flatMap(([key, inner]) => objectsIn(inner, `${where}${pathKey(key)}`))];
}

/** A `unifiedWindows` value's entries, each with its path and, for the object form, its key; `null` when it is neither an array nor an object. */
function windowEntries(windows: unknown): { path: string; key: string | null; entry: unknown }[] | null {
  if (Array.isArray(windows)) return windows.map((entry, i) => ({ path: `[${i}]`, key: null, entry }));
  if (isRecord(windows)) return Object.entries(windows).map(([key, entry]) => ({ path: `[${JSON.stringify(key)}]`, key, entry }));
  return null;
}

/** Every string naming overage in a value reached through arrays alone: an object ends the walk, and is scanned as itself. */
function looseOverageNames(value: unknown, where: string): string[] {
  if (typeof value === 'string') return namesOverage(value) ? [`${where} ${JSON.stringify(value)}`] : [];
  if (Array.isArray(value)) return value.flatMap((item, i) => looseOverageNames(item, `${where}[${i}]`));
  return [];
}

/**
 * The overage names an object inside a window entry holds itself (Task 5b review repair N2): each of its own keys
 * naming overage, but D-6's own field names, and each string naming overage reachable from it through arrays
 * alone, but a `rateLimitType` key's own string, which the type rule reads. An object it holds is scanned as itself.
 */
function ownOverageNames(object: Rec, where: string): string[] {
  return Object.entries(object).flatMap(([key, inner]) => [
    ...(/overage/i.test(key) && !OVERAGE_FIELD_NAMES.has(key) ? [`${where} key ${JSON.stringify(key)}`] : []),
    ...(key === 'rateLimitType' && typeof inner === 'string' ? [] : looseOverageNames(inner, `${where}${pathKey(key)}`)),
  ]);
}

const withinOne = (value: unknown): boolean => typeof value === 'number' && value >= 0 && value <= 1;

/** An epoch-seconds instant as ISO text, or a note when it lies outside the Date range. */
function isoOf(seconds: number): string {
  const date = new Date(seconds * 1000);
  return Number.isNaN(date.getTime()) ? `an instant outside the Date range (${seconds})` : date.toISOString();
}

type Add = (position: number, fact: UsageFactName, kind: UsageStopKind, detail: string, resetsAt?: unknown) => void;

/**
 * D-6's per-field rules on one object: a `rate_limit_info` itself (`top`),
 * where a field must be present with its allowed value, or an object inside
 * its `unifiedWindows`, where a field may be absent and is held to the same
 * value when present (S2).
 */
function objectFacts(o: Rec, path: string, top: boolean, resetsAt: unknown, at: string, line: number, add: Add): void {
  const has = (key: string): boolean => hasOwn(o, key);
  const field = (key: string): string => `${at}: ${path}.${key} ${shown(o[key])}`;
  if (o['status'] === 'rejected') add(line, 'rate_limit_rejected', 'exhausted', field('status'), resetsAt);
  if (top ? !has('isUsingOverage') || o['isUsingOverage'] !== false : has('isUsingOverage') && o['isUsingOverage'] !== false) {
    add(line, 'is_using_overage', has('isUsingOverage') ? 'overage' : 'unobserved', field('isUsingOverage'), resetsAt);
  }
  if (has('overageInUse') && o['overageInUse'] !== false) add(line, 'overage_in_use', 'overage', field('overageInUse'), resetsAt);
  if (top ? !has('overageStatus') || o['overageStatus'] !== 'rejected' : has('overageStatus') && o['overageStatus'] !== 'rejected') {
    add(line, 'overage_status_not_rejected', has('overageStatus') ? 'overage' : 'unobserved', field('overageStatus'), resetsAt);
  }
  if (top ? !INCLUDED_RATE_LIMIT_TYPES.has(o['rateLimitType']) : has('rateLimitType') && !INCLUDED_RATE_LIMIT_TYPES.has(o['rateLimitType'])) {
    add(line, 'rate_limit_type_not_included', namesOverage(o['rateLimitType']) ? 'overage' : 'unobserved', field('rateLimitType'), resetsAt);
  }
  if (has('rateLimitGraceActive')) add(line, 'grace_active', 'unobserved', field('rateLimitGraceActive'), resetsAt);
  if (has('utilization') && !withinOne(o['utilization'])) add(line, 'utilization_over_1', 'unobserved', field('utilization'), resetsAt);
  if (has('errorCode')) add(line, 'rate_limit_error_code', 'unobserved', field('errorCode'), resetsAt);
  if (top ? !RECOGNISED_STATUSES.has(o['status']) : has('status') && !RECOGNISED_STATUSES.has(o['status'])) add(line, 'rate_limit_unobserved', 'unobserved', field('status'), resetsAt);
}

/**
 * Every fact against included usage in one execution's role launches, in
 * order: by launch, then by the event's line within the launch (a
 * launch-level fact last), then by the fixed fact order. Gate lines, and
 * lines with no observation, are skipped. Pure.
 */
export function usageViolations(lines: readonly UsageLine[]): UsageFact[] {
  const facts: UsageFact[] = [];
  /** Each named window's state, from the events before the one being read (N1). */
  const windows = new Map<string, WindowState>();
  for (const line of lines) {
    if (line.kind !== 'role' || line.observed === null) continue;
    const observed = line.observed;
    const found: Found[] = [];
    const add: Add = (position, fact, kind, detail, resetsAt = null) => {
      found.push({ position, order: ORDER.get(fact) ?? 0, fact, kind, detail, resetsAt });
    };
    const launchTime = Date.parse(line.at);

    // 1-9, and 16: each rate-limit event.
    for (const reading of observed.rateLimits) {
      const at = `rate_limit_event at line ${reading.line}`;
      if (reading.info === null) {
        add(reading.line, 'rate_limit_unobserved', 'unobserved', `${at}: rate_limit_info is ${reading.notAnObject ?? 'not an object'}`);
        continue;
      }
      const info = reading.info;
      const eventResetsAt = reportedOrNull(info['resetsAt']);
      objectFacts(info, 'rate_limit_info', true, eventResetsAt, at, reading.line, add);
      const windowReadings: WindowReading[] = [];
      const topType = info['rateLimitType'];
      // The top-level reading's reset time is its own: its rateLimitType names that reset's window.
      if (typeof topType === 'string') windowReadings.push({ id: topType, path: 'rate_limit_info', resetsAt: eventResetsAt, utilization: info['utilization'] });
      if (hasOwn(info, 'unifiedWindows')) {
        const windows = info['unifiedWindows'];
        const entries = windowEntries(windows);
        if (entries === null) add(reading.line, 'rate_limit_unobserved', 'unobserved', `${at}: rate_limit_info.unifiedWindows ${shown(windows)}, neither an array nor an object`, eventResetsAt);
        for (const { path, key, entry } of entries ?? []) {
          const where = `rate_limit_info.unifiedWindows${path}`;
          // An object-form key names its entry: the entry's own reset time, else the event's.
          const entryResetsAt = (isRecord(entry) ? entry['resetsAt'] : undefined) ?? eventResetsAt;
          if (key !== null && /overage/i.test(key)) add(reading.line, 'rate_limit_type_not_included', 'overage', `${at}: rate_limit_info.unifiedWindows key ${JSON.stringify(key)}`, entryResetsAt);
          // A string no object holds, in an entry that is not one, reports no reset time of its own: the event's (N2).
          for (const name of looseOverageNames(entry, where)) add(reading.line, 'rate_limit_type_not_included', 'overage', `${at}: ${name}`, eventResetsAt);
          // An entry that is not an object is a fact of its own, and is still read through: every object inside an
          // array entry is held to the same rules, as the projection's windowObjectsOf reads it (Task 5b review repair R1).
          if (!isRecord(entry)) add(reading.line, 'rate_limit_unobserved', 'unobserved', `${at}: ${where} ${shown(entry)}, not an object`, eventResetsAt);
          for (const { where: objectWhere, object } of objectsIn(entry, where)) {
            // Each object's facts, and each overage name it holds itself, carry its own reset time, else the event's
            // (Task 5b review repairs R1, N2): a name belongs to the innermost object holding it, never to its entry.
            const ownResetsAt = object['resetsAt'] ?? eventResetsAt;
            for (const name of ownOverageNames(object, objectWhere)) add(reading.line, 'rate_limit_type_not_included', 'overage', `${at}: ${name}`, ownResetsAt);
            objectFacts(object, objectWhere, false, ownResetsAt, at, reading.line, add);
            const ownType = object['rateLimitType'];
            const id = typeof ownType === 'string' ? ownType : object === entry ? key : null;
            if (id !== null) windowReadings.push({ id, path: objectWhere, resetsAt: reportedOrNull(object['resetsAt']), utilization: object['utilization'] });
          }
        }
      }
      // 16: every reading of a named window in this event against the window's state as it stood before the event,
      // while the launch is before the reset time the window last reported itself (Task 5b review repairs R2, R3, N1):
      // a reset time is compared only with one the window reported, and never with another reading of this event.
      for (const current of windowReadings) {
        const state = windows.get(current.id);
        const gate = state?.gate ?? null;
        if (gate === null || !(launchTime < gate.resetsAt * 1000)) continue;
        const was = state?.utilization ?? null;
        const moves: { text: string; from: ReportedAt }[] = [];
        if (isFiniteNumber(current.resetsAt) && current.resetsAt < gate.resetsAt) moves.push({ text: `resetsAt ${current.resetsAt}, earlier than ${gate.resetsAt}`, from: gate });
        if (isFiniteNumber(current.utilization) && was !== null && current.utilization < was.utilization) moves.push({ text: `utilization ${current.utilization}, lower than ${was.utilization}`, from: was });
        if (moves.length === 0) continue;
        const oneSource = moves.every(({ from }) => reportedAt(from) === reportedAt(moves[0]!.from));
        const reports = oneSource ? `${moves.map(({ text }) => text).join(' and ')} ${reportedAt(moves[0]!.from)}` : moves.map(({ text, from }) => `${text} ${reportedAt(from)}`).join(' and ');
        const before = oneSource && reportedAt(moves[0]!.from) === reportedAt(gate) ? `that reset at ${isoOf(gate.resetsAt)}` : `the window's reset at ${isoOf(gate.resetsAt)} ${reportedAt(gate)}`;
        add(reading.line, 'unnatural_reset', 'unnatural_reset', `${at}: window ${JSON.stringify(current.id)} at ${current.path} reports ${reports}, while this launch's time ${line.at} is before ${before}`, current.resetsAt);
      }
      // The state moves once, after the whole event (N1): each window the event named takes the smallest finite reset
      // time and the smallest finite utilization its readings reported, and keeps what it had where they reported none.
      const reported = new Map<string, { resetsAt: number | null; utilization: number | null }>();
      for (const current of windowReadings) {
        const seen = reported.get(current.id) ?? { resetsAt: null, utilization: null };
        if (isFiniteNumber(current.resetsAt)) seen.resetsAt = seen.resetsAt === null ? current.resetsAt : Math.min(seen.resetsAt, current.resetsAt);
        if (isFiniteNumber(current.utilization)) seen.utilization = seen.utilization === null ? current.utilization : Math.min(seen.utilization, current.utilization);
        reported.set(current.id, seen);
      }
      for (const [id, seen] of reported) {
        const state = windows.get(id) ?? { gate: null, utilization: null };
        const here: ReportedAt = { seq: line.seq, line: reading.line };
        windows.set(id, {
          gate: seen.resetsAt === null ? state.gate : { ...here, resetsAt: seen.resetsAt },
          utilization: seen.utilization === null ? state.utilization : { ...here, utilization: seen.utilization },
        });
      }
    }
    // 9, per launch: no event said, in a status this route understands, what the window is.
    if (!observed.rateLimits.some((reading) => reading.info !== null && RECOGNISED_STATUSES.has(reading.info['status']))) {
      add(Number.POSITIVE_INFINITY, 'rate_limit_unobserved', 'unobserved', 'no rate_limit_event carried an object rate_limit_info whose status is "allowed", "allowed_warning" or "rejected"');
    }

    // 10, 11: fast mode is exactly "off" at every init and every result event (Task 2's R4; Task 5b review repair R4).
    const { init, result, speeds } = observed.fastMode;
    for (const reading of init) {
      if (reading.fields['fast_mode_state'] !== 'off') add(reading.line, 'fast_mode_init', 'fast_mode', `init at line ${reading.line}: fast_mode_state ${shown(reading.fields['fast_mode_state'])}`);
    }
    for (const reading of result) {
      if (reading.fields['fast_mode_state'] !== 'off') add(reading.line, 'fast_mode_result', 'fast_mode', `result at line ${reading.line}: fast_mode_state ${shown(reading.fields['fast_mode_state'])}`);
    }
    // 12: every reported speed but standard; null only on an API-error item's usage (R1).
    for (const speed of speeds) {
      if (speed.speed === 'standard' || (speed.speed === null && speed.onApiError)) continue;
      add(speed.line, 'speed_not_standard', 'fast_mode', `${speed.where} at line ${speed.line}: speed ${shown(speed.speed)}`);
    }
    // 13: a credit kind on either carrier (R2, S7).
    for (const apiError of observed.apiErrors) {
      for (const kind of apiError.kinds) {
        if (CREDIT_KINDS.has(kind)) add(apiError.line, 'credits_required', 'credits', `${apiError.where} at line ${apiError.line}: API-error kind ${JSON.stringify(kind)}`);
      }
    }
    // 14: the paid long-context route, wherever a model is reported or in any init event's betas (P-5b-2; Task 5b review repair R4).
    for (const model of observed.reportedModels) {
      if (typeof model.model === 'string' && /\[1m\]$/i.test(model.model)) add(model.line, 'long_context_route', 'long_context_route', `${model.where} at line ${model.line}: ${JSON.stringify(model.model)}`);
    }
    for (const { line: initLine, betas } of observed.initBetas) {
      if (!Array.isArray(betas)) continue;
      for (const beta of betas) {
        if (typeof beta === 'string' && /context-1m/i.test(beta)) add(initLine, 'long_context_route', 'long_context_route', `init.betas at line ${initLine}: ${JSON.stringify(beta)}`);
      }
    }
    // 15: the per-request context above D-5's ceiling.
    if (observed.reportedContextTokens !== null && observed.reportedContextTokens > CONTEXT_CEILING_TOKENS) {
      add(Number.POSITIVE_INFINITY, 'long_context_boundary', 'long_context_boundary', `reportedContextTokens ${observed.reportedContextTokens}, above the per-request ceiling of ${CONTEXT_CEILING_TOKENS} (the plan's proposed value, for the user to confirm)`);
    }

    found.sort((a, b) => a.position - b.position || a.order - b.order);
    for (const { fact, kind, detail, resetsAt } of found) facts.push({ fact, kind, seq: line.seq, role: line.role, index: line.index, detail, resetsAt });
  }
  return facts;
}

// ---------------------------------------------------------------------------
// The stop
// ---------------------------------------------------------------------------

/** A run's usage stop: every fact, the kind the costliest decides, where that kind was first seen, and when the account may resume. */
export interface UsageStop {
  kind: UsageStopKind;
  facts: UsageFact[];
  seq: number;
  role: string | null;
  index: number | null;
  /** The latest finite `resetsAt` among the exhausted and overage facts, epoch seconds; `null` when none reports one. */
  resetsAt: number | null;
  note: string;
}

/**
 * The stop the facts make, or `null` when there is none. The kind comes from
 * the facts, never from an error's name: a launch ended at its timeout whose
 * partial stream reports `rejected` is exhausted, though its error is a
 * timeout. Pure.
 */
export function usageStopOf(facts: readonly UsageFact[]): UsageStop | null {
  if (facts.length === 0) return null;
  const kind = USAGE_STOP_KINDS.find((candidate) => facts.some((fact) => fact.kind === candidate)) ?? facts[0]!.kind;
  const first = facts.find((fact) => fact.kind === kind)!;
  const resets = facts.filter((fact) => (fact.kind === 'exhausted' || fact.kind === 'overage') && isFiniteNumber(fact.resetsAt)).map((fact) => fact.resetsAt as number);
  return { kind, facts: [...facts], seq: first.seq, role: first.role, index: first.index, resetsAt: resets.length === 0 ? null : Math.max(...resets), note: USAGE_STOP_NOTE };
}

/** Every fact, named with its launch, for an error message. */
export function describeUsageFacts(facts: readonly UsageFact[]): string {
  return facts.map((fact) => `${fact.fact} (${fact.kind}) at launch ${fact.seq} (${fact.role}[${fact.index}]): ${fact.detail}`).join('; ');
}
