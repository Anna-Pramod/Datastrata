/**
 * The source-repository half of the deployment agreement gate.
 *
 * Design §4.3 splits the acceptance property in two. **Liveness** — the isolated
 * artifact serves the request — catches closure members whose absence is fatal.
 * **Agreement** — the isolated artifact answers the same as a run over the
 * source repository, for the same fixture — catches the members that degrade
 * silently, and the ledger is exactly one of those: untraced, it reads as an
 * empty ledger, every requirement comes back unsigned, and `/api/check` returns
 * a confident 200 saying so.
 *
 * This file is the second arm of that comparison. `scripts/test-standalone.mjs`
 * runs it with `tsx` inside the **fixture build repository** — the same tree the
 * standalone artifact was built from, with the same verification state at the
 * same production paths — so the only difference between the two answers is
 * where the runtime files came from: the traced artifact, or the repository.
 *
 * **Nothing here re-implements anything.** It calls `engineRoot()`,
 * `loadVerifiedCsrdPack()` and `buildCheckResponse()` exactly as the site does,
 * discovering the repository through the shipped `process.cwd()` probe. A
 * comparator that computed statuses its own way would be a second definition of
 * the answer, and it would agree with the artifact's systematic errors —
 * TEST-EVIDENCE-STANDARD failure mode 1, inside the check meant to catch them.
 *
 * It is `.ts` under `frontend/web` rather than an `.mjs` beside the harness for
 * one reason: it has to import production TypeScript through this app's own
 * `tsconfig.json` path aliases (`@/lib/pack`, `@datastrata/engine`). The harness
 * runs it as `node --import tsx --conditions=react-server`, the react-server
 * condition being what resolves `server-only` to its empty marker instead of the
 * module that throws.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { IntegrityFailureError } from '@datastrata/engine';
import type { DerivedStatus, KnowledgePack, StatusReason } from '@datastrata/engine';
import { engineRoot, loadVerifiedCsrdPack } from '@/lib/pack';
import { buildCheckResponse, type CheckResponse } from '@/lib/checkResponse';
import type { CheckerAnswers } from '@/lib/checker';
import { installVerificationState, type FixtureOptions } from './fixture-repository';

/**
 * The canonical status projection, and the reason it is this and not the whole
 * payload.
 *
 * Plan Task 3 behaviour 3: three fields, so the assertion target is explicit and
 * a disagreement is readable as a diff rather than as a wall of JSON. It is also
 * the projection the engine itself carries — `Determination.derivedStatus` and
 * `Determination.statusReasons` are these same two values — so nothing is
 * invented here to make the comparison possible.
 */
export interface RequirementStatusProjection {
  requirementId: string;
  derivedStatus: DerivedStatus;
  statusReasons: StatusReason[];
}

/** What the harness reads back. `answer` is null exactly when the resolver refused. */
export interface SourceRun {
  engineRoot: string;
  projection: RequirementStatusProjection[];
  answer: CheckResponse | null;
  refusals: string[] | null;
}

function projectionOf(pack: KnowledgePack): RequirementStatusProjection[] {
  return pack.requirements.map((requirement) => ({
    requirementId: requirement.id,
    derivedStatus: requirement.derivedStatus,
    statusReasons: [...requirement.statusReasons],
  }));
}

const [mode, ...rest] = process.argv.slice(2);

if (mode === 'install') {
  // The fixture lands at the production paths of a real repository, *before*
  // `next build` runs over it. That ordering is the whole claim under test: the
  // tracing mechanism has to be what carries the ledger, the corpus and the
  // pinned results into the artifact. A harness that wrote them into
  // `.next/standalone` afterwards would make an untraced member look present.
  const [optionsJson] = rest;
  const root = engineRoot();
  const options = JSON.parse(optionsJson ?? '{}') as FixtureOptions;
  const { signedIds, allIds } = installVerificationState(root, options);
  process.stdout.write(`${JSON.stringify({ engineRoot: root, signedIds, allIds })}\n`);
} else if (mode === 'project') {
  const [answersPath, assessedAt, outPath] = rest;
  if (answersPath === undefined || assessedAt === undefined || outPath === undefined) {
    throw new Error('usage: deployment-projection.ts project <answers.json> <assessedAt> <out.json>');
  }
  const answers = JSON.parse(readFileSync(answersPath, 'utf8')) as CheckerAnswers;
  const root = engineRoot();

  let run: SourceRun;
  try {
    const pack = loadVerifiedCsrdPack(root);
    run = {
      engineRoot: root,
      projection: projectionOf(pack),
      // The assessment date is supplied rather than read, and it is the date the
      // artifact reported. The route derives it from the clock, so a source run
      // that read its own clock could disagree with the artifact for no reason
      // but the moment each happened to run — a red gate naming nothing.
      answer: buildCheckResponse(pack, answers, assessedAt),
      refusals: null,
    };
  } catch (error) {
    // A damaged verification record is an answer too, and the comparison covers
    // it: the artifact must refuse for the same reason, not merely fail somehow.
    if (!(error instanceof IntegrityFailureError)) throw error;
    run = {
      engineRoot: root,
      projection: [],
      answer: null,
      refusals: error.refusals.map((refusal) => `${refusal.code}: ${refusal.detail}`),
    };
  }

  writeFileSync(outPath, `${JSON.stringify(run, null, 2)}\n`, 'utf8');
} else {
  throw new Error(`unknown mode ${String(mode)}; expected "install" or "project"`);
}
