/**
 * The machinery both halves of the deployment gate share.
 *
 * Design §9 is emphatic that there is **one recipe**: CI and a human before a
 * deploy run the same `npm run test:standalone`, because two shell recipes are
 * two definitions of "isolated standalone" and the weaker one quietly becomes
 * the real one. Task 3 adds a second thing to prove — agreement between the
 * artifact and the repository it was built from — and the same reasoning applies
 * one level down: a second script that built, isolated and started an artifact
 * its own way would be a second definition of isolation, differing from this one
 * in whatever the author of the day forgot.
 *
 * So building, isolating, proving the guard live and issuing the request live
 * here, once, and `test-standalone.mjs` spends them twice: over the real
 * repository, where liveness is the question, and over a fixture repository that
 * actually holds signatures, where agreement is.
 *
 * Nothing in this file knows what is being proved. It builds an artifact, puts
 * it somewhere the repository cannot be reached from, and reports what the
 * server said.
 */

import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:net';
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const scriptDir = dirname(fileURLToPath(import.meta.url));
export const repoRoot = resolve(scriptDir, '..');
export const guardPath = join(scriptDir, 'standalone-isolation-guard.cjs');

/**
 * The widest slice the public check can reach — a German entity over both
 * thresholds, answering every question. Declared once and spent by every caller,
 * including the source-side comparator, which is handed this exact object as
 * JSON: two request bodies that drifted apart would make the agreement half
 * compare answers to different questions and call the difference a deployment
 * defect.
 */
