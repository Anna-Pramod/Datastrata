/**
 * The deployment-artifact gate: does the built standalone server answer without
 * the repository?
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
 * Isolation is enforced rather than assumed. Running out of tree makes reaching
 * the checkout implausible, not impossible: Next bakes `outputFileTracingRoot`
 * into `server.js` as an absolute path, so the artifact carries the repository's
 * location with it. `standalone-isolation-guard.cjs` therefore fails the process
 * on any read under the checkout — and, because a silent guard is a negative
 * observation (TEST-EVIDENCE-STANDARD failure mode 7), the guard is first aimed
 * at the artifact's own engine directory and required to fire before its silence
 * over the checkout is accepted as evidence.
 */

import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { cpSync, existsSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const webDir = join(repoRoot, 'frontend', 'web');
const guardPath = join(scriptDir, 'standalone-isolation-guard.cjs');

/**
 * The widest slice the public check can reach — a German entity over both
 * thresholds, answering every question. The same answers the public golden
 * pins, so a payload that disagrees with the source run is visible by eye
 * long before Task 3 makes that comparison mechanical.
 */
const REQUEST_BODY = {
  country: 'DE',
  legalForm: 'private_limited_company',
  financialYear: '2027',
  groupPosition: 'standalone',
  turnover: 'gt600',
  employees: 'gt1500',
  reportedFy2024: 'no',
  governingChoice: 'same',
};

/** Carries the detail — usually the server's own output — alongside the verdict. */
class StandaloneFailure extends Error {
  constructor(message, detail) {
    super(message);
    this.name = 'StandaloneFailure';
    this.detail = detail;
  }
}

function fail(message, detail) {
  throw new StandaloneFailure(message, detail);
}

function step(message) {
  console.log(`\n▸ ${message}`);
}

function freePort() {
  return new Promise((res, rej) => {
    const probe = createServer();
    probe.on('error', rej);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => res(port));
    });
  });
}

/**
 * Starts the artifact's server and issues the check request, returning the
 * status, the body and everything the process wrote. `forbiddenRoot` is the
 * directory the process may not read: the checkout for the authoritative run,
 * the artifact's own engine directory for the guard's positive control.
 */
