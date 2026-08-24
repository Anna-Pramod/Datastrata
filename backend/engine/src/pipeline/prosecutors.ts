/**
 * The prosecutors — §3.2 — and the bidirectional coverage table they build.
 *
 * **This module proves prosecutor machinery. It makes no claim about what live
 * lenses discover.** Whether N lenses find meaningfully different defects is a
 * property of models, measurable only by a live run (§5.2), and B3 measures it.
 * Everything here is replayable, and nothing here would be evidence of model
 * behaviour if it passed.
 *
 * Four properties decide the shape of this file.
 *
 * **A prosecutor challenges; it never adjudicates.** `CONFIRMED`, `MISMATCH`
 * and `OPEN_QUESTION` are the adjudicator's vocabulary (§3.3), and a prosecutor
 * reaching for one would be making the judgment adjudication exists to reserve.
 * So the challenge a prosecutor emits is derived from the *record's* challenge
 * shape with `verdict` and `resolution` removed — `ChallengeSeed` below — and
 * the derivation is asserted at compile time against the seam schema. A verdict
 * is not "validated away"; there is no key it could occupy.
 *
 * **Coverage is walked in both directions.** `reading_to_condition` catches law
 * the encoding missed; `condition_to_reading` catches encoding the law does not
 * support. A one-directional table cannot see invented encoding at all, so the
 * assembled table is refused when a direction is missing and there was material
 * to walk it over.
 *
 * **The address vocabulary is derived, not invented.** A `conditionPath` is an
 * `AtomFeature.path` out of `verification/features.ts` — `root`, `all[0]`,
 * `all[1].any[0]` — plus the group addresses those atom paths imply. That
 * module's walker is the one the render checker already compares against, so
 * the pipeline and the checker cannot come to disagree about what part of the
 * encoding a cell is talking about. A second hand-rolled walker here would be
 * failure mode #1 of `docs/superpowers/TEST-EVIDENCE-STANDARD.md`: a checker
 * built from the same model as the thing checked, agreeing with its systematic
 * errors.
 *
 * **A configured lens that produced no exchange fails by name.** Silently
 * skipping it would make the prosecutor count and the lens set — both
 * `pipelineVersion` inputs, both things B3 varies and measures — a configuration
 * that is not being run. The run would report an identity for a pipeline it did
 * not execute.
 *
 * Pure: no filesystem, no network, no clock. The runner is injected and the
 * closure did all the reading.
 */

import { lensFor, type RoleConfig } from './config';
import { renderEntitledClosure, type EntitledClosure } from './entitlement';
import { gapForUnreachableDocument, type DocumentGap } from './gaps';
import type { RolePrompt } from './prompts';
import { parseRoleOutput, type ProsecutorOutput, type ReaderOutput } from './role-outputs';
import { createAgentRole } from './agent-role';
import { RoleOutputError, RoleTransportError, type RoleExecution } from './roles';
import { TranscriptReplayError } from './replay';
import type { AgentRunner } from './runner';
import type { AuthoredRequirement } from '../types';
import {
  ADVERSE_COVERAGE,
  challengeVerdictSchema,
  coverageDirectionSchema,
  coverageVerdictSchema,
  evidenceIsSolelyAbsence,
  type VerificationResult,
} from '../verification/result';
import { featuresFromRequirement, type FeatureContext } from '../verification/features';

// ---------------------------------------------------------------------------
// The vocabularies, taken off the schemas rather than restated
// ---------------------------------------------------------------------------

type CoverageDirection = (typeof coverageDirectionSchema.options)[number];
type CoverageVerdict = (typeof coverageVerdictSchema.options)[number];
type ChallengeVerdict = (typeof challengeVerdictSchema.options)[number];

/** One cell as the seam accepts it, and as the record carries it. */
export type ProsecutorCoverageCell = ProsecutorOutput['coverage'][number];
/** One challenge as the seam accepts it. */
export type ProsecutorChallenge = ProsecutorOutput['challenges'][number];

type ResultCoverageCell = VerificationResult['coverage']['cells'][number];
type ResultChallenge = VerificationResult['challenges'][number];

/**
 * A challenge before anyone has adjudicated it.
 *
 * `Omit` of the record's own challenge, deliberately, and this is the one place
 * in the pipeline where `Omit` is the right tool rather than the wrong one. The
 * reader's projection is positive because a field added to the requirement next
 * year must not silently reach a blind role; here the danger runs the other way.
 * A field added to `challengeSchema` is a field the record expects a challenge
 * to carry, and the prosecutor is the only producer of everything except the
 * adjudication — so it *should* flow here automatically, and the three fields
 * the adjudicator owns are named as the exceptions. Adding a fourth
 * adjudicator-owned field without naming it here makes the witness below fail
 * to compile, and that is how `adjudicationEvidence` arrived: schema 1.2.0 gave
 * the adjudicated verdict its own evidence array, and the line below stopped
 * compiling until the new field was named as the adjudicator's. Note the
 * asymmetry the list encodes — `evidence` is the prosecutor's own and stays,
 * `adjudicationEvidence` is the adjudicator's and goes; a seed carrying both
 * would let a prosecutor pre-supply the reasoning for a verdict it is forbidden
 * to reach.
 */
