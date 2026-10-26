/**
 * Agreement: does the deployed artifact answer the same as the repository it was
 * built from?
 *
 * Design §4.3. The liveness half of this gate asks whether the isolated artifact
 * serves the request, and that catches every closure member whose absence is
 * fatal. It cannot catch the members that degrade **silently**, and the
 * signature ledger is exactly one of those: `attachDerivedStatus` turns a failed
 * ledger read into an empty ledger, so an untraced ledger loads cleanly, reports
 * every requirement unsigned, and answers 200 while doing it. The build test
 * passes. The site is wrong.
 *
 * ```
 * ledger untraced -> liveness PASSES -> agreement FAILS
 * ```
 *
 * That single result is the whole justification for having two halves, and it is
 * the teeth check this file exists to make possible.
 *
 * **How the signed fixture reaches the artifact, and why the answer is
 * load-bearing.** The real repository holds no signatures — the operational
 * signing gate is closed and stays closed — so agreement measured over it would
 * compare two all-draft answers and prove nothing. The fixture therefore has to
 * be a repository that *does* hold them, and the obvious shortcuts for getting
 * one in front of the artifact all void the test:
 *
 * ```
 * module mocking            bypasses the shipped discovery entirely
 * env-var root override     a production backdoor that only tests use
 * post-build injection      an untraced member then still appears present
 * ```
 *
 * The last is the subtle one. If this harness copied a ledger into
 * `.next/standalone` after the build, the deployment test would pass with the
 * tracing configuration empty — it would be measuring its own `cpSync`. **The
 * tracing mechanism, and nothing else, must be what moves ledger, corpus and
 * results into the artifact.**
 *
 * So the sequence is: clone the checkout into a temporary repository, install
 * verification state at the **real production paths** inside it, and only then
 * run `next build` there. One tree, two readers:
 *
 * ```
 * fixture build repository
 *        |
 *        +-- source run (tsx, shipped lib/pack.ts) --> canonical projection
 *        |
 *        +-- next build --> standalone artifact ONLY --> isolated run --> canonical projection
 *                                                          compare
 * ```
 *
 * Nothing is written under the artifact after the build, and the manifest check
 * below proves it rather than asserting it.
 */

import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import {
  CHECK_REQUEST_BODY,
  buildStandalone,
  fail,
  isolateArtifact,
  manifestOf,
  note,
  proveGuardLive,
  releaseIsolation,
  repoRoot,
  requestFromArtifact,
  step,
  timelineLines,
  timelineSummary,
} from './standalone-harness.mjs';

/** Paths never worth carrying into a build repository, and one that is unsafe to. */
const EXCLUDED = new Set(['.next', 'tsconfig.tsbuildinfo', '.git']);

/**
 * A temporary repository that is a copy of this checkout.
 *
 * Copied rather than symlinked, and the reason is concrete: a `node_modules`
 * assembled from symlinks leaves `next` and `react` as symlinks in the standalone
 * output, pointing back at the source checkout. The isolated server would then
 * resolve its own framework out of the repository the gate exists to prove it does
 * not need — §9.1's masking condition, arriving through the dependency tree
 * instead of through the data.
 *
 * `.git` is dropped so that nothing running in the clone can reach the real
 * repository's history, and `.next` so the build starts from nothing.
 */
function cloneRepository() {
  const buildRepo = mkdtempSync(join(tmpdir(), 'datastrata-fixture-repo-'));
  cpSync(repoRoot, buildRepo, {
    recursive: true,
    // Kept verbatim so `node_modules/@datastrata/engine -> ../../backend/engine`
    // continues to mean *this* clone's engine rather than the original's.
    verbatimSymlinks: true,
    filter: (source) => !EXCLUDED.has(relative(repoRoot, source).split('/').pop() ?? ''),
  });
  return buildRepo;
}

/**
 * Runs the in-repository comparator, which is TypeScript because it imports the
 * production modules through this app's own tsconfig path aliases.
 *
 * `--conditions=react-server` is what resolves `server-only` to its empty marker
 * rather than the module that throws; it is the same condition Next's server
 * build uses, so this is the shipped module loaded the shipped way.
 */
function runProjector(buildRepo, args) {
  const result = spawnSync(
    'node',
    ['--import', 'tsx', '--conditions=react-server', join('test', 'deployment-projection.ts'), ...args],
    { cwd: join(buildRepo, 'frontend', 'web'), encoding: 'utf8' },
  );
  if (result.status !== 0) {
    fail(
      `The in-repository comparator failed (\`${args[0]}\`) in ${buildRepo}.`,
      `${result.stdout ?? ''}${result.stderr ?? ''}`,
    );
  }
  return result.stdout ?? '';
}

