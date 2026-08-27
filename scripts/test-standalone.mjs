/**
 * The deployment-artifact gate: does the built standalone server answer without
 * the repository, and does it answer the *same thing* the repository does?
 *
 * `npm test` and `npm run typecheck` both run inside the source checkout, where
 * every file the runtime might need is reachable whether or not the build traced
 * it. That is the masking condition of design §9.1, and it makes those two layers
 * structurally incapable of seeing a packaging omission — the uncorrected artifact
 * that produced this file had a green suite and a green typecheck while
 * `/api/check` was a 500 in every deployable form of the application.
 *
 * So this is a third layer, deliberately excluded from `npm test`: a real
 * production build, started from a directory outside the repository, answering a
 * real request. It is **one recipe with two callers** — CI and a human before a
 * deploy run this exact script. Two recipes would be two definitions of "isolated
 * standalone", and the weaker one would quietly become the real one.
 *
 * **Two phases, because liveness is not correctness** (design §4.3):
 *
 * ```
 * phase 1  the real repository    liveness   catches hard-failing members
 * phase 2  a fixture repository   agreement  catches silently-degrading ones
 * ```
 *
 * Phase 1 is unchanged and stays authoritative for the repository that actually
 * ships. It answers 200 with every requirement draft, because the real ledger is
 * empty and the operational signing gate is closed — which is precisely why it
 * cannot prove the ledger, the corpus or the pinned results reached the artifact.
 * An untraced ledger reads as an *empty* ledger, and over a repository whose
 * ledger is empty anyway, the right answer and the wrong answer are the same
 * bytes.
 *
 * Phase 2 supplies the missing control: a repository that genuinely holds
 * signatures, built into an artifact, and required to agree with itself.
 *
 * Isolation is enforced rather than assumed. Running out of tree makes reaching a
 * checkout implausible, not impossible: Next bakes `outputFileTracingRoot` into
 * `server.js` as an absolute path, so the artifact carries its repository's
 * location with it. `standalone-isolation-guard.cjs` therefore fails the process
 * on any read under a forbidden root — and, because a silent guard is a negative
 * observation (TEST-EVIDENCE-STANDARD failure mode 7), the guard is first aimed
 * at the artifact's own engine directory and required to fire before its silence
 * is accepted as evidence.
 */

import { existsSync, globSync } from 'node:fs';
import { join } from 'node:path';
import { VERIFICATION_RUNTIME_INPUTS } from '../frontend/web/verification-runtime-inputs.mjs';
import { runAgreement } from './deployment-agreement.mjs';
import {
  StandaloneFailure,
  buildStandalone,
  fail,
  isolateArtifact,
  note,
  phase,
  proveGuardLive,
  releaseIsolation,
  repoRoot,
  requestFromArtifact,
  step,
} from './standalone-harness.mjs';