export type ChallengeSeed = Omit<ResultChallenge, 'verdict' | 'resolution' | 'adjudicationEvidence'>;

/**
 * The prosecutor's challenge is exactly the record's, minus the adjudication.
 *
 * Mutual assignability, not one-way: a one-way check would pass if the seam
 * schema dropped `lens`, and a challenge with no lens makes the lens set
 * unmeasurable. `true` does not inhabit `never`, so any divergence fails to
 * compile at this line.
 */
export type ProsecutorChallengeIsARecordChallengeSeed = ProsecutorChallenge extends ChallengeSeed
  ? ChallengeSeed extends ProsecutorChallenge
    ? true
    : never
  : never;

export const PROSECUTOR_CHALLENGE_IS_A_RECORD_CHALLENGE_SEED: ProsecutorChallengeIsARecordChallengeSeed =
  true;

/**
 * No verdict key exists on a prosecutor's challenge, or on its output.
 *
 * Stated as a type rather than as a comment, because "the schema is `.strict()`
 * so a `verdict` is rejected" is a *runtime* claim and says nothing about what
 * the pipeline's own code could construct. These two lines fail to compile the
 * moment a verdict key appears in either shape.
 */
export type ProsecutorChallengeCarriesNoVerdict = 'verdict' extends keyof ProsecutorChallenge
  ? never
  : true;
export type ProsecutorOutputCarriesNoVerdict = 'verdict' extends keyof ProsecutorOutput
  ? never
  : true;

export const PROSECUTOR_CHALLENGE_CARRIES_NO_VERDICT: ProsecutorChallengeCarriesNoVerdict = true;
export const PROSECUTOR_OUTPUT_CARRIES_NO_VERDICT: ProsecutorOutputCarriesNoVerdict = true;

/**
 * The one verdict key a prosecutor *does* carry names a coverage verdict, and
 * the two vocabularies are disjoint.
 *
 * A coverage cell's `verdict` is `MAPPED | UNMAPPED | UNSUPPORTED | UNCERTAIN`
 * — a statement about whether two things met, not an adjudication. The hazard
 * is a future widening of `coverageVerdictSchema` that lets `MISMATCH` through
 * a field the type system still calls a coverage verdict. `Extract` over the
 * two inferred unions is the compile-time half of that guard, and
 * `assertVerdictVocabulariesDisjoint` is the runtime half over the same two
 * enums' `.options`. Both are derived from the schemas; neither restates them.
 */
export type CoverageVerdictExcludesAdjudication = Extract<
  CoverageVerdict,
  ChallengeVerdict
> extends never
  ? true
  : never;

export const COVERAGE_VERDICT_EXCLUDES_ADJUDICATION: CoverageVerdictExcludesAdjudication = true;

/**
 * The adverse verdicts, **derived from `result.ts`'s set rather than restated**.
 *
 * The earlier form here was `options.filter(v => v !== 'MAPPED')` — everything
 * but `MAPPED` — which happens to agree with `ADVERSE_COVERAGE` today and is a
 * second, independent definition of the same word. A fifth coverage verdict
 * would have separated them: this seam would demand a `challengeId` that
 * `assertResultConsistency` never checks for, and the adverse→challenge link
 * would be enforced in one place and not the other. `result.ts` owns the record
 * boundary, so `result.ts` is the authority and this is the consumer.
 *
 * The intersection with the enum is taken rather than the set used directly, so
 * the value stays typed as coverage verdicts; the test suite asserts the two
 * cover each other exactly, in both directions.
 */
export const ADVERSE_COVERAGE_VERDICTS: readonly CoverageVerdict[] =
  coverageVerdictSchema.options.filter((verdict) => ADVERSE_COVERAGE.has(verdict));

/**
 * The definite adverse verdict each direction owns.
 *
 * `UNMAPPED` is a reading element with no encoding behind it and can only arise
 * walking reading→condition; `UNSUPPORTED` is encoding with no law behind it and
 * can only arise walking condition→reading. A cell carrying the other
 * direction's verdict has mislabelled which way it was walked, and a table whose
 * directions are interchangeable is a one-directional table with two names.
 * `UNCERTAIN` belongs to both.
 */
