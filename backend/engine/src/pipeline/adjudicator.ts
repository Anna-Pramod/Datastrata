/**
 * The adjudicator — §3.3 — and the `openQuestions[]` projection.
 *
 * **The adjudicator is the sole producer of judgment in the pipeline.** The
 * reader states what the law says; the prosecutors state what they can argue
 * against the encoding; nobody before this point may write `CONFIRMED`,
 * `MISMATCH` or `OPEN_QUESTION`. Four properties decide the shape of this file.
 *
 * **It adjudicates claims, not arguments about claims.** §3.3 gives it the
 * blind reading, the rendered English, the assembled coverage table, every
 * challenge and the entitled closure — and *not* the prosecutors' reasoning
 * transcripts. A prosecutor's transcript is the argument that produced a claim,
 * and an adjudicator reading it is being asked to grade an argument rather than
 * to decide a proposition against the record: the persuasive lens wins over the
 * correct one, and the panel stops being a panel. So the exclusion is
 * structural rather than instructed. `AdjudicatorInput` is a **positive
 * projection** whose challenge field is `ChallengeSeed` — Task 3's narrow
 * claim surface, `{ id, lens, statement, evidence }` — and not
 * `ProsecutorOutput`, not `RoleExecution<ProsecutorOutput>`, not anything that
 * leads back to a transcript. `ReasoningFree` states that as a compile
 * boundary, `assertAdjudicatorInputFields` states it again at runtime, and
 * `adjudicatorInputFor` is the only builder.
 *
 * **A challenge is dissolved by evidence or not at all.** `CONFIRMED` and
 * `MISMATCH` are conclusions and each requires a non-blank `resolution` saying
 * what settled it; every adjudication carries evidence out of the closure, and
 * `absence` may never be the whole of it (§2.2). `OPEN_QUESTION` is what
 * remains when the record cannot settle the point — a real outcome, not a
 * failure to try, and it may carry no resolution at all.
 *
 * **`openQuestions[]` is a projection of the verdicts, computed here, with one
 * producer.** The adjudicator does not author it and *has no key it could
 * occupy*: `adjudicatorOutputSchema` carries no `openQuestions` field and is
 * `.strict()`, so an adjudicator emitting one is refused at its own seam —
 * exactly as Task 3 removed `verdict` from the prosecutor's challenge rather
 * than validating it away. `projectOpenQuestions` derives the list from the
 * `OPEN_QUESTION` verdicts, in challenge order. This is what makes `sign.ts`'s
 * two open-question refusals fire together: belt and braces over one truth,
 * rather than two lists that can disagree.
 *
 * **It is not a second coverage validator.** Task 3 owns "an adverse cell names
 * an existing challenge" and "the panel walked both directions"; this module
 * relies on both and re-checks neither. Two authorities over one rule diverge,
 * and the divergence surfaces as a dossier that passes one gate and not the
 * other with nothing naming the rule they differ about. In particular:
 * bidirectionality is a **panel-level** invariant evaluated by
 * `assertBothDirectionsWalked` over the assembled table, and nothing here may
 * reject a single prosecutor — or a single cell — for being one-directional.
 *
 * Pure: no filesystem, no network, no clock. The runner is injected and the
 * closure did all the reading.
 */

import { composeRoleMessage, renderCarried, type EntitledClosure } from './entitlement';
import { gapForUnreachableDocument, type DocumentGap } from './gaps';
import type { RolePrompt } from './prompts';
import { createAgentRole } from './agent-role';
import { parseRoleOutput, type AdjudicatorOutput, type ReaderOutput } from './role-outputs';
import { assertAdjudicatorQuotesPinned } from './quote-pins';
import { RoleOutputError, type RoleExecution } from './roles';
import type { AgentRunner } from './runner';
import type { ChallengeSeed, CoverageTable } from './prosecutors';
import type { ProsecutorOutput } from './role-outputs';
import type { ProsecutorsOutcome } from './prosecutors';
import type { RoleTranscript, RunTranscript, TranscriptMessage } from './transcript';
import type { RoleResponse } from './runner';
import {
  challengeVerdictSchema,
  evidenceIsSolelyAbsence,
  RESOLVED_VERDICTS,
  type VerificationResult,
} from '../verification/result';

