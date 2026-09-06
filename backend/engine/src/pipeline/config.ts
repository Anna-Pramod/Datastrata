/**
 * Role configuration — the knobs that are `pipelineVersion` inputs.
 *
 * Spec §10 is explicit that the prosecutor count and the lens set are *unfixed*:
 * B3 measures them, and B2 must therefore make both configurable rather than
 * hard-coded. Configuration that cannot vary cannot be measured, and a constant
 * buried in an orchestration function is configuration that cannot vary.
 *
 * **The provider adapter's identity is one of these knobs**, for the reason the
 * others are: a response projection decides what the model's answer *was*, so
 * two projections of one envelope are two verification methods, and B3 must not
 * be able to promote one and execute the other. `provider-adapter.ts` carries
 * the full argument.
 *
 * **Count and lenses are independent fields, deliberately.** Deriving the count
 * from `lenses.length` would look tidier and would destroy the property the
 * identity teeth check rests on: two inputs that cannot move apart cannot be
 * shown to move the identity apart. §5.1 lists them as two things the pipeline
 * artifact pins, and B3 varies them separately.
 *
 * **Ordering is pinned too.** §5.1 says "prosecutor count, lens set, ordering",
 * so `lenses` is an ordered list rather than a set: prosecutor *i* gets lens
 * *i*, and a re-ordered lens list is a different pipeline even when the same
 * lenses run.
 *
 * Pure. Nothing here reads a file or names a program.
 */

import type { RoleName } from './roles';
import type { ProviderAdapterIdentity } from './provider-adapter';
import { ANTHROPIC_MESSAGES_IDENTITY } from './anthropic-messages';

/**
 * The lenses of spec §3.2, in order.
 *
 * A default rather than a fixture: a caller may run fewer, more, or different
 * ones, and whichever it runs moves `pipelineVersion`. That is the whole point
 * of the field being an identity input.
 */
export const DEFAULT_LENSES: readonly string[] = [
  'missing_criterion',
  'wrong_conjunction',
  'wrong_threshold_or_units',
  'wrong_measurement_period',
  'wrong_scope_type_or_addressee',
  'superseded_or_miscited_provision',
  'missing_exclusion',
];

/** The exact model identifier each role runs on. A `pipelineVersion` input. */
export type RoleModels = Readonly<Record<RoleName, string>>;

export interface RoleConfig {
  /** How many prosecutors run. Independent of `lenses.length` — see the header. */
  prosecutorCount: number;
  /** Ordered: prosecutor *i* takes `lenses[i % lenses.length]`. */
  lenses: readonly string[];
  /** The order roles run in, pinned because §5.1 pins it. */
  order: readonly RoleName[];
  models: RoleModels;
  /**
   * Which provider semantics this run is defined over. A `pipelineVersion` input.
   *
   * **Configuration, not a property of the runner**, and the distinction is what
   * makes replay work. Replay must reproduce the pipeline identity of the run it
   * replays; if the identity came from whatever capability happened to be
   * executing, a replay capability would have to either invent the live
   * adapter's identity — learning about providers, which is exactly what replay
   * must not do — or read it back out of the recording and become a second
   * authority for a fact `pipelineVersion` already fixes. Declared here, one
   * configuration produces one identity whether it is executed live or replayed.
   *
   * Independent of `models`. Same adapter with a different model is a different
   * pipeline; the same model read through different provider semantics is also
   * a different pipeline. Neither implies the other, and both must move it.
   */
  providerAdapter: ProviderAdapterIdentity;
}

/**
 * A starting configuration, not a promoted one.
 *
 * No promotion record exists for any identity this produces, and B2 writes
 * none. The values here are what a run defaults to; whether that run's output
 * may be signed is answered by `verification/promotions.jsonl`, which is B3's.
 */
export const DEFAULT_ROLE_CONFIG: RoleConfig = {
  // Seven, one per declared lens: the milestone configuration. Three ran only
  // the first three lenses and left four — superseded or miscited provision
  // among them — never reaching a prosecutor request (B-ADAPTER).
  prosecutorCount: 7,
  lenses: DEFAULT_LENSES,
  order: ['reader', 'prosecutor', 'adjudicator'],
  models: {
    reader: 'claude-opus-5',
    prosecutor: 'claude-opus-5',
    adjudicator: 'claude-opus-5',
  },
  /**
   * No provider has been selected, and the identity says so rather than
   * defaulting to one.
   *
   * A default naming a real provider would make every offline run — every
   * deterministic stub answering from a table — produce the pipeline identity of
   * a run that calls that provider. Two entirely different execution paths would
   * then share one identity, which is the aliasing this whole file exists to
   * prevent. Selecting a provider is a deliberate configuration change, and it
   * moves `pipelineVersion`.
   */
  // The concrete adapter production executes (`anthropic-messages@1`,
  // `anthropic-messages.ts`). Selecting it moves `pipelineVersion`: a pipeline
  // that can reach a model is not the pipeline that never could. Replay
  // capabilities are exempt from the adapter check and still bind, because
  // they execute no protocol.
  providerAdapter: ANTHROPIC_MESSAGES_IDENTITY,
};

/** The lens prosecutor `index` works, wrapping when there are fewer lenses. */
export function lensFor(config: RoleConfig, index: number): string {
  if (config.lenses.length === 0) {
    throw new Error('role configuration carries no lenses: a prosecutor with no lens has no pass to make');
  }
  const lens = config.lenses[index % config.lenses.length];
  // `noUncheckedIndexedAccess` is on and the modulus above already bounds the
  // index; throwing rather than defaulting keeps that reasoning checkable.
  if (lens === undefined) throw new Error(`no lens at index ${index}`);
  return lens;
}