export const DIRECTION_DEFINITE_ADVERSE: Readonly<Record<CoverageDirection, CoverageVerdict>> = {
  reading_to_condition: 'UNMAPPED',
  condition_to_reading: 'UNSUPPORTED',
};

/**
 * A prosecutor could emit an adjudication's word through a coverage verdict.
 *
 * Its own error because the repair is a schema decision rather than a run-time
 * one: if the two enums ever overlap, the pipeline's structural guarantee that
 * "a prosecutor cannot adjudicate" has been withdrawn, and no amount of care in
 * this file restores it.
 */
export class VerdictVocabulariesOverlapError extends Error {
  constructor(readonly overlap: readonly string[]) {
    super(
      `the coverage vocabulary and the adjudication vocabulary overlap on ${overlap.join(', ')}: a prosecutor emitting a coverage verdict would then be able to adjudicate, which §3.2 reserves to the adjudicator`,
    );
    this.name = 'VerdictVocabulariesOverlapError';
  }
}

/** The runtime half of the disjointness guard. Called on every prosecutor output. */
export function assertVerdictVocabulariesDisjoint(): void {
  const adjudication = new Set<string>(challengeVerdictSchema.options);
  const overlap = coverageVerdictSchema.options.filter((verdict) => adjudication.has(verdict));
  if (overlap.length > 0) throw new VerdictVocabulariesOverlapError(overlap);
}

// ---------------------------------------------------------------------------
// Blindness to peers, as a type
// ---------------------------------------------------------------------------

/**
 * Whether a field's type is, or contains, another prosecutor's output.
 *
 * The array branch is not decoration: the adjudicator's input carries
 * `prosecutions: readonly ProsecutorOutput[]`, which is exactly the shape a
 * well-meaning refactor would reach for when "letting the prosecutors see the
 * earlier passes" — and `readonly ProsecutorOutput[]` does not extend
 * `ProsecutorOutput`, so a check without this branch would wave it through.
 */
export type CarriesPeerOutput<T> = T extends ProsecutorOutput
  ? true
  : T extends readonly (infer Element)[]
    ? CarriesPeerOutput<Element>
    : false;

/**
 * The constraint a prosecutor input must satisfy, written F-bounded in the same
 * form as `PinFree`: a type is a legal prosecutor input when `I extends
 * PeerFree<I>`.
 *
 * `PeerFree<I>` is `I` with every field that carries a prosecutor output
 * rewritten to `never`, so a type with no such field is unchanged and satisfies
 * the constraint, while `{ peers: ProsecutorOutput[] }` becomes
 * `{ peers: never }` and fails it. Written F-bounded rather than as a mapped
 * optional-never for the reason `roles.ts` gives at length: the naive form is a
 * *weak type* that rejects every honest input instead.
 *
 * **Why the type rather than the prompt.** N prosecutors that can see each
 * other's work are one prosecutor with more tokens: the second agrees with the
 * first, the union of their findings collapses toward the first's, and the lens
 * set stops being a set. A prompt saying "you do not see the others" is a
 * promise the pipeline makes to itself; this is a shape in which a peer's output
 * has nowhere to sit.
 *
 * **Where the guarantee stops, stated rather than assumed.** This is a *shallow*
 * check: it inspects each field's own type and recurses through arrays, and it
 * does not descend into an object type's members. A peer smuggled inside an
 * existing field — `reading: ReaderOutput & { peers: ProsecutorOutput[] }` —
 * satisfies it. That is deliberate and is the same depth as `PinFree` in
 * `roles.ts`, because a fully recursive version would have to walk
 * `EntitledClosure` and every corpus type behind it, and a constraint that
 * expensive to satisfy gets loosened rather than obeyed. The realistic route is
 * covered elsewhere: `ProsecutorInput` is a closed interface with a named field
 * list, `prosecutorInputFor` is the only builder and takes a closed object type,
 * and `PROSECUTOR_INPUT_FIELDS` is asserted against the built input's exact key
 * set. Adding a peer means widening one of those in a visible edit, not
 * slipping a type past this line.
 */
export type PeerFree<I> = {
  [K in keyof I]: CarriesPeerOutput<I[K]> extends true ? never : I[K];
};

// ---------------------------------------------------------------------------
// The input — §3.2's list, and a closed one
// ---------------------------------------------------------------------------