export const CHECK_REQUEST_BODY = {
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
export class StandaloneFailure extends Error {
  constructor(message, detail) {
    super(message);
    this.name = 'StandaloneFailure';
    this.detail = detail;
  }
}

export function fail(message, detail) {
  throw new StandaloneFailure(message, detail);
}

export function phase(message) {
  console.log(`\n${'═'.repeat(78)}\n${message}\n${'═'.repeat(78)}`);
}

export function step(message) {
  console.log(`\n▸ ${message}`);
}

export function note(message) {
  console.log(`  ${message}`);
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
 * Runs the production build in `root` and returns its standalone directory.
 *
 * The standalone tree mirrors the repository beneath `outputFileTracingRoot`, so
 * the entry point is not `.next/standalone/server.js`. Assert where it actually
 * is rather than letting a moved root surface as a confusing ENOENT.
 */
export function buildStandalone(root) {
  const webDir = join(root, 'frontend', 'web');
  // Removed rather than reused. Next builds incrementally, and a prerendered page
  // left over from a previous verification state would be baked from state this
  // build is not about — an artifact that is a mixture of two repositories.
  rmSync(join(webDir, '.next'), { recursive: true, force: true });

  const build = spawnSync('npm', ['run', 'build', '--workspace', '@datastrata/web'], {
    cwd: root,
    stdio: 'inherit',
  });
  if (build.status !== 0) fail(`\`next build\` failed in ${root}; there is no artifact to test.`);

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
  assertArtifactHygiene(standaloneDir);
  return { webDir, standaloneDir };
}

/**
 * What must never be inside the deployable artifact, and why each one matters.
 *
 * Every entry is a path relative to `backend/engine` in the standalone tree.
 * These are not "untidy" — each is evidence that something other than
 * `VERIFICATION_RUNTIME_INPUTS` decided what ships.
 */
const FORBIDDEN_IN_ARTIFACT = [
  {
    label: 'backend/engine/test/**',
    why: 'engine test suites and their fixtures are not runtime inputs',
    matches: (path) => path === 'test' || path.startsWith('test/'),
  },
  {
    label: 'backend/engine/prompts/**',
    why: 'agent prompt files are inputs to the verification pipeline, which runs offline against the repository; the site never executes a role, so a prompt reaching the artifact means something other than VERIFICATION_RUNTIME_INPUTS decided what ships. They are also the one directory under backend/engine that a statically foldable path in src/pipeline could emit recursively — the lib/pack.ts failure, one barrel export away',
    matches: (path) => path === 'prompts' || path.startsWith('prompts/'),
  },
  {
    label: 'backend/engine/monitoring/** except source-register.json',
    why: 'the register is a declared runtime input, but the directory holding it is not: monitoring/ also carries automation-prompt.md, an agent prompt of exactly the class the prompts/** rule excludes. Naming the one permitted file rather than the directory keeps a folded monitoring/ — the lib/pack.ts failure, one directory-shaped trace away — from shipping the rest of it while hygiene stayed green',
    matches: (path) =>
      (path === 'monitoring' || path.startsWith('monitoring/')) &&
      path !== 'monitoring/source-register.json',
  },
  {
    label: 'backend/engine/docs/**',
    why: 'design documentation is not a runtime input',
    matches: (path) => path === 'docs' || path.startsWith('docs/'),
  },
  {
    label: 'backend/engine/CLAUDE.md',
    why: 'working conventions for agents are not a runtime input',
    matches: (path) => path === 'CLAUDE.md',
  },
];

/**
 * Rejects an artifact carrying files nothing declared.
 *
 * **This is a guardrail, not the evidence.** The evidence that the closure
 * declaration governs packaging is the pair of trace mutants below it: remove a
 * member from `VERIFICATION_RUNTIME_INPUTS`, rebuild normally, and watch the
 * isolated artifact fail — fatally for the registry, silently-and-caught-by-
 * agreement for the ledger. This check proves nothing about that.
 *
 * What it does is catch the failure those mutants cannot see. Tracing stopped
 * being selective the moment `lib/pack.ts` handed Next's tracer a statically
 * foldable path to the engine **directory**: `@vercel/nft` folds
 * `join(process.cwd(), …)`, and a folded path that is a directory is emitted
 * recursively. Seventy files shipped where eighteen were declared. Every gate
 * stayed green — correctly, since everything the runtime needed was present —
 * and the declaration quietly governed nothing at all for three tasks, because
 * removing a member changed no outcome when the whole tree arrived anyway.
 *
 * So the property here is not tidiness: **an artifact holding what nothing
 * declared is an artifact whose declaration cannot be tested.** It is checked at
 * build time, inside `buildStandalone`, so both phases of the gate and every
 * future caller inherit it from the one recipe.
 *
 * **Paired with a positive control**, because "these paths are absent" is a
 * negative observation and would be satisfied vacuously by an artifact with no
 * engine tree at all — TEST-EVIDENCE-STANDARD failure mode 7. The authored
 * knowledge must be present in the same breath, or absence proves nothing.
 */
export function assertArtifactHygiene(standaloneDir) {
  const engineDir = join(standaloneDir, 'backend', 'engine');
  if (!existsSync(engineDir)) {
    fail(
      `The standalone artifact carries no ${join('backend', 'engine')} tree at all. Nothing the ` +
        'engine reads at runtime was traced, so this build is not deployable and the hygiene ' +
        'check below would pass vacuously.',
    );
  }

  const present = manifestOf(engineDir).map((entry) => entry.path.split(sep).join('/'));

  // The positive control, asserted before the absences are believed.
  const knowledge = present.filter((path) => path.startsWith('knowledge/'));
  if (knowledge.length === 0) {
    fail(
      'The artifact carries an engine tree with no authored knowledge in it. The absences ' +
        'asserted below would then be satisfied by an empty artifact rather than by a ' +
        'selective one, and would be evidence of nothing.',
      present.join('\n'),
    );
  }

  const violations = [];
  for (const rule of FORBIDDEN_IN_ARTIFACT) {
    const hits = present.filter((path) => rule.matches(path));
    if (hits.length > 0) violations.push({ rule, hits });
  }

  if (violations.length > 0) {
    fail(
      'ARTIFACT HYGIENE FAILED — the standalone output carries files no closure member ' +
        'declares. Something other than `VERIFICATION_RUNTIME_INPUTS` is deciding what ships, ' +
        'and while that is true the trace mutants below cannot detect a missing member: ' +
        'everything arrives whether it is declared or not. The usual cause is a statically ' +
        'foldable path to a **directory** in frontend/web/lib/pack.ts — see `engineRoot`.',
      violations
        .map(({ rule, hits }) => `${rule.label} — ${rule.why}\n${hits.map((h) => `    ${h}`).join('\n')}`)
        .join('\n\n'),
    );
  }

  note(
    `artifact hygiene: ${present.length} engine files, ${knowledge.length} of them authored ` +
      `knowledge, none matching ${FORBIDDEN_IN_ARTIFACT.map((r) => r.label).join(', ')}`,
  );
}

/** Every file under `dir`, relative and sorted, with its digest. */
export function manifestOf(dir) {
  const entries = [];
  const walk = (current) => {
    if (!existsSync(current)) return;
    for (const entry of readdirSync(current, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) {
        entries.push({
          path: relative(dir, full),
          sha256: createHash('sha256').update(readFileSync(full)).digest('hex'),
          bytes: statSync(full).size,
        });
      } else if (entry.isSymbolicLink()) {
        // Recorded rather than followed. A symlink inside the artifact is a way
        // out of it, and the manifest should say so instead of quietly hashing
        // whatever it points at.
        entries.push({ path: relative(dir, full), sha256: 'symlink', bytes: 0 });
      }
    }
  };
  walk(dir);
  return entries;
}

/**
 * Copies the built artifact to a directory outside every repository, and puts
 * the guard beside it.
 *
 * The two directories Next deliberately omits from standalone output are copied
 * alongside, which is the deployment convention. `/api/check` needs neither, but
 * a page request does, and the artifact under test should be the one that would
 * actually ship.
 */
export function isolateArtifact({ webDir, standaloneDir, forbiddenRoots }) {
  // Through the real path: on macOS `tmpdir()` is `/var/folders/…` while the
  // server's own `process.cwd()` reports `/private/var/folders/…`, and the two
  // must agree or the isolation guard compares prefixes that can never match.
  const isolationDir = realpathSync(mkdtempSync(join(tmpdir(), 'datastrata-standalone-')));
  for (const forbidden of forbiddenRoots) {
    const root = realpathSync(forbidden);
    if (isolationDir === root || isolationDir.startsWith(root + sep)) {
      fail(`The isolation directory ${isolationDir} is inside ${root}. Isolation is impossible.`);
    }
  }

  const artifact = join(isolationDir, 'artifact');
  cpSync(standaloneDir, artifact, { recursive: true });

  const staticDir = join(webDir, '.next', 'static');
  if (existsSync(staticDir)) {
    cpSync(staticDir, join(artifact, 'frontend', 'web', '.next', 'static'), { recursive: true });
  }
  const publicDir = join(webDir, 'public');
  if (existsSync(publicDir)) {
    cpSync(publicDir, join(artifact, 'frontend', 'web', 'public'), { recursive: true });
  }

  // The guard is instrumentation, not application state, so it is copied in
  // beside the artifact rather than required across the boundary the test exists
  // to establish — and deliberately NOT into the artifact, which must stay
  // exactly what the build produced.
  cpSync(guardPath, join(isolationDir, 'guard.cjs'));

  return { isolationDir, artifact };
}

/**
 * Starts the artifact's server and issues the check request, returning the
 * status, the body and everything the process wrote.
 *
 * `forbiddenRoots` is the list of directories the process may not read: every
 * repository for the authoritative run, and the artifact's own engine directory
 * for the guard's positive control.
 */
export async function requestFromArtifact({ isolationDir, forbiddenRoots }) {
  const port = await freePort();
  const server = spawn('node', ['server.js'], {
    cwd: join(isolationDir, 'artifact', 'frontend', 'web'),
    env: {
      ...process.env,
      PORT: String(port),
      HOSTNAME: '127.0.0.1',
      NODE_ENV: 'production',
      DATASTRATA_FORBIDDEN_ROOT: forbiddenRoots.join(delimiter),
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
    return { started: false, status: 0, body: undefined, text: '', log };
  }

  let status = 0;
  let body;
  let text = '';
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/check`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(CHECK_REQUEST_BODY),
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

/**
 * Proves the guard is live in the server process before its silence is trusted.
 *
 * A guard that never fires is indistinguishable from a guard that is not
 * installed, and "the server read nothing from the repository" is then a
 * negative observation satisfied vacuously — TEST-EVIDENCE-STANDARD failure
 * mode 7. So it is first aimed at a directory the server certainly *does* read,
 * its own traced engine data, and required to fire.
 */
export async function proveGuardLive({ isolationDir, artifact }) {
  const control = await requestFromArtifact({
    isolationDir,
    forbiddenRoots: [join(artifact, 'backend')],
  });
  if (!control.log.includes('IsolationViolationError')) {
    fail(
      "The isolation guard did not fire when the artifact's own engine directory was " +
        'forbidden. Its silence during the authoritative run therefore proves nothing: ' +
        'the preload is not active, and this test cannot claim the server was isolated.',
      control.log,
    );
  }
  note('guard fired as required — its silence below is meaningful');
}

/** Deletes an isolation directory, or says where it was kept. */
export function releaseIsolation(isolationDir, keep) {
  if (!isolationDir) return;
  if (keep) console.error(`\nThe isolated runtime was kept for inspection at ${isolationDir}`);
  else rmSync(isolationDir, { recursive: true, force: true });
}