/**
 * The answer's status-bearing fields, and nothing else, so a disagreement reads
 * as a diff. Since DP1 Task 6 the answer is the start-year timeline: the pack,
 * the draft flag and threshold (`content`, where `containsDraftContent` was),
 * the country, and for every route each line's kind and requirement and each
 * cell's start year, state and reason (where the determination list carried a
 * result and a reason per requirement).
 */
function canonicalAnswer(answer) {
  if (answer === null || answer === undefined) return null;
  return {
    pack: answer.pack,
    content: answer.content,
    country: answer.country ?? null,
    routes: (answer.routes ?? []).map((route) => ({
      id: route.id,
      lines: (route.lines ?? []).map((line) => ({
        kind: line.kind,
        requirement: line.requirement,
        cells: (line.cells ?? []).map((cell) => ({ startYear: cell.startYear, state: cell.state, reason: cell.reason ?? null })),
      })),
    })),
  };
}

/** `derivedStatus` + `statusReasons` collapsed to the distinct answers and their counts. */
function summariseProjection(projection) {
  const buckets = new Map();
  for (const entry of projection) {
    const key = `${entry.derivedStatus} [${entry.statusReasons.join(', ')}]`;
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  return [...buckets.entries()].sort().map(([key, count]) => `${count} × ${key}`);
}

/**
 * Reports which verification state the **build output** carries, and proves that
 * whatever it carries is byte-for-byte the repository's.
 *
 * Read `.next/standalone` as `next build` left it, before this harness has copied
 * anything anywhere. That ordering is what makes "no post-build injection"
 * checkable rather than promised: a file present here was put there by the
 * tracing mechanism, because nothing else has run yet.
 *
 * **It deliberately does not fail on absence.** Asserting that a member reached
 * the artifact is exactly the inspection design §4.2 refuses to accept as
 * evidence, and worse, it would pre-empt the property this file exists to
 * demonstrate: an untraced ledger has to be caught by *agreement*, downstream,
 * after liveness has passed. A harness that stopped here on a missing ledger
 * would report a packaging complaint where the whole point is to watch the site
 * answer confidently and wrongly.
 *
 * So absence is reported and carried forward; byte-identity is enforced, because
 * a traced file differing from the repository's would mean the artifact is
 * answering about some other repository entirely.
 */
function tracedVerificationState(buildRepo, standaloneDir) {
  const artifactEngine = join(standaloneDir, 'backend', 'engine');
  const repoEngine = join(buildRepo, 'backend', 'engine');

  const walk = (relDir) => {
    const absolute = join(repoEngine, relDir);
    if (!existsSync(absolute)) return [];
    return readdirSync(absolute, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory() ? walk(join(relDir, entry.name)) : [join(relDir, entry.name)],
    );
  };

  // Every file the repository holds in the two trees the closure is about.
  const candidates = [...walk('verification'), ...walk('corpus')];
  const present = candidates.filter((path) => existsSync(join(artifactEngine, path)));
  const absent = candidates.filter((path) => !existsSync(join(artifactEngine, path)));

  const differing = present.filter(
    (path) => !readFileSync(join(artifactEngine, path)).equals(readFileSync(join(repoEngine, path))),
  );
  if (differing.length > 0) {
    fail(
      'Traced verification state differs from the repository it was built from.',
      differing.join('\n'),
    );
  }

  const count = (prefix) => present.filter((path) => path.startsWith(prefix)).length;
  return {
    present,
    absent,
    ledger: present.includes(join('verification', 'signatures.jsonl')),
    results: present.filter((path) => path.endsWith('verification-result.json')).length,
    raw: count(join('corpus', 'raw')),
    normalized: count(join('corpus', 'normalized')),
    registry: count(join('verification', 'requirement-versions')),
  };
}

/**
 * The agreement half, shown failing, in the same run that shows it passing.
 *
 * A green agreement is not evidence unless it is known to be able to go red
 * against the defect it claims to detect (TEST-EVIDENCE-STANDARD, the rule
 * itself), and "the two answers matched" is otherwise satisfied by a comparison
 * that could not have differed. So a second copy of the **same built artifact**
 * is started with its ledger removed, and the pair of verdicts design §4.3
 * predicts is required to appear:
 *
 * ```
 * ledger absent from the artifact
 *   -> liveness  200, timeline lines, citations   PASSES
 *   -> agreement source says ratified, artifact says draft   FAILS
 * ```
 *
 * **Read what this does and does not establish.** It removes the ledger from the
 * artifact, not from the tracing configuration, so it proves the *assertion*
 * bites — that a silently-degrading member missing from the artifact is caught
 * by agreement and not by liveness. It deliberately claims nothing about which
 * mechanism put the ledger there in the first place.
 *
 * That second question is now settled elsewhere, and it had to be. When this
 * check was written the answer was *not* `outputFileTracingIncludes`: a
 * statically foldable directory path in `lib/pack.ts` was making Next's tracer
 * emit the whole engine tree, so every member arrived whether declared or not
 * and the declaration governed nothing. Removing a member from
 * `VERIFICATION_RUNTIME_INPUTS` and rebuilding now keeps it out of the artifact
 * — fatally for the version registry, silently and caught here for the ledger —
 * which is what makes this check evidence about the declaration rather than
 * about `rmSync`.
 *
 * It runs on the fresh-signature fixture only, because that is the one where the
 * ledger's absence changes the answer: over a fixture that is already draft for
 * some other reason, removing the ledger changes nothing and the check would
 * pass vacuously.
 */
async function proveAgreementBites({ webDir, standaloneDir, forbiddenRoots, source }) {
  step('Teeth: the same artifact, with the ledger removed from it');
  const { isolationDir } = isolateArtifact({ webDir, standaloneDir, forbiddenRoots });
  try {
    const ledger = join(isolationDir, 'artifact', 'backend', 'engine', 'verification', 'signatures.jsonl');
    if (!existsSync(ledger)) {
      fail('The artifact carries no ledger to remove, so this check cannot mean anything.');
    }
    const bytes = readFileSync(ledger).length;
    rmSync(ledger);
    // The mutation confirmed on the thing itself, before either colour is read.
    if (existsSync(ledger)) fail('The ledger was not actually removed from the artifact.');
    note(`mutation landed — ${bytes} bytes of ledger removed from the artifact`);

    await proveGuardLive({ isolationDir, artifact: join(isolationDir, 'artifact') });
    const run = await requestFromArtifact({ isolationDir, forbiddenRoots });

    if (!run.started || run.status !== 200) {
      fail(
        'LIVENESS did not survive the missing ledger. The ledger is supposed to degrade ' +
          'silently — if its absence is fatal, design §4.3\'s premise needs revisiting and the ' +
          'two halves are not measuring what they claim.',
        run.log || run.text,
      );
    }
    if (timelineLines(run.body).length === 0) {
      fail('LIVENESS returned 200 without timeline lines under the missing ledger.', run.text);
    }
    note(`✓ liveness still PASSES — 200 · ${timelineSummary(run.body)}`);

    if (run.body.content?.draft === source.content.draft) {
      fail(
        'AGREEMENT still passes with the ledger gone. The two halves are then not ' +
          'distinguishable and the agreement assertion cannot detect a silently-degrading ' +
          'member. Stop and report rather than adjusting the assertion.',
        `both sides report content.draft=${String(source.content.draft)}`,
      );
    }
    note(
      `✓ agreement would FAIL — source content.draft ${String(source.content.draft)} vs artifact ` +
        `${String(run.body.content?.draft)}; liveness saw none of it`,
    );
  } finally {
    releaseIsolation(isolationDir, false);
  }
}

/**
 * One agreement run: install a fixture, build, isolate, request, compare.
 *
 * **The order of the three verdicts is the point of the file.** Liveness is
 * asserted and reported first, over the isolated artifact alone. Then the
 * fixture's own properties are asserted over the *source* run alone — that a
 * governing signature really is present and really reads `ratified`, which is
 * what stops the comparison being between two all-draft answers. Only then are
 * the two projections compared.
 *
 * Run against an untraced ledger the sequence prints, in order: liveness PASS,
 * fixture PASS, agreement FAIL. Any other ordering would let an artifact-side
 * expectation fire first and report the symptom instead of the property.
 */
export async function runAgreement({
  label,
  fixtureOptions,
  verifySource,
  verifyIsolated,
  provesItsOwnTeeth,
}) {
  const buildRepo = cloneRepository();
  let isolationDir;
  let kept = true;
  try {
    step(`Installing the fixture's verification state at the production paths of ${buildRepo}`);
    const installed = JSON.parse(runProjector(buildRepo, ['install', JSON.stringify(fixtureOptions)]));
    const ledgerPath = join(buildRepo, 'backend', 'engine', 'verification', 'signatures.jsonl');
    const ledgerLines = readFileSync(ledgerPath, 'utf8').split('\n').filter((l) => l.length > 0);
    note(`${label}: ${ledgerLines.length} governing ledger entries over ${installed.allIds.length} requirements`);
    if (ledgerLines.length === 0) {
      fail(
        'The fixture repository holds no ledger entry. Agreement would compare two all-draft ' +
          'answers and prove nothing (plan Task 3, behaviour 4).',
      );
    }

    step('Building the standalone artifact from the fixture repository');
    const { webDir, standaloneDir } = buildStandalone(buildRepo);

    step('Reading .next/standalone as `next build` left it — nothing has been copied yet');
    const traced = tracedVerificationState(buildRepo, standaloneDir);
    note(
      `traced in: ledger ${traced.ledger ? 'yes' : 'NO'} · ${traced.results} pinned results · ` +
        `${traced.registry} registry · ${traced.raw} retained raw · ${traced.normalized} normalized`,
    );
    note(`${traced.present.length} of ${traced.present.length + traced.absent.length} verification-state files reached the artifact, all byte-identical to the repository`);
    if (traced.absent.length > 0) {
      note(`not traced (agreement below is what decides whether that matters): ${traced.absent.join(', ')}`);
    }

    step('Assembling the isolated runtime, outside both repositories');
    const forbiddenRoots = [repoRoot, buildRepo];
    ({ isolationDir } = isolateArtifact({ webDir, standaloneDir, forbiddenRoots }));
    const artifact = join(isolationDir, 'artifact');

    // Taken from the build output and from the isolated copy, and required to
    // match. Anything this harness added on the way in would appear here as an
    // extra path, and anything it rewrote as a changed digest.
    const builtManifest = manifestOf(join(standaloneDir, 'backend', 'engine'));
    const beforeManifest = manifestOf(join(artifact, 'backend', 'engine'));
    if (JSON.stringify(builtManifest) !== JSON.stringify(beforeManifest)) {
      fail(
        'The isolated artifact\'s engine tree is not the one `next build` produced. Something ' +
          'was added or altered between the build and the run, which would make an untraced ' +
          'member appear present.',
        `built: ${builtManifest.length} files, isolated: ${beforeManifest.length} files`,
      );
    }
    note(`${beforeManifest.length} engine files in the artifact, identical to the build output`);

    step('Positive control: proving the isolation guard is live in the server process');
    await proveGuardLive({ isolationDir, artifact });

    step('Isolated run: the artifact answers with BOTH repositories forbidden');
    const run = await requestFromArtifact({ isolationDir, forbiddenRoots });
    if (!run.started) fail('The standalone server never became ready.', run.log);
    if (run.log.includes('IsolationViolationError')) {
      fail(
        'The standalone server read a file from a forbidden repository. A request answered ' +
          'with a repository reachable is not deployment evidence (design §9.1).',
        run.log,
      );
    }

    // The second half of the injection check: nothing changed while the server ran.
    const afterManifest = manifestOf(join(artifact, 'backend', 'engine'));
    if (JSON.stringify(afterManifest) !== JSON.stringify(beforeManifest)) {
      fail("The artifact's engine tree changed while the server was running.");
    }

    // ---- verdict 1: liveness ------------------------------------------------
    // Asserted against the answer rather than the status code. A 200 whose body
    // carries no timeline lines and no citations would mean the traced knowledge
    // never arrived, which is the failure this half exists to catch.
    if (run.status !== 200) {
      fail(
        `LIVENESS FAILED — ${label}. POST /api/check returned ${run.status} from the isolated ` +
          "artifact. The server's own error follows and names what was missing:",
        run.log || run.text,
      );
    }
    const body = run.body;
    if (!body || body.pack?.id !== 'csrd') {
      fail(`LIVENESS FAILED — ${label}. 200 without a CSRD pack identity.`, run.text);
    }
    const lines = timelineLines(body);
    if (lines.length === 0) {
      fail(`LIVENESS FAILED — ${label}. No timeline lines; the knowledge pack did not load.`, run.text);
    }
    if (!lines.some((line) => Array.isArray(line.legalBasis?.sources) && line.legalBasis.sources.length > 0)) {
      fail(`LIVENESS FAILED — ${label}. No timeline line carries a citation.`, run.text);
    }
    note(`✓ LIVENESS — 200 · pack ${body.pack.id}@${body.pack.version} · ${timelineSummary(body)}`);

    step('Source run: the same repository, read through the shipped path');
    const assessedAt = body.assessedAt ?? new Date().toISOString().slice(0, 10);
    const answersPath = join(buildRepo, 'check-answers.json');
    writeFileSync(answersPath, `${JSON.stringify(CHECK_REQUEST_BODY)}\n`, 'utf8');
    const outPath = join(buildRepo, 'source-run.json');
    runProjector(buildRepo, ['project', answersPath, assessedAt, outPath]);
    const sourceRun = JSON.parse(readFileSync(outPath, 'utf8'));

    const isolated = canonicalAnswer(run.body);
    const source = canonicalAnswer(sourceRun.answer);

    step(`Canonical status projection — ${label}`);
    console.log('  source, per requirement (derivedStatus · statusReasons):');
    for (const line of summariseProjection(sourceRun.projection)) console.log(`    ${line}`);
    console.log(`  isolated : content.draft ${String(isolated?.content?.draft)}`);
    console.log(`  source   : content.draft ${String(source?.content?.draft)}`);

    // ---- verdict 2: the fixture proves something ----------------------------
    // Over the source run alone, so an untraced member cannot make it pass by
    // making both sides equally wrong. This is what stands between the agreement
    // below and a comparison of two all-draft answers.
    verifySource({ label, sourceRun });
    note(`✓ FIXTURE — ${summariseProjection(sourceRun.projection).join(' · ')}`);

    // ---- verdict 3: agreement ----------------------------------------------
    if (JSON.stringify(isolated) !== JSON.stringify(source)) {
      fail(
        `AGREEMENT FAILED — ${label}. The isolated artifact and the source repository ` +
          'disagree about the same fixture. Liveness cannot see this: a silently-degrading ' +
          'closure member loads cleanly and answers 200 while answering falsely.',
        `isolated:\n${JSON.stringify(isolated, null, 2)}\n\nsource:\n${JSON.stringify(source, null, 2)}`,
      );
    }
    note('✓ AGREEMENT — the isolated artifact and the source repository produce one projection');

    // The pack-wide observable tied back to the per-requirement projection, folded
    // here rather than taken from either answer. `content.draft` is the only
    // verification-derived field the deployed surface carries, and without this tie
    // the comparison would be a comparison of one opaque boolean.
    //
    // The timeline sends no determination list (CHK-2), so the fold runs over the
    // requirements every start year's run determines: all the pack holds, since the
    // flag is any determination's draft status (engine `evaluate.ts`), which is what
    // the payload before the timeline listed as its determinations. Every requirement
    // the artifact shows on a line must be among them.
    const draftIds = new Set(
      sourceRun.projection.filter((p) => p.derivedStatus === 'draft').map((p) => p.requirementId),
    );
    const inScope = sourceRun.projection.map((p) => p.requirementId);
    const shown = [...new Set(timelineLines(isolated).map((line) => line.requirement))];
    const unprojected = shown.filter((id) => !inScope.includes(id));
    if (unprojected.length > 0) {
      fail(`The artifact shows lines for requirements the source projection does not hold: ${unprojected.join(', ')}.`);
    }
    const expectedDraft = inScope.some((id) => draftIds.has(id));
    if (isolated.content?.draft !== expectedDraft) {
      fail(
        `The artifact's content.draft is ${String(isolated.content?.draft)}, but folding ` +
          `the per-requirement projection over its ${inScope.length} determined requirements gives ` +
          `${String(expectedDraft)}. The pack-wide flag and the per-requirement statuses disagree.`,
      );
    }
    note(`  folded from the per-requirement projection over ${inScope.length} determined requirements (${shown.length} of them on a line): ${String(expectedDraft)}`);

    if (verifyIsolated !== undefined) verifyIsolated({ label, isolated, sourceRun, run });

    if (provesItsOwnTeeth === true) {
      await proveAgreementBites({ webDir, standaloneDir, forbiddenRoots, source });
    }

    kept = false;
    return { isolated, source, sourceRun, run };
  } finally {
    releaseIsolation(isolationDir, false);
    if (kept) console.error(`\nThe fixture build repository was kept for inspection at ${buildRepo}`);
    else rmSync(buildRepo, { recursive: true, force: true });
  }
}