/**
 * Everything one prosecutor is given.
 *
 * `reading` is the blind reader's output, `renderedCondition` is the exact
 * English the reviewer reads, `lens` is the single angle this pass works, and
 * `closure` is the evidence surface and the only route to any text. There is no
 * field for another prosecutor's output, no field for a defence, and no second
 * route to a document.
 *
 * `conditionPaths` is the fifth field and the one that is a judgment rather than
 * a transcription of §3.2's list. It is the **address vocabulary** of the
 * condition the prosecutor is already holding: `conditionPathsFor` derives it
 * from the same requirement `renderedCondition` was rendered from, so it carries
 * no information the prosecutor does not already have and cannot be a fifth
 * source. It is here because the `condition_to_reading` direction is only
 * anchored if a cell's `conditionPath` is checkable against the encoding's real
 * structure — and a prosecutor never shown the vocabulary would have to invent
 * addresses, which makes the anchor unsatisfiable rather than strict.
 */
export interface ProsecutorInput {
  reading: ReaderOutput;
  /** The exact English the reviewer reads, from `renderRequirement`. */
  renderedCondition: string;
  /** The structural addresses of that same condition. Derived, never authored. */
  conditionPaths: readonly string[];
  lens: string;
  /** The capability. The whole of the evidence surface, and the only route to it. */
  closure: EntitledClosure;
}

/**
 * The exact field set, as a value, so the closed list is checkable at runtime.
 *
 * Sorted, and compared against `Object.keys` of a built input. A field added to
 * the interface without being added here fails a test rather than quietly
 * widening what a prosecutor is shown.
 */
export const PROSECUTOR_INPUT_FIELDS: readonly string[] = [
  'closure',
  'conditionPaths',
  'lens',
  'reading',
  'renderedCondition',
];

/** `ProsecutorInput` itself is peer-free. Fails to compile if it stops being. */
export type ProsecutorInputIsPeerFree = ProsecutorInput extends PeerFree<ProsecutorInput>
  ? true
  : never;
export const PROSECUTOR_INPUT_IS_PEER_FREE: ProsecutorInputIsPeerFree = true;

/** Builds the input, field by named field. The only builder there is. */
export function prosecutorInputFor(input: {
  reading: ReaderOutput;
  renderedCondition: string;
  conditionPaths: readonly string[];
  lens: string;
  closure: EntitledClosure;
}): ProsecutorInput {
  return {
    reading: input.reading,
    renderedCondition: input.renderedCondition,
    conditionPaths: input.conditionPaths,
    lens: input.lens,
    closure: input.closure,
  };
}

/**
 * The message one prosecutor receives, as a function of `ProsecutorInput` alone.
 *
 * **`renderEntitledClosure` is the shared renderer, called unparameterised.**
 * Task 2 made it shared across all four role renderers precisely so that two
 * copies could not drift and silently change what the *reader* sees — the
 * blindness boundary. Nothing about the prosecutor needs the closure presented
 * differently: it reads the same documents for the same reason. If that ever
 * changes, the function is parameterised, never forked.
 */
export function renderProsecutorInput(input: ProsecutorInput): string {
  return [
    `# Lens\n\n${input.lens}`,
    `# Blind reading\n\n${JSON.stringify(input.reading, null, 2)}`,
    `# Rendered condition\n\n${input.renderedCondition}`,
    `# Condition addresses\n\n${input.conditionPaths.join('\n')}`,
    `# Entitled closure (${input.closure.sha256})\n\n${renderEntitledClosure(input.closure)}`,
  ].join('\n\n');
}

// ---------------------------------------------------------------------------
// The address vocabulary of the encoding
// ---------------------------------------------------------------------------

/**
 * Every address a `condition_to_reading` cell may name.
 *
 * Atom addresses come straight from `featuresFromRequirement`, which is the
 * walker the render checker already uses, so a cell's `conditionPath` names the
 * same part of the tree both sides of the pipeline mean by it. Group addresses
 * are the strict prefixes those atom paths imply, plus `root` for the condition
 * as a whole — without them the `wrong_conjunction` lens has no address for the
 * defect it exists to raise, because a conjunction is a node and never a leaf.
 *
 * A `selection` requirement's cases are addressed `cases[i].<path>`, so two
 * cases carrying structurally identical conditions do not collapse onto one
 * address.
 *
 * Sorted, so the vocabulary a run shows a prosecutor is the same twice.
 */
export function conditionPathsFor(
  requirement: AuthoredRequirement,
  ctx: FeatureContext,
): readonly string[] {
  const features = featuresFromRequirement(requirement, ctx);
  const atomPaths: string[] =
    features.kind === 'selection'
      ? (features.cases ?? []).flatMap((c) =>
          c.when.atoms.map((atom) => `cases[${c.index}].${atom.path}`),
        )
      : (features.condition?.atoms ?? []).map((atom) => atom.path);

  if (atomPaths.length === 0) return [];

  const addresses = new Set<string>(['root']);
  for (const path of atomPaths) {
    addresses.add(path);
    const parts = path.split('.');
    for (let i = 1; i < parts.length; i += 1) addresses.add(parts.slice(0, i).join('.'));
  }
  return [...addresses].sort();
}

