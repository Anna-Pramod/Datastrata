/**
 * What an agent role *is*, and what its output may never be.
 *
 * Every cross-task contract in B2 passes through this file, so it is written to
 * be narrow rather than accommodating. Two properties decide its shape.
 *
 * **A role output may not carry an authoritative pin.** The six pin fields a
 * signature compares — `requirementInputSha256`, `conditionSha256`,
 * `renderedConditionSha256`, `corpusClosureSha256`, `resultSha256` and
 * `pipelineVersion` — are computed by the deterministic tail out of the world
 * the run was handed. A pipeline that accepts one of them from an agent has no
 * integrity story at all: the value the signature pins would be a value the
 * model chose, and every downstream comparison would be the model agreeing with
 * itself. `PinFree` states that at the type level, and the seam schemas in
 * `role-outputs.ts` state it again at runtime with `.strict()`, because a value
 * arriving through `unknown` has no types left.
 *
 * **A role that cannot say which prompt and model produced it cannot be
 * measured.** `pipelineVersion` is a digest over per-role prompt-file hashes and
 * model identifiers (spec §5.1), and B3 measures a pipeline by comparing runs
 * of known identity. So `RoleExecution` carries `model` and `promptSha256` on
 * every single execution rather than leaving them to be reconstructed from
 * configuration later — reconstruction is where the two drift apart.
 *
 * Pure: nothing here reads a file, opens a socket or looks at a clock. The
 * runner it is handed does all of that, and `runner.ts` decides what a runner
 * is allowed to be.
 */

import type { RoleTranscript, TranscriptMessage } from './transcript';

/** The three agent roles. The deterministic tail is deliberately not one. */
export type RoleName = 'reader' | 'prosecutor' | 'adjudicator';

/** Declared once, in role order, so orchestration cannot invent a fourth. */
export const ROLE_NAMES: readonly RoleName[] = ['reader', 'prosecutor', 'adjudicator'];

/**
 * The fields the deterministic tail owns outright.
 *
 * Derived from one array so the type and the runtime rejection list cannot
 * disagree — a second hand-maintained copy of this set is the failure this
 * whole file exists to prevent.
 */
export const AUTHORITATIVE_PIN_FIELDS = [
  'requirementInputSha256',
  'conditionSha256',
  'renderedConditionSha256',
  'corpusClosureSha256',
  'resultSha256',
  'pipelineVersion',
] as const;

export type AuthoritativePinField = (typeof AUTHORITATIVE_PIN_FIELDS)[number];

/**
 * The constraint every role output type must satisfy, written F-bounded:
 * a type is a legal role output when `O extends PinFree<O>`.
 *
 * `PinFree<O>` is `O` with every pin-named key rewritten to `never`, so a type
 * that carries none of them is unchanged and satisfies the constraint, while
 * `{ corpusClosureSha256: string }` becomes `{ corpusClosureSha256: never }`
 * and fails it. The failure lands where the offending type is *used as a role
 * output*, not at some call site far away.
 *
 * Written this way rather than as `{ [K in AuthoritativePinField]?: never }`
 * because that shape is a *weak type*: TypeScript rejects every value having no
 * key in common with it, which is every honest role output. A constraint that
 * only the hostile case can satisfy is worse than no constraint.
 */
export type PinFree<O> = { [K in keyof O]: K extends AuthoritativePinField ? never : O[K] };

/**
 * One execution of one role, with everything B3 needs to place it.
 *
 * `transcript` is here rather than assembled by the orchestrator afterwards so
 * that "what the role was sent" and "what the role returned" are recorded by
 * the same code that performed the exchange. An orchestrator reconstructing a
 * transcript from configuration would record what it believes was sent.
 */
export interface RoleExecution<T> {
  /** The parsed, seam-validated output. */
  output: T;
  /** Enough to replay this exchange with no network. */
  transcript: RoleTranscript;
  /** The exact model identifier, a `pipelineVersion` input. */
  model: string;
  /** SHA-256 of the prompt *file*, a `pipelineVersion` input. */
  promptSha256: string;
}

/**
 * A role: an input shape, an output shape, and a promise to produce the second
 * from the first.
 *
 * `O extends PinFree<O>` is the compile boundary. An output type declaring an
 * authoritative pin cannot be a role output, and the failure lands where it is
 * named as one.
 */
export interface AgentRole<I, O extends PinFree<O>> {
  readonly name: RoleName;
  /** Distinguishes prosecutor 0 from prosecutor 1; `0` for the single roles. */
  readonly index: number;
  readonly model: string;
  readonly promptSha256: string;
  run(input: I): Promise<RoleExecution<O>>;
}

/**
 * A role returned something that is not its output shape.
 *
 * Named at its own boundary, carrying the role and the index, because the
 * alternative is a malformed reading surfacing three stages later as an invalid
 * verification result — where the message names a schema path and not the agent
 * that produced it.
 */
export class RoleOutputError extends Error {
  constructor(
    readonly role: RoleName,
    readonly index: number,
    readonly problems: string[],
  ) {
    super(
      `${role}[${index}] returned output that is not a valid ${role} output:\n - ${problems.join('\n - ')}`,
    );
    this.name = 'RoleOutputError';
  }
}

/** The role could not be reached at all, or answered with something unparseable. */
export class RoleTransportError extends Error {
  constructor(
    readonly role: RoleName,
    readonly index: number,
    detail: string,
  ) {
    super(`${role}[${index}] produced no usable response: ${detail}`);
    this.name = 'RoleTransportError';
  }
}

/**
 * How a role's output is validated at the seam.
 *
 * A function rather than a zod schema so that the seam is a *contract* the
 * caller states, not a library type: `role-outputs.ts` supplies zod-backed
 * parsers, and a test can supply a hostile one without pretending to be zod.
 */
export type RoleOutputParser<O extends PinFree<O>> = (raw: unknown) => O;

/** Everything one role execution sends. */
export interface RoleRequest {
  role: RoleName;
  index: number;
  model: string;
  promptSha256: string;
  /**
   * The pass this execution works, for the role that has one.
   *
   * A first-class field rather than a value a reader has to find inside the
   * rendered input, because replay compares it: prosecutor *i* answering under
   * a recording made for prosecutor *j*'s lens must be refused by name, and a
   * check that had to parse the lens back out of prose would be a second
   * renderer of the input format — free to disagree with the first exactly when
   * the format moves.
   *
   * `undefined` for the reader and the adjudicator, which have no lens. It is
   * still a request-identity input for them (as `null`), so a role that grew a
   * lens could not do so without moving its recorded fingerprints.
   */
  lens?: string;
  /** The prompt file's text, plus the interpolated inputs, as messages. */
  messages: readonly TranscriptMessage[];
}