async function requestFromArtifact({ isolationDir, forbiddenRoot }) {
  const port = await freePort();
  const server = spawn('node', ['server.js'], {
    cwd: join(isolationDir, 'artifact', 'frontend', 'web'),
    env: {
      ...process.env,
      PORT: String(port),
      HOSTNAME: '127.0.0.1',
      NODE_ENV: 'production',
      DATASTRATA_FORBIDDEN_ROOT: forbiddenRoot,
      NODE_OPTIONS: `--require ${join(isolationDir, 'guard.cjs')}`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let log = '';
  server.stdout.on('data', (d) => (log += d));
  server.stderr.on('data', (d) => (log += d));
  const drained = Promise.all([
    new Promise((res) => server.stdout.on('close', res)),
    new Promise((res) => server.stderr.on('close', res)),
  ]);

  const exited = new Promise((res) => server.on('exit', (code) => res(code)));
  let exitedEarly = false;
  exited.then(() => (exitedEarly = true));

  const deadline = Date.now() + 60_000;
  let up = false;
  while (Date.now() < deadline && !exitedEarly) {
    try {
      await fetch(`http://127.0.0.1:${port}/api/check`, { method: 'GET' });
      up = true;
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  if (!up) {
    server.kill();
    await exited;
    return { started: false, status: 0, body: undefined, log };
  }

  let status = 0;
  let body;
  let text = '';
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/check`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(REQUEST_BODY),
    });
    status = res.status;
    text = await res.text();
    try {
      body = JSON.parse(text);
    } catch {
      /* a non-JSON body is itself part of the evidence; `text` carries it */
    }
  } finally {
    // Next writes the request's error to stderr *after* sending the 500, so killing
    // the moment the body arrives loses the one line that names the missing file.
    await new Promise((r) => setTimeout(r, 500));
    server.kill();
    await exited;
    await drained;
  }

  return { started: true, status, body, text, log };
}

// ---------------------------------------------------------------------------

let isolationDir;
let exitCode = 0;
try {
  step('Building the production standalone artifact');
  const build = spawnSync('npm', ['run', 'build', '--workspace', '@datastrata/web'], {
    cwd: repoRoot,
    stdio: 'inherit',
  });
  if (build.status !== 0) fail('`next build` failed; there is no artifact to test.');

  // The standalone tree mirrors the repository beneath `outputFileTracingRoot`, so
  // the entry point is not `.next/standalone/server.js`. Assert where it actually is
  // rather than letting a moved root surface as a confusing ENOENT.
  const standaloneDir = join(webDir, '.next', 'standalone');
  const serverEntry = join(standaloneDir, 'frontend', 'web', 'server.js');
  if (!existsSync(serverEntry)) {
    fail(
      `No standalone server entry at ${serverEntry}.`,
      "Either `output: 'standalone'` is not set in frontend/web/next.config.mjs, or " +
        '`outputFileTracingRoot` moved and the artifact no longer mirrors the repository ' +
        'at frontend/web. This test cannot run without a deployable artifact.',
    );
  }

  step('Assembling the isolated runtime, outside the repository');
  // Through the real path: on macOS `tmpdir()` is `/var/folders/…` while the server's
  // own `process.cwd()` reports `/private/var/folders/…`, and the two must agree or the
  // isolation guard compares prefixes that can never match.
  isolationDir = realpathSync(mkdtempSync(join(tmpdir(), 'datastrata-standalone-')));
  if (isolationDir === repoRoot || isolationDir.startsWith(repoRoot + sep)) {
    fail(`The isolation directory ${isolationDir} is inside the repository. Isolation is impossible.`);
  }

  const artifact = join(isolationDir, 'artifact');
  cpSync(standaloneDir, artifact, { recursive: true });

  // Next's standalone output deliberately omits these two; the deployment convention
  // is to copy them alongside. `/api/check` does not need either, but a page request
  // does, and the artifact under test should be the one that would actually ship.
  const staticDir = join(webDir, '.next', 'static');
  if (existsSync(staticDir)) {
    cpSync(staticDir, join(artifact, 'frontend', 'web', '.next', 'static'), { recursive: true });
  }
  const publicDir = join(webDir, 'public');
  if (existsSync(publicDir)) {
    cpSync(publicDir, join(artifact, 'frontend', 'web', 'public'), { recursive: true });
  }

  // The guard is instrumentation, not application state, so it is copied in rather
  // than required across the boundary the test exists to establish.
  cpSync(guardPath, join(isolationDir, 'guard.cjs'));

  step('Positive control: proving the isolation guard is live in the server process');
  const control = await requestFromArtifact({
    isolationDir,
    forbiddenRoot: join(artifact, 'backend'),
  });
  if (!control.log.includes('IsolationViolationError')) {
    fail(
      'The isolation guard did not fire when the artifact\'s own engine directory was ' +
        'forbidden. Its silence during the authoritative run therefore proves nothing: ' +
        'the preload is not active, and this test cannot claim the server was isolated.',
      control.log,
    );
  }
  console.log('  guard fired as required — its silence below is meaningful');

  step('Authoritative run: the artifact answers with the checkout forbidden');
  const run = await requestFromArtifact({ isolationDir, forbiddenRoot: repoRoot });

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
        'runtime needs was not traced into the standalone output. The server\'s own error ' +
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

  console.log(
    `  200 · pack ${body.pack.id}@${body.pack.version} · ` +
      `${body.determinations.length} determinations · ` +
      `${body.counts.applies} applies / ${body.counts.doesNotApply} does not apply / ` +
      `${body.counts.indeterminate} indeterminate`,
  );
  console.log('\n✓ The standalone artifact serves /api/check in isolation from the repository.');
} catch (err) {
  exitCode = 1;
  if (err instanceof StandaloneFailure) {
    console.error(`\n✗ ${err.message}`);
    if (err.detail) console.error(`\n${err.detail}`);
  } else {
    console.error(`\n✗ ${err instanceof Error ? err.stack : String(err)}`);
  }
} finally {
  if (isolationDir) {
    if (exitCode === 0) rmSync(isolationDir, { recursive: true, force: true });
    else console.error(`\nThe isolated runtime was kept for inspection at ${isolationDir}`);
  }
}

process.exit(exitCode);