// ---------------------------------------------------------------------------
// The record's vocabulary, taken off the record rather than restated
// ---------------------------------------------------------------------------

type ChallengeVerdict = (typeof challengeVerdictSchema.options)[number];

/** One challenge as the record carries it: the claim, plus the adjudication. */
export type ResultChallenge = VerificationResult['challenges'][number];
/** One assembled coverage cell, as Task 3's table produced it. */
export type ResultCoverageCell = VerificationResult['coverage']['cells'][number];
/** One open question, as the record carries it. */
export type OpenQuestion = VerificationResult['openQuestions'][number];
/** One adjudication as the seam accepts it. */
export type Adjudication = AdjudicatorOutput['adjudications'][number];

/**
 * The challenge surface the adjudicator sees, and it is Task 3's narrow one.
 *
 * An alias rather than a fresh interface, deliberately: a second declaration of
 * "a challenge without its adjudication" is a second thing to keep in step with
 * `challengeSchema`, and Task 3 already derives this one from the record.
 */
export type AdjudicatorChallenge = ChallengeSeed;

/**
 * The challenge the adjudicator holds carries no verdict, and no resolution.
 *
 * Stated as types rather than as a comment: `.strict()` on the seam schema is a
 * claim about what an *agent* may hand back, and says nothing about what the
 * pipeline's own code could construct and pass down. These two lines fail to
 * compile the moment either key appears on the surface handed to adjudication —
 * an adjudicator shown a pre-existing verdict is being asked to review a
 * judgment rather than to make one.
 */
export type AdjudicatorChallengeCarriesNoVerdict = 'verdict' extends keyof AdjudicatorChallenge
  ? never
  : true;
export type AdjudicatorChallengeCarriesNoResolution = 'resolution' extends keyof AdjudicatorChallenge
  ? never
  : true;
/**
 * And no `adjudicationEvidence` either, which schema 1.2.0 added.
 *
 * The asymmetry `ChallengeSeed` encodes: `evidence` is the prosecutor's own and
 * reaches the adjudicator, because it is *why the challenge was raised* and the
 * adjudicator has to weigh it. `adjudicationEvidence` is the adjudicator's own
 * and must not — a seed carrying it would let a prosecutor pre-supply the
 * reasoning for a verdict it is forbidden to reach.
 */
export type AdjudicatorChallengeCarriesNoAdjudicationEvidence =
  'adjudicationEvidence' extends keyof AdjudicatorChallenge ? never : true;

export const ADJUDICATOR_CHALLENGE_CARRIES_NO_VERDICT: AdjudicatorChallengeCarriesNoVerdict = true;
export const ADJUDICATOR_CHALLENGE_CARRIES_NO_RESOLUTION: AdjudicatorChallengeCarriesNoResolution =
  true;
export const ADJUDICATOR_CHALLENGE_CARRIES_NO_ADJUDICATION_EVIDENCE: AdjudicatorChallengeCarriesNoAdjudicationEvidence =
  true;

// ---------------------------------------------------------------------------
// Blindness to reasoning, as a type
// ---------------------------------------------------------------------------

/**
 * Whether a field's type is, or contains, a prosecutor's *reasoning* rather
 * than its claims.
 *
 * The union is the list of shapes that lead back to an argument: a whole
 * `ProsecutorOutput` (the envelope a claim arrived in, carrying that
 * prosecutor's own coverage and gap narration), a `RoleExecution` of anything
 * (which carries `transcript` by construction), a role or run transcript, a
 * single transcript message, a raw runner response, and the prosecutors'
 * outcome object that holds all of them.
 *
 * `RoleExecution<unknown>` covers every instantiation because `output` is
 * covariant — `RoleExecution<ProsecutorOutput>` extends it — so a widening from
 * the claim surface to "the execution that produced it" cannot slip past by
 * changing the type parameter.
 *
 * The array branch is not decoration: `prosecutions: readonly
 * ProsecutorOutput[]` is precisely the shape the pre-Task-4 skeleton used and
 * exactly what a well-meaning refactor reaches for, and `readonly
 * ProsecutorOutput[]` does not extend `ProsecutorOutput`, so a check without it
 * would wave the real case through.
 */