// ---------------------------------------------------------------------------
// The per-prosecutor gate
// ---------------------------------------------------------------------------

/** What a cell's ids are checked against. Both sets, so both directions anchor. */
export interface CoverageContext {
  readingElementIds: readonly string[];
  conditionPaths: readonly string[];
}

/** The context a reading and a requirement add up to. */
export function coverageContextFor(
  reading: ReaderOutput,
  conditionPaths: readonly string[],
): CoverageContext {
  return {
    readingElementIds: reading.elements.map((element) => element.id),
    conditionPaths,
  };
}

function cellAddress(cell: ProsecutorCoverageCell): string {
  return `${cell.direction} ${cell.readingElementId ?? '—'} → ${cell.conditionPath ?? '—'}`;
}

/**
 * Every rule a prosecutor's coverage and challenges must satisfy, checked at the
 * boundary of the role that produced them.
 *
 * Here rather than only in the tail for the reason `assertReaderEvidence` gives:
 * a defect in prosecutor 1's table is prosecutor 1's defect and should be named
 * against it, at the moment it arrives, rather than three stages later as an
 * inconsistent `verification-result.json` whose message points at a schema path.
 *
 * Every problem is collected, never only the first — an agent repairing one
 * field per run costs a run per defect.
 *
 * The rules, and what each one exists to stop:
 *
 *  - **Direction owns its definite adverse verdict.** `UNMAPPED` in
 *    `condition_to_reading` is a mislabelled walk, and a table whose two
 *    directions are interchangeable is one direction with two names.
 *  - **The direction's own axis is required and must resolve.** A
 *    `reading_to_condition` cell is *about* a reading element; a
 *    `condition_to_reading` cell is about a condition address. A cell missing
 *    its own axis is a coverage claim about nothing.
 *  - **The counterpart axis is present exactly when the verdict says it met
 *    something.** `MAPPED` without a counterpart claims a mapping to nothing;
 *    `UNMAPPED`/`UNSUPPORTED` *with* one contradicts the word.
 *  - **Adverse coverage names a challenge this prosecutor actually raised.**
 *    This is where `assertResultConsistency`'s adverse→challenge link
 *    originates. The converse too: a `MAPPED` cell citing a challenge claims an
 *    adjudication for something that needed none.
 *  - **A challenge's lens is this prosecutor's lens.** The lens set is a
 *    `pipelineVersion` input; a challenge filed under a lens nobody ran makes
 *    the recorded identity describe a pipeline that did not execute.
 *  - **`absence` may never be the sole evidence.** §2.2, applied through
 *    `result.ts`'s own predicate so this cannot come to disagree with the record
 *    boundary.
 */
