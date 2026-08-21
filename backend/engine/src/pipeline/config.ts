/**
 * Role configuration — the knobs that are `pipelineVersion` inputs.
 *
 * Spec §10 is explicit that the prosecutor count and the lens set are *unfixed*:
 * B3 measures them, and B2 must therefore make both configurable rather than
 * hard-coded. Configuration that cannot vary cannot be measured, and a constant
 * buried in an orchestration function is configuration that cannot vary.
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
}

/**
 * A starting configuration, not a promoted one.
 *
 * No promotion record exists for any identity this produces, and B2 writes
 * none. The values here are what a run defaults to; whether that run's output
 * may be signed is answered by `verification/promotions.jsonl`, which is B3's.
 */
export const DEFAULT_ROLE_CONFIG: RoleConfig = {
  prosecutorCount: 3,
  lenses: DEFAULT_LENSES,
  order: ['reader', 'prosecutor', 'adjudicator'],
  models: {
    reader: 'claude-opus-5',
    prosecutor: 'claude-opus-5',
    adjudicator: 'claude-opus-5',
  },
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