export type CarriesProsecutorReasoning<T> = T extends
  | ProsecutorOutput
  | ProsecutorsOutcome
  | RoleExecution<unknown>
  | RoleTranscript
  | RunTranscript
  | TranscriptMessage
  | RoleResponse
  ? true
  : T extends readonly (infer Element)[]
    ? CarriesProsecutorReasoning<Element>
    : false;

/**
 * The constraint an adjudicator input must satisfy, written F-bounded in the
 * same form as `PinFree` and `PeerFree`: a type is a legal adjudicator input
 * when `I extends ReasoningFree<I>`.
 *
 * `ReasoningFree<I>` is `I` with every field that carries reasoning rewritten
 * to `never`, so a type with no such field is unchanged and satisfies the
 * constraint, while `{ prosecutions: ProsecutorOutput[] }` becomes
 * `{ prosecutions: never }` and fails it. F-bounded rather than a mapped
 * optional-never for the reason `roles.ts` gives at length: the naive form is a
 * *weak type* that rejects every honest input instead.
 *
 * **Where the guarantee stops, stated rather than assumed.** This is a shallow
 * check — each field's own type, recursing through arrays — and it does not
 * descend into an object type's members, exactly as `PinFree` and `PeerFree` do
 * not. A transcript smuggled inside an existing field satisfies it. The
 * realistic route is closed elsewhere: `AdjudicatorInput` is a closed interface
 * with a named field list, `adjudicatorInputFor` is the only builder,
 * `ADJUDICATOR_INPUT_FIELDS` is asserted against the built input's exact key
 * set, and `runAdjudicator` re-asserts it at runtime on every run — so a cast
 * that bypasses the type still fails before the model is contacted.
 */
export type ReasoningFree<I> = {
  [K in keyof I]: CarriesProsecutorReasoning<I[K]> extends true ? never : I[K];
};

// ---------------------------------------------------------------------------
// The input — §3.3's list, positively constructed
// ---------------------------------------------------------------------------

/**
 * Everything the adjudicator is given, and it is a closed list.
 *
 * `reading` is the blind reader's reading of the law. `renderedCondition` is
 * the exact English the reviewer reads — without it `CONFIRMED` ("the encoding
 * is correct on this point") is not reachable at all, because there is nothing
 * to be correct. `coverage` is the assembled bidirectional table, needed
 * because `assertResultConsistency` requires every adverse cell to name a
 * challenge that was adjudicated, so an adjudicator that could not see the
 * cells would be settling challenges without knowing which coverage claims
 * depend on them. `challenges` is every claim from every lens, in the narrow
 * shape that carries no argument. `closure` is the evidence surface and the
 * only route to any text.
 *
 * There is no field for a transcript, no field for a raw model response, no
 * field for a `RoleExecution`, and no second route to a document.
 */
export interface AdjudicatorInput {
  reading: ReaderOutput;
  /** The exact English the reviewer reads, from `renderRequirement`. */
  renderedCondition: string;
  /** The assembled panel table. Task 3 owns its rules; this only reads it. */
  coverage: readonly ResultCoverageCell[];
  /** Every claim, from every lens, without the argument that produced it. */
  challenges: readonly AdjudicatorChallenge[];
  /** The capability. The whole of the evidence surface, and the only route to it. */
  closure: EntitledClosure;
}