export function assertProsecutorCoverage(
  output: ProsecutorOutput,
  ctx: CoverageContext,
  index = 0,
): ProsecutorOutput {
  assertVerdictVocabulariesDisjoint();

  const problems: string[] = [];
  const readingIds = new Set(ctx.readingElementIds);
  const paths = new Set(ctx.conditionPaths);

  const challengeIds = new Set<string>();
  output.challenges.forEach((challenge, position) => {
    const label = `challenges[${position}] (${challenge.id})`;
    if (challengeIds.has(challenge.id)) {
      problems.push(
        `${label}: duplicate challenge id; an adverse cell naming it would resolve to two challenges and a gate would have to guess which one`,
      );
    }
    challengeIds.add(challenge.id);
    if (challenge.lens !== output.lens) {
      problems.push(
        `${label}: filed under lens ${challenge.lens}, but this prosecutor works lens ${output.lens}; the lens set is a pipelineVersion input, so a challenge under a lens nobody ran makes the recorded identity describe a pipeline that did not execute`,
      );
    }
    if (evidenceIsSolelyAbsence(challenge.evidence)) {
      problems.push(
        `${label}: every evidence item is an absence claim; lexical absence cannot establish that no equivalent criterion exists under different words, so it may not be the sole evidence for a conclusion`,
      );
    }
  });

  output.coverage.forEach((cell, position) => {
    const label = `coverage[${position}] (${cellAddress(cell)})`;

    const owned = DIRECTION_DEFINITE_ADVERSE[cell.direction];
    const otherDirection = coverageDirectionSchema.options.find(
      (direction) => direction !== cell.direction,
    );
    if (otherDirection !== undefined && cell.verdict === DIRECTION_DEFINITE_ADVERSE[otherDirection]) {
      problems.push(
        `${label}: verdict ${cell.verdict} belongs to ${otherDirection}; walking ${cell.direction} can only yield ${owned}, and a table whose directions are interchangeable is one direction under two names`,
      );
    }

    const ownAxis = cell.direction === 'reading_to_condition' ? 'readingElementId' : 'conditionPath';
    const counterpartAxis =
      cell.direction === 'reading_to_condition' ? 'conditionPath' : 'readingElementId';
    const ownValue = cell.direction === 'reading_to_condition' ? cell.readingElementId : cell.conditionPath;
    const counterpartValue =
      cell.direction === 'reading_to_condition' ? cell.conditionPath : cell.readingElementId;

    if (ownValue === undefined) {
      problems.push(
        `${label}: a ${cell.direction} cell must name its own ${ownAxis}; a cell missing the axis it was walked along is a coverage claim about nothing`,
      );
    }
    if (cell.readingElementId !== undefined && !readingIds.has(cell.readingElementId)) {
      problems.push(
        `${label}: readingElementId ${cell.readingElementId} names no element of the blind reading`,
      );
    }
    if (cell.conditionPath !== undefined && !paths.has(cell.conditionPath)) {
      problems.push(
        `${label}: conditionPath ${cell.conditionPath} is not an address of this condition; the addresses are ${ctx.conditionPaths.join(', ') || '(none)'}`,
      );
    }

    if (cell.verdict === 'MAPPED' && counterpartValue === undefined) {
      problems.push(
        `${label}: a MAPPED cell must name the ${counterpartAxis} it mapped to; a mapping to nothing is not a mapping`,
      );
    }
    if (cell.verdict === owned && counterpartValue !== undefined) {
      problems.push(
        `${label}: verdict ${owned} names a ${counterpartAxis}; ${owned} is precisely the case where there is no counterpart`,
      );
    }

    const adverse = ADVERSE_COVERAGE_VERDICTS.includes(cell.verdict);
    if (adverse && cell.challengeId === undefined) {
      problems.push(
        `${label}: verdict ${cell.verdict} carries no challengeId; adverse coverage must name the challenge raised for it, or the record reports a defect nobody argued`,
      );
    } else if (adverse && cell.challengeId !== undefined && !challengeIds.has(cell.challengeId)) {
      problems.push(
        `${label}: challengeId ${cell.challengeId} names no challenge this prosecutor raised`,
      );
    } else if (!adverse && cell.challengeId !== undefined) {
      problems.push(
        `${label}: a MAPPED cell names challengeId ${cell.challengeId}; a mapped cell has nothing to challenge`,
      );
    }
  });

  if (problems.length > 0) throw new RoleOutputError('prosecutor', index, problems);
  return output;
}

// ---------------------------------------------------------------------------
// The assembled table
// ---------------------------------------------------------------------------

/** The coverage table and the challenges behind it, across every prosecutor. */
export interface CoverageTable {
  cells: ResultCoverageCell[];
  /** Challenges without verdicts. Task 4 adjudicates; this cannot pre-empt it. */
  challenges: ChallengeSeed[];
}

/**
 * A challenge id qualified by the prosecutor that raised it.
 *
 * Prosecutors are blind to one another, so two of them naming a challenge `C1`
 * is the expected case rather than a collision to be blamed on either.
 * `assertResultConsistency` requires challenge ids to name exactly one thing —
 * an adverse cell naming `C1` when two challenges carry it "resolves to a real
 * challenge twice over" — so the qualification happens here, at the one place
 * that can see every prosecutor at once.
 */
export function qualifiedChallengeId(index: number, id: string): string {
  return `P${index}-${id}`;
}

/**
 * Merges the prosecutors' tables into one, in prosecutor order.
 *
 * **Concatenated, not reconciled.** Two lenses may reach the same address and
 * disagree — lens 0 finding a criterion mapped where lens 2 finds it uncertain —
 * and collapsing that into one verdict would be a judgment about which lens was
 * right, which is the adjudicator's business and not deterministic machinery's.
 * Both cells stand, each still naming the challenge its own prosecutor raised.
 *
 * The only rewriting is the challenge-id qualification, and it is applied to the
 * cells' `challengeId` in the same pass so a link cannot be left pointing at the
 * unqualified id.
 */
export function buildCoverageTable(prosecutions: readonly ProsecutorOutput[]): CoverageTable {
  const cells: ResultCoverageCell[] = [];
  const challenges: ChallengeSeed[] = [];

  prosecutions.forEach((prosecution, index) => {
    for (const challenge of prosecution.challenges) {
      challenges.push({
        id: qualifiedChallengeId(index, challenge.id),
        lens: challenge.lens,
        statement: challenge.statement,
        evidence: challenge.evidence,
      });
    }
    for (const cell of prosecution.coverage) {
      cells.push({
        direction: cell.direction,
        ...(cell.readingElementId === undefined ? {} : { readingElementId: cell.readingElementId }),
        ...(cell.conditionPath === undefined ? {} : { conditionPath: cell.conditionPath }),
        verdict: cell.verdict,
        ...(cell.challengeId === undefined
          ? {}
          : { challengeId: qualifiedChallengeId(index, cell.challengeId) }),
      });
    }
  });

  return { cells, challenges };
}