let isolationDir;
let exitCode = 0;
try {
  // -------------------------------------------------------------------------
  phase('PHASE 1 — liveness: the real repository, answering in isolation');
  // -------------------------------------------------------------------------
  step('Building the production standalone artifact');
  const { webDir, standaloneDir } = buildStandalone(repoRoot);

  // Physical packaging, asserted against the built tree rather than inferred
  // from the declaration. The liveness run below would also catch a missing
  // `fatal` member — but only as a 500 whose cause has to be read out of a
  // server log, and only for members the one fixed request happens to exercise.
  // This names the file instead.
  //
  // **What this loop cannot do is notice a member's deletion**, because it
  // iterates the declaration: remove a member and its assertion leaves with it.
  // Deleting `authored-knowledge` produces zero findings here. That is covered
  // elsewhere — phase 1 liveness for members the request exercises, and the
  // named register check below for the one this step exists for — and the
  // distinction is written down rather than left for a reader to discover,
  // because a packaging assertion that overstates its reach is the same defect
  // this whole gate exists to catch.
  step('Packaging: every file a fatal runtime input claims physically reached the artifact');
  //
  // **Repository against artifact, not presence against nothing.** A first
  // version of this asserted each fatal glob matched something in the built
  // tree, and reddened on `pinned-verification-results` — correctly by its own
  // rule and uselessly, because the repository holds no signed results, so
  // there was nothing to trace. What matters is that nothing the repository
  // *has* and the declaration *claims* was left behind.
  //
  // **Members whose globs legitimately match nothing**, declared rather than
  // discovered. A fatal member matching zero repository files is normally a
  // broken glob — a typo, or a path convention that moved — and would otherwise
  // pass in silence, since "every file it claims" is vacuously true of no files.
  // The one real exception is the pinned results: the repository holds none
  // until something is signed. Naming it makes the exemption a decision.
  const MAY_MATCH_NOTHING = new Set(['pinned-verification-results']);
  const missingFiles = [];
  const emptyMembers = [];
  let tracedCount = 0;
  for (const input of VERIFICATION_RUNTIME_INPUTS) {
    if (input.onAbsence !== 'fatal') continue;
    let matchedForMember = 0;
    for (const glob of input.globs) {
      // Globs are relative to `frontend/web`; the standalone tree mirrors the
      // repository beneath the tracing root, so the same relative walk applies.
      const inRepo = globSync(join(webDir, glob));
      matchedForMember += inRepo.length;
      for (const file of inRepo) {
        const relative = file.slice(repoRoot.length + 1);
        tracedCount += 1;
        // `existsSync`, not `globSync`: `relative` is a concrete path, and a
        // filename carrying `[`, `]`, `{`, `}`, `*` or `?` would be reread as a
        // pattern and report a false absence.
        if (!existsSync(join(standaloneDir, relative))) {
          missingFiles.push(`${input.member}: ${relative}`);
        }
      }
    }
    if (matchedForMember === 0 && !MAY_MATCH_NOTHING.has(input.member)) {
      emptyMembers.push(`${input.member}: ${input.globs.join(', ')}`);
    }
  }
  if (emptyMembers.length > 0) {
    fail(
      'Declared `fatal` runtime inputs matched no file in the repository. Either the ' +
        'glob is wrong, or the state it names is gone — both ship an artifact missing ' +
        'something the deployed site needs:',
      emptyMembers.join('\n'),
    );
  }
  if (missingFiles.length > 0) {
    fail(
      'Files the declaration marks `fatal` exist in the repository but did not reach ' +
        'the standalone artifact. `frontend/web/verification-runtime-inputs.mjs` says ' +
        'the deployed site needs these:',
      missingFiles.join('\n'),
    );
  }
  // Named explicitly: this member is why the assertion exists, and a silent
  // count would not show it was actually exercised.
  const registerFile = 'backend/engine/monitoring/source-register.json';
  if (globSync(join(standaloneDir, registerFile)).length === 0) {
    fail(
      'The source register did not reach the standalone artifact. Requirement-side ' +
        'citability is checked against it on every pack load, so the deployed site ' +
        'would refuse to load the pack at all.',
      registerFile,
    );
  }
  note(`${tracedCount} fatal runtime-input files traced into the artifact, including the source register`);

  step('Assembling the isolated runtime, outside the repository');
  const forbiddenRoots = [repoRoot];
  ({ isolationDir } = isolateArtifact({ webDir, standaloneDir, forbiddenRoots }));
  const artifact = join(isolationDir, 'artifact');

  step('Positive control: proving the isolation guard is live in the server process');
  await proveGuardLive({ isolationDir, artifact });

  step('Authoritative run: the artifact answers with the checkout forbidden');
  const run = await requestFromArtifact({ isolationDir, forbiddenRoots });

  if (!run.started) {
    fail('The standalone server never became ready.', run.log);
  }
  if (run.log.includes('IsolationViolationError')) {
    fail(
      'The standalone server read a file from the source checkout. A request answered ' +
        'with the repository reachable is not deployment evidence (design §9.1).',
      run.log,
    );
  }
  if (run.status !== 200) {
    fail(
      `POST /api/check returned ${run.status} from the isolated artifact. Something the ` +
        "runtime needs was not traced into the standalone output. The server's own error " +
        'follows and names the missing file:',
      run.log || run.text,
    );
  }

  // Liveness, asserted against the answer rather than the status code. A 200 whose
  // body carries no determinations and no citations would mean the traced knowledge
  // never arrived, which is the failure this gate exists to catch.
  const body = run.body;
  if (!body || body.pack?.id !== 'csrd') {
    fail('The isolated artifact answered 200 without a CSRD pack identity.', run.text);
  }
  if (!Array.isArray(body.determinations) || body.determinations.length === 0) {
    fail('The isolated artifact produced no determinations; the knowledge pack did not load.', run.text);
  }
  if (!body.determinations.some((d) => Array.isArray(d.sources) && d.sources.length > 0)) {
    fail('No determination carries a citation; the traced knowledge is incomplete.', run.text);
  }

  note(
    `200 · pack ${body.pack.id}@${body.pack.version} · ` +
      `${body.determinations.length} determinations · ` +
      `${body.counts.applies} applies / ${body.counts.doesNotApply} does not apply / ` +
      `${body.counts.indeterminate} indeterminate`,
  );

  // The scope guard, asserted rather than trusted. The real repository holds no
  // signature and must not quietly acquire one: if this ever reads false, something
  // signed has reached the shipping repository while the operational signing gate —
  // which needs B2's real result producer first — is still closed.
  if (body.containsDraftContent !== true) {
    fail(
      'The real repository answered containsDraftContent=false. Its ledger is supposed to be ' +
        'empty: the operational signing gate is closed, and B2 has supplied neither a real ' +
        'result producer nor a real signed verification record.',
      run.text,
    );
  }
  note('containsDraftContent true — the real ledger is still empty, as the closed signing gate requires');
  console.log('\n✓ The standalone artifact serves /api/check in isolation from the repository.');

  releaseIsolation(isolationDir, false);
  isolationDir = undefined;

  // -------------------------------------------------------------------------
  phase('PHASE 2 — agreement: an artifact built from a repository that holds signatures');
  // -------------------------------------------------------------------------
  // Phase 1 cannot tell "the ledger was traced" from "the ledger was empty anyway",
  // because over the real repository both produce the same answer. These runs use a
  // repository where they do not.

  step('Fixture A — every requirement carries a fresh governing signature');
  await runAgreement({
    label: 'fresh signature',
    fixtureOptions: {},
    // This fixture, and only this one, carries the pair of verdicts §4.3 predicts:
    // over an already-draft fixture, removing the ledger changes no answer and the
    // check would pass while proving nothing.
    provesItsOwnTeeth: true,
    verifySource: ({ sourceRun }) => {
      const ratified = sourceRun.projection.filter((p) => p.derivedStatus === 'ratified');
      if (ratified.length === 0) {
        fail(
          'The fixture produced no ratified requirement, so agreement would compare two ' +
            'all-draft answers and prove nothing (plan Task 3, behaviour 4). Stop and report ' +
            'rather than adjusting the assertion.',
          JSON.stringify(sourceRun.projection, null, 2),
        );
      }
      const withReasons = ratified.filter((p) => p.statusReasons.length > 0);
      if (withReasons.length > 0) {
        fail('A fresh governing signature carried status reasons.', JSON.stringify(withReasons, null, 2));
      }
    },
    verifyIsolated: ({ isolated }) => {
      // The positive control the whole gate turns on (design §7, items 1 and 3).
      // "The site never over-claims" is otherwise satisfied by a site that can
      // never claim anything at all.
      if (isolated.containsDraftContent !== false) {
        fail(
          'The isolated artifact still reports draft content over a fully signed fixture: it ' +
            'resolved no signature from its own traced verification state.',
          JSON.stringify(isolated, null, 2),
        );
      }
      note('the deployed artifact resolved a fresh signature from traced state alone');
    },
  });

  step('Fixture B — the same signatures, over a pinned result that moved');
  await runAgreement({
    label: 'drifted pinned result',
    fixtureOptions: { driftResult: true },
    verifySource: ({ sourceRun }) => {
      // The *specific* reason, not merely "draft". A resolver reporting drift
      // generically is indistinguishable from one that stopped resolving at all.
      const wrong = sourceRun.projection.filter(
        (p) => p.derivedStatus !== 'draft' || p.statusReasons.join(',') !== 'stale_result',
      );
      if (wrong.length > 0) {
        fail(
          'Moving the pinned result did not produce exactly `stale_result` everywhere.',
          JSON.stringify(wrong, null, 2),
        );
      }
    },
    verifyIsolated: ({ isolated }) => {
      if (isolated.containsDraftContent !== true) {
        fail('Drifted verification state did not reach the artifact as draft content.');
      }
    },
  });

  console.log(
    '\n✓ The standalone artifact and the repository it was built from produce one status projection.',
  );
} catch (err) {
  exitCode = 1;
  if (err instanceof StandaloneFailure) {
    console.error(`\n✗ ${err.message}`);
    if (err.detail) console.error(`\n${err.detail}`);
  } else {
    console.error(`\n✗ ${err instanceof Error ? err.stack : String(err)}`);
  }
} finally {
  releaseIsolation(isolationDir, exitCode !== 0);
}

process.exit(exitCode);