/**
 * The exact field set, as a value, so the closed list is checkable at runtime.
 *
 * Sorted, and compared against `Object.keys` of the input actually handed to
 * `runAdjudicator`. A field added to the interface without being added here
 * fails rather than quietly widening what an adjudicator is shown — and a
 * *cast* that bypasses `ReasoningFree` altogether fails here too, which is the
 * point: a compile boundary is inert if orchestration can route around it.
 */
export const ADJUDICATOR_INPUT_FIELDS: readonly string[] = [
  'challenges',
  'closure',
  'coverage',
  'reading',
  'renderedCondition',
];

/** `AdjudicatorInput` itself is reasoning-free. Fails to compile if it stops being. */
export type AdjudicatorInputIsReasoningFree = AdjudicatorInput extends ReasoningFree<AdjudicatorInput>
  ? true
  : never;
export const ADJUDICATOR_INPUT_IS_REASONING_FREE: AdjudicatorInputIsReasoningFree = true;

/**
 * Orchestration handed the adjudicator something wider than §3.3's list.
 *
 * Its own error because the repair is a design decision rather than a runtime
 * one: an adjudicator holding a transcript is grading arguments, and no amount
 * of prompt wording restores the property.
 */
export class AdjudicatorInputWidenedError extends Error {
  constructor(readonly unexpected: readonly string[]) {
    super(
      `the adjudicator was handed ${unexpected.join(', ')}, which §3.3 does not give it: the adjudicator receives the reading, the rendered condition, the assembled coverage, the challenges and the entitled closure, and adjudicates claims rather than the arguments that produced them`,
    );
    this.name = 'AdjudicatorInputWidenedError';
  }
}

/**
 * The runtime half of the reasoning boundary, called on every run.
 *
 * Directly callable with an input its natural caller cannot construct, so this
 * gate and the compile boundary above cannot mask one another (failure mode
 * #4).
 */
export function assertAdjudicatorInputFields(input: AdjudicatorInput): AdjudicatorInput {
  const expected = new Set(ADJUDICATOR_INPUT_FIELDS);
  const unexpected = Object.keys(input)
    .filter((key) => !expected.has(key))
    .sort();
  if (unexpected.length > 0) throw new AdjudicatorInputWidenedError(unexpected);
  return input;
}

/**
 * Builds the projection, field by named field. The only builder there is.
 *
 * It takes the whole `CoverageTable` rather than pre-split cells and challenges
 * so that the projection is visible in one place: a caller assembling an
 * `AdjudicatorInput` from loose arguments would be a second projection, and the
 * second one is where a `ProsecutorOutput` eventually gets passed as
 * `challenges` by mistake.
 */
export function adjudicatorInputFor(input: {
  reading: ReaderOutput;
  renderedCondition: string;
  table: CoverageTable;
  closure: EntitledClosure;
}): AdjudicatorInput {
  return {
    reading: input.reading,
    renderedCondition: input.renderedCondition,
    coverage: input.table.cells,
    challenges: input.table.challenges,
    closure: input.closure,
  };
}

/**
 * The message the adjudicator receives, as a function of `AdjudicatorInput`
 * alone.
 *
 * That signature is the second half of the reasoning boundary. The type says a
 * transcript cannot be *held*; this says it cannot be *written into the
 * prompt*, because the only thing in scope here is the projection.
 *
 * **`composeRoleMessage` is the shared composer, called unparameterised.**
 * Task 2 made the closure renderer shared across every role renderer precisely
 * so that two copies could not drift and silently change what a role sees, and
 * B-PROMPT moved the whole message assembly behind one function for the same
 * reason. Nothing about the adjudicator needs the closure presented
 * differently: it reads the same documents for the same reason. If that ever
 * changes, the function is parameterised, never forked.
 *
 * The reading, coverage and challenges are carried as JSON through
 * `renderCarried`: they are earlier roles' output, and the quotes and
 * statements inside them are corpus text and prosecutors' words that have left
 * the fence. JSON is what keeps that text from beginning a line, and the
 * prompt says what it is.
 */