/** The assembled table walked only one way. */
export class OneDirectionalCoverageError extends Error {
  constructor(readonly missing: readonly string[]) {
    super(
      `the assembled coverage table carries no ${missing.join(' and no ')} cell: coverage is bidirectional, and a table walked only one way cannot find what the encoding says and the law does not`,
    );
    this.name = 'OneDirectionalCoverageError';
  }
}

/**
 * Both directions were actually walked.
 *
 * Guarded on there being material to walk over — a reading with no elements and
 * a condition with no addresses have no cells to produce, and demanding them
 * would turn an empty question into a failure. Where there *is* material, a
 * missing direction is refused by name: §3.2's whole argument for the second
 * direction is that the first cannot see invented encoding, and a run that
 * reports one direction has not made that check.
 */
export function assertBothDirectionsWalked(table: CoverageTable, ctx: CoverageContext): void {
  if (ctx.readingElementIds.length === 0 || ctx.conditionPaths.length === 0) return;
  const walked = new Set(table.cells.map((cell) => cell.direction));
  const missing = coverageDirectionSchema.options.filter((direction) => !walked.has(direction));
  if (missing.length > 0) throw new OneDirectionalCoverageError(missing);
}

// ---------------------------------------------------------------------------
// Running them
// ---------------------------------------------------------------------------

/**
 * A configured lens produced no exchange at all.
 *
 * The honest replayable form of "the configuration is not a lie": three
 * configured lenses require three recorded exchanges, and a lens with none fails
 * by name rather than being silently skipped. Skipping it would let a run record
 * a `pipelineVersion` derived from a prosecutor count and a lens set it did not
 * execute — and B3 measures pipelines by comparing runs of known identity, so
 * the measurement would be over a pipeline that never ran.
 */
export class ProsecutorTranscriptMissingError extends Error {
  constructor(
    readonly index: number,
    readonly lens: string,
    detail: string,
  ) {
    super(
      `prosecutor[${index}] working lens ${lens} has no recorded exchange: ${detail}. A configured lens with no exchange fails by name rather than being skipped — a run that skipped it would claim a pipelineVersion for a lens set it did not execute`,
    );
    this.name = 'ProsecutorTranscriptMissingError';
  }
}

/** The lenses that ran are not the lenses that were configured. */
export class ProsecutorLensMismatchError extends Error {
  constructor(
    readonly configured: readonly string[],
    readonly reported: readonly string[],
  ) {
    super(
      `the configured lens sequence [${configured.join(', ')}] is not the sequence the prosecutors answered under [${reported.join(', ')}]: the lens set is a pipelineVersion input, so a run whose lenses differ from its configuration records an identity for a pipeline that did not execute`,
    );
    this.name = 'ProsecutorLensMismatchError';
  }
}

/** The lens sequence a configuration calls for, position by position. */
export function configuredLenses(config: RoleConfig): readonly string[] {
  const lenses: string[] = [];
  for (let index = 0; index < config.prosecutorCount; index += 1) lenses.push(lensFor(config, index));
  return lenses;
}

/**
 * The lenses that answered are the lenses that were configured.
 *
 * A separate, directly-callable function taking two plain lists, because
 * `runProsecutors` cannot produce a short list without a mutation and a check
 * only reachable through its natural caller is a check whose conjuncts mask one
 * another (failure mode #4). Called on every run, and it catches a live case the
 * loop cannot: a prosecutor answering under a lens other than the one it was
 * handed.
 */
export function assertEveryLensRan(
  configured: readonly string[],
  reported: readonly string[],
): void {
  if (configured.length !== reported.length) throw new ProsecutorLensMismatchError(configured, reported);
  for (let index = 0; index < configured.length; index += 1) {
    if (configured[index] !== reported[index]) {
      throw new ProsecutorLensMismatchError(configured, reported);
    }
  }
}

export interface ProsecutorsRun {
  /** The blind reading, already classified by the reader's own machinery. */
  reading: ReaderOutput;
  renderedCondition: string;
  conditionPaths: readonly string[];
  closure: EntitledClosure;
  config: RoleConfig;
  prompt: RolePrompt;
  runner: AgentRunner;
}