export function renderAdjudicatorInput(input: AdjudicatorInput): string {
  return composeRoleMessage(
    [
      { heading: 'Blind reading', body: renderCarried(input.reading) },
      { heading: 'Rendered condition', body: input.renderedCondition },
      { heading: 'Coverage', body: renderCarried(input.coverage) },
      { heading: 'Challenges', body: renderCarried(input.challenges) },
    ],
    input.closure,
  );
}

// ---------------------------------------------------------------------------
// The verdict / resolution rule
// ---------------------------------------------------------------------------

/**
 * Which verdicts oblige a resolution, decided one verdict at a time.
 *
 * **Derived from `result.ts`'s `RESOLVED_VERDICTS`, never restated.** That set
 * is the record boundary's authority on the same question, and a second
 * hand-written list here would be a rule that agrees today: the role seam could
 * relax while the record stayed strict, and the disagreement would surface as an
 * adjudication that parses and a dossier that cannot be signed, with nothing
 * naming the rule the two differ about.
 *
 * Written as a per-verdict `Record` rather than as a single
 * `RESOLVED_VERDICTS.has(...)` call so that the enforcement for `CONFIRMED` and
 * the enforcement for `MISMATCH` are separable: a check whose two cases share
 * one branch cannot be shown to catch each of them, because either mutation
 * kills both tests (failure mode #4). The `Record` is exhaustive over the
 * verdict union, so a fourth verdict added to `challengeVerdictSchema` fails to
 * compile here rather than defaulting to "no resolution needed".
 */
export const RESOLUTION_REQUIRED_BY_VERDICT: Readonly<Record<ChallengeVerdict, boolean>> = {
  CONFIRMED: RESOLVED_VERDICTS.has('CONFIRMED'),
  MISMATCH: RESOLVED_VERDICTS.has('MISMATCH'),
  OPEN_QUESTION: RESOLVED_VERDICTS.has('OPEN_QUESTION'),
};

/** Whether a string is present and carries something other than whitespace. */
function isAdjudicated(resolution: string | undefined): boolean {
  return resolution !== undefined && resolution.trim().length > 0;
}

// ---------------------------------------------------------------------------
// The gate at the adjudicator's own boundary
// ---------------------------------------------------------------------------

/**
 * Every rule an adjudication must satisfy, checked at the boundary of the role
 * that produced it.
 *
 * Here rather than only in the tail for the reason `assertReaderEvidence` and
 * `assertProsecutorCoverage` give: a defect in the adjudication is the
 * adjudicator's defect and should be named against it, at the moment it
 * arrives, rather than three stages later as an inconsistent
 * `verification-result.json` whose message points at a schema path.
 *
 * Every problem is collected, never only the first — an agent repairing one
 * field per run costs a run per defect.
 *
 * The rules, and what each one exists to stop:
 *
 *  - **A reached verdict states what reached it.** `CONFIRMED` and `MISMATCH`
 *    are conclusions and require a non-blank `resolution`; without it a
 *    challenge is dissolved by assertion, which is precisely what §3.3's
 *    "may never dissolve a challenge by reasoning alone" forbids. A blank
 *    resolution is refused under *any* verdict — whitespace is not an
 *    adjudication, and accepting it would let the obligation be satisfied by a
 *    spacebar.
 *  - **`OPEN_QUESTION` may omit a resolution.** It is the absence of one. An
 *    adjudicator forced to write a resolution for an open question would write
 *    something, and "I could not settle this" would start to read like a
 *    finding.
 *  - **`absence` may never be the sole evidence.** §2.2, applied through
 *    `result.ts`'s own predicate so this cannot come to disagree with the
 *    record boundary. Cardinality is the schema's job (`.min(1)`), so this
 *    checks kinds only.
 *  - **Every challenge is adjudicated exactly once, and no adjudication names a
 *    challenge nobody raised.** Not a coverage rule — Task 3 owns those — but
 *    the precondition for assembling `challenges[]` at all: a challenge with no
 *    verdict has no place in the record, and two verdicts for one challenge
 *    make `openQuestions[]` a projection of an ambiguity.
 */
export function assertAdjudication(
  output: AdjudicatorOutput,
  challenges: readonly AdjudicatorChallenge[],
  index = 0,
): AdjudicatorOutput {
  const problems: string[] = [];

  const raised = new Set(challenges.map((challenge) => challenge.id));
  const adjudicated = new Set<string>();

  output.adjudications.forEach((adjudication, position) => {
    const label = `adjudications[${position}] (${adjudication.challengeId})`;

    if (!raised.has(adjudication.challengeId)) {
      problems.push(
        `${label}: names no challenge this run raised; the challenges are ${[...raised].join(', ') || '(none)'}`,
      );
    }
    if (adjudicated.has(adjudication.challengeId)) {
      problems.push(
        `${label}: challenge ${adjudication.challengeId} is adjudicated more than once; an id must name exactly one verdict, or the open-question projection derives from an ambiguity`,
      );
    }
    adjudicated.add(adjudication.challengeId);

    // Two separable branches, and deliberately not one `RESOLVED_VERDICTS.has`
    // call: see `RESOLUTION_REQUIRED_BY_VERDICT`.
    if (RESOLUTION_REQUIRED_BY_VERDICT[adjudication.verdict]) {
      if (!isAdjudicated(adjudication.resolution)) {
        problems.push(
          `${label}: verdict ${adjudication.verdict} requires a non-empty resolution; ${
            adjudication.resolution === undefined ? 'none is present' : 'the one present is blank'
          }. A challenge may not be dissolved by reasoning alone`,
        );
      }
    } else if (adjudication.resolution !== undefined && adjudication.resolution.trim().length === 0) {
      problems.push(
        `${label}: verdict ${adjudication.verdict} may omit a resolution, but a blank one is not an adjudication`,
      );
    }

    if (evidenceIsSolelyAbsence(adjudication.evidence)) {
      problems.push(
        `${label}: every evidence item is an absence claim; lexical absence cannot establish that no equivalent criterion exists under different words, so it may not be the sole evidence for a conclusion`,
      );
    }
  });

  // The completeness rule is the one rule that presumes the run got to the end.
  // §3.0: agent verification *stops* at a gap, and a role that halted is
  // reporting that it could not finish — its adjudications are discarded
  // wholesale by `runAdjudicator` rather than completed. Demanding a verdict per
  // challenge from a halted adjudicator would turn a gap-bearing run, which the
  // contract says is **written**, into an Invalid one, which is **not** — and
  // `gaps[]` would lose its producer for this role. The per-adjudication rules
  // above still apply, because a halting role that did answer some challenges
  // must answer them honestly.
  if (output.gaps.length === 0) {
    for (const id of raised) {
      if (!adjudicated.has(id)) {
        problems.push(
          `challenges: ${id} was raised and never adjudicated; the adjudicator produces a verdict per challenge, and an unadjudicated challenge would enter the record with no judgment behind it`,
        );
      }
    }
  }

  if (problems.length > 0) throw new RoleOutputError('adjudicator', index, problems);
  return output;
}

// ---------------------------------------------------------------------------
// Assembly, and the projection
// ---------------------------------------------------------------------------