export interface ProsecutorsOutcome {
  executions: RoleExecution<ProsecutorOutput>[];
  /**
   * The outputs the run may rely on, canonically emptied when a gap was hit.
   *
   * §3.0 forbids topping a judgment up past a gap, and the reasoning is the
   * reader's exactly: the evidence surface itself was incomplete, so coverage
   * and challenges formed against it would give the dossier hybrid provenance.
   * The agent's original words survive verbatim in the transcript.
   */
  outputs: ProsecutorOutput[];
  /** Every gap, classified by the machinery rather than believed from the role. */
  gaps: DocumentGap[];
  halted: boolean;
  /** Empty when halted, for the same reason `outputs` is. */
  table: CoverageTable;
}

/**
 * Runs the configured prosecutors, in order, each blind to the others.
 *
 * Blindness is enforced by construction as well as by type: the input handed to
 * prosecutor *i* is built fresh from the reading, the condition and the closure,
 * and `executions` is never read while the loop runs. There is no accumulator a
 * later pass could see.
 *
 * Sequential, deliberately, as orchestration already was: prosecutors are
 * independent and could run at once, and running them in order keeps the
 * transcript's `roles[]` in a fixed order. A transcript whose contents depend on
 * scheduling is a replay input that is not quite the same twice.
 *
 * The count and the lens sequence come from the configuration and from nowhere
 * else — both are `pipelineVersion` inputs (§5.1), and a count hard-coded here
 * would be configuration that cannot vary and therefore cannot be measured.
 */
export async function runProsecutors(run: ProsecutorsRun): Promise<ProsecutorsOutcome> {
  const ctx = coverageContextFor(run.reading, run.conditionPaths);
  const configured = configuredLenses(run.config);

  const executions: RoleExecution<ProsecutorOutput>[] = [];
  const gaps: DocumentGap[] = [];

  for (let index = 0; index < configured.length; index += 1) {
    const lens = configured[index];
    // `noUncheckedIndexedAccess` is on and the loop bound is this array's own
    // length; throwing rather than defaulting keeps that reasoning checkable.
    if (lens === undefined) throw new Error(`no configured lens at index ${index}`);
    const role = createAgentRole<ProsecutorInput, ProsecutorOutput>({
      name: 'prosecutor',
      index,
      model: run.config.models.prosecutor,
      prompt: run.prompt,
      runner: run.runner,
      // The same `lens` the input is rendered from, so the request carries the
      // pass as a field and not only as a heading. One value, two uses.
      lens,
      renderInput: renderProsecutorInput,
      parse: (raw) => assertProsecutorCoverage(parseRoleOutput('prosecutor', index, raw), ctx, index),
    });

    let execution: RoleExecution<ProsecutorOutput>;
    try {
      execution = await role.run(
        prosecutorInputFor({
          reading: run.reading,
          renderedCondition: run.renderedCondition,
          conditionPaths: run.conditionPaths,
          lens,
          closure: run.closure,
        }),
      );
    } catch (error) {
      // A lens that produced no exchange at all — no recording under replay, no
      // usable response live. Named, never skipped.
      if (error instanceof TranscriptReplayError || error instanceof RoleTransportError) {
        throw new ProsecutorTranscriptMissingError(index, lens, error.message);
      }
      throw error;
    }
    executions.push(execution);

    // The role said *that* it could not reach a document. Which population that
    // belongs to is a fact about the corpus and the closure, so it is derived
    // rather than believed — `gaps.ts`, exactly as the reader does it.
    let classified: DocumentGap[];
    try {
      classified = execution.output.gaps.map((gap) =>
        gapForUnreachableDocument(run.closure, gap.docId, gap.detail),
      );
    } catch (error) {
      throw new RoleOutputError('prosecutor', index, [
        error instanceof Error ? error.message : String(error),
      ]);
    }
    if (classified.length > 0) {
      // §3.0: agent verification stops at the gap. No later lens is asked to
      // work a surface that has already been shown to be incomplete.
      gaps.push(...classified);
      break;
    }
  }

  if (gaps.length > 0) {
    // Every prosecutor's judgments are discarded, not just the halting one's:
    // the surface they were formed against is the one now known to be
    // incomplete, and a dossier keeping the earlier lenses' coverage would carry
    // hybrid provenance that `corpusClosureSha256` cannot describe. The
    // classified gaps ride on the halting prosecutor's output, which is where
    // the tail collates a role's gaps from.
    const lastIndex = executions.length - 1;
    return {
      executions,
      outputs: executions.map((execution, index) => ({
        lens: execution.output.lens,
        coverage: [],
        challenges: [],
        gaps: index === lastIndex ? gaps : [],
      })),
      gaps,
      halted: true,
      table: { cells: [], challenges: [] },
    };
  }

  assertEveryLensRan(
    configured,
    executions.map((execution) => execution.output.lens),
  );

  const outputs = executions.map((execution) => execution.output);
  const table = buildCoverageTable(outputs);
  assertBothDirectionsWalked(table, ctx);

  return { executions, outputs, gaps, halted: false, table };
}