/**
 * The record's challenges: Task 3's claims, with Task 4's judgment attached.
 *
 * In challenge order rather than adjudication order, so the record does not
 * depend on the order the model happened to answer in — the ordering of
 * `challenges[]` is part of the canonical result, and a list that reshuffles
 * with the model's phrasing would move `resultSha256` for no substantive
 * reason.
 *
 * **Two evidence arrays, and they answer different questions.** `evidence` stays
 * the *prosecutor's* — why the challenge was raised — per the result-field
 * ownership table. `adjudicationEvidence` is the adjudicator's own, carried
 * here out of `Adjudication.evidence`: why that verdict was reached. Schema
 * 1.2.0 made the second one required, and required for **all three** verdicts.
 * `OPEN_QUESTION` included is the load-bearing part: an open question must
 * never mean "the adjudicator had nothing", it means the evidence was
 * sufficient to establish that this record cannot settle the challenge — which
 * is the thing a human reviewer opens the dossier to read.
 *
 * **They are never concatenated, and never crossed.** Separate arrays are what
 * let `assertSignable`'s on-disk evidence check name *which* array a refusal is
 * about, and what lets the review sheet label them distinctly. Writing
 * `challenge.evidence` into `adjudicationEvidence` would compile, would keep
 * every arity check green, and would silently claim the prosecutor's reasoning
 * as the adjudicator's — so the tests assert the two are distinguishable by
 * document and by quoted text rather than merely present.
 *
 * The seam already validated `adjudication.evidence` (`.min(1)`, never solely
 * `absence`). This is where that validated evidence stops being transcript-only
 * and becomes part of the dossier that gets hashed and signed.
 */
export function assembleChallenges(
  challenges: readonly AdjudicatorChallenge[],
  output: AdjudicatorOutput,
): ResultChallenge[] {
  const byChallengeId = new Map(
    output.adjudications.map((adjudication) => [adjudication.challengeId, adjudication]),
  );
  return challenges.map((challenge) => {
    const adjudication = byChallengeId.get(challenge.id);
    // Unreachable through `runAdjudicator`, which calls `assertAdjudication`
    // first, and *proved* unreachable: removing this throw reddens nothing in
    // the run-level suite. It is kept because `assembleChallenges` is exported
    // and a direct caller skipping the seam could otherwise construct a
    // `ResultChallenge` with no verdict, which is not a record entry at all —
    // and it is exercised through its own entry point rather than left as an
    // untested guard. The message is deliberately the bare one: the seam's
    // carries the reason, so a failure names which mechanism fired.
    if (adjudication === undefined) {
      throw new RoleOutputError('adjudicator', 0, [
        `challenges: ${challenge.id} was raised and never adjudicated`,
      ]);
    }
    return {
      id: challenge.id,
      lens: challenge.lens,
      statement: challenge.statement,
      evidence: challenge.evidence,
      verdict: adjudication.verdict,
      ...(adjudication.resolution === undefined ? {} : { resolution: adjudication.resolution }),
      // The adjudicator's own evidence, not the prosecutor's. Crossing the two
      // typechecks — both are `EvidenceItem[]` — so nothing but a test that
      // compares their contents can catch it.
      adjudicationEvidence: adjudication.evidence,
    };
  });
}

/**
 * `openQuestions[]`, derived from the verdicts and from nothing else.
 *
 * **One concept, one producer.** The adjudicator has no key it could author
 * this list in — `adjudicatorOutputSchema` carries no `openQuestions` field and
 * is `.strict()` — so there is no second list to reconcile with. Each entry's
 * `id` and `statement` are the challenge's own, so an open question always
 * resolves back to the challenge that raised it.
 *
 * The consequence is deliberate: `sign.ts` refuses on a challenge verdicted
 * `OPEN_QUESTION` *and* separately on every `openQuestions[]` entry, and
 * deriving the list means those two refusals now always fire together. That is
 * belt and braces over one truth rather than two lists that can disagree — and
 * it is why the sign gate is corroboration for this rule and never the evidence
 * for it: both refusals firing says nothing about which producer wrote the list.
 */
export function projectOpenQuestions(challenges: readonly ResultChallenge[]): OpenQuestion[] {
  return challenges
    .filter((challenge) => challenge.verdict === 'OPEN_QUESTION')
    .map((challenge) => ({ id: challenge.id, statement: challenge.statement }));
}

// ---------------------------------------------------------------------------
// Running it
// ---------------------------------------------------------------------------

/** What the adjudicator was asked, what came back, and what the run may rely on. */
export interface AdjudicatorOutcome {
  /** The projection the adjudicator actually received. */
  input: AdjudicatorInput;
  /**
   * The seam-validated output, canonicalised the way the reader's is: the
   * classified gaps rather than the role's own wording of them, and the
   * adjudications discarded when there are any. The agent's original response
   * survives verbatim in `execution.transcript`, which is where a human looks
   * to see what it had managed before it stopped.
   */
  output: AdjudicatorOutput;
  /**
   * The record's challenges, canonically empty when a gap was hit.
   *
   * §3.0 forbids topping a judgment up past a gap, for the reader's reason
   * exactly: the evidence surface itself was incomplete, so judgments formed
   * against it would give the dossier hybrid provenance that
   * `corpusClosureSha256` cannot describe. The agent's original words survive
   * verbatim in the transcript.
   */
  challenges: ResultChallenge[];
  /** The projection of the list above. Never authored, here or anywhere. */
  openQuestions: OpenQuestion[];
  /** Every gap, classified by the machinery rather than believed from the role. */
  gaps: DocumentGap[];
  halted: boolean;
  execution: RoleExecution<AdjudicatorOutput>;
}

export interface AdjudicatorRun {
  /** Already projected. This function never sees a prosecutor's execution. */
  input: AdjudicatorInput;
  prompt: RolePrompt;
  model: string;
  runner: AgentRunner;
  index?: number;
}

/**
 * Runs the adjudicator.
 *
 * The order is load-bearing:
 *
 *  1. **The input is checked before the model is contacted.** A widened input
 *     is orchestration's defect and must fail without spending a call — and
 *     without the transcript recording an exchange over material §3.3 does not
 *     grant.
 *  2. **The seam parses and gates the response**, inside `createAgentRole`'s
 *     `parse`, so nothing downstream — including the deterministic tail — ever
 *     sees raw output. Malformed shape, a blank resolution on a conclusion,
 *     sole-absence evidence and an unadjudicated challenge all fail here, named
 *     against the adjudicator.
 *  3. **The gaps are classified, not believed.** The role can say *that* it
 *     could not reach a document; which population that belongs to is a fact
 *     about the corpus and the closure.
 *  4. **The record's challenges are assembled, and `openQuestions[]` is
 *     projected from them.** In that order, and by these two functions only.
 */
export async function runAdjudicator(run: AdjudicatorRun): Promise<AdjudicatorOutcome> {
  const index = run.index ?? 0;

  // Before the model is contacted. A run that was handed reasoning must not
  // record an exchange over it.
  const input = assertAdjudicatorInputFields(run.input);

  const role = createAgentRole<AdjudicatorInput, AdjudicatorOutput>({
    name: 'adjudicator',
    index,
    model: run.model,
    prompt: run.prompt,
    runner: run.runner,
    renderInput: renderAdjudicatorInput,
    // Shape, then the adjudication rules, then every verdict quote's docId and
    // hash against the closure — refused here, before assembly (`quote-pins.ts`).
    parse: (raw) =>
      assertAdjudicatorQuotesPinned(
        assertAdjudication(parseRoleOutput('adjudicator', index, raw), input.challenges, index),
        input.closure,
        index,
      ),
  });

  const execution = await role.run(input);

  let gaps: DocumentGap[];
  try {
    gaps = execution.output.gaps.map((gap) =>
      gapForUnreachableDocument(input.closure, gap.docId, gap.detail),
    );
  } catch (error) {
    throw new RoleOutputError('adjudicator', index, [
      error instanceof Error ? error.message : String(error),
    ]);
  }

  if (gaps.length > 0) {
    return {
      input,
      output: { adjudications: [], gaps },
      challenges: [],
      openQuestions: [],
      gaps,
      halted: true,
      execution,
    };
  }

  const challenges = assembleChallenges(input.challenges, execution.output);

  return {
    input,
    output: { adjudications: execution.output.adjudications, gaps },
    challenges,
    openQuestions: projectOpenQuestions(challenges),
    gaps,
    halted: false,
    execution,
  };
}
