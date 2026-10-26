/**
 * The production smoke check: does the artifact a container would run behave,
 * on a real production server, the way the pilot gate's tests say it does?
 *
 * `npm test` holds the gate's policy by calling the middleware and the route
 * handlers directly, and that is the right layer for the policy. What it
 * cannot see is what Next does to an answer between those functions and the
 * socket, and the pilot-readiness work turned on exactly that seam: whether the
 * configured security headers reach the middleware's own 303, 401 and 503;
 * whether Next's adapter rewrites a middleware `Location`; how a body that
 * streams past its limit is answered on a real connection; whether the cookie
 * carries `Secure` because the server runs as production, not because a header
 * said https. Each of those is a property of a running server, so this file
 * builds one and asks it, once per property, printing PASS or FAIL.
 *
 * **It runs the artifact as the container runs it.** There is one recipe for
 * building and isolating the standalone artifact (`standalone-harness.mjs`),
 * and this file spends it rather than writing a second. The runtime layout is
 * the image's: the standalone tree, `.next/static` beside the server,
 * `node server.js` started from `frontend/web`, `NODE_ENV=production`,
 * `HOSTNAME` and `PORT` from the environment, and every file read-only to the
 * server except `frontend/web/.next/cache`. The read-only tree is not
 * decoration: a server that writes where the image will not let it is a
 * deployment failure, and here it surfaces as a refused write in the server's
 * log instead. It does **not** build or run an image, and says so.
 *
 * **The server's environment is built, never inherited.** It gets `PATH` and
 * nothing else of the caller's, plus `NODE_ENV`, `HOSTNAME`, `PORT`,
 * `NEXT_TELEMETRY_DISABLED`, a synthetic secret drawn for this run and never
 * printed, and `DATASTRATA_PUBLIC_ORIGIN`. Never a profile, never a webhook.
 * The build, by contrast, inherits the caller's environment. That asymmetry is
 * deliberate: build-time sentinels reach the build and no server, so a scan of
 * `.next` for them proves nothing server-only was inlined, and a `Location` on
 * the runtime origin proves the origin is read when the server runs.
 *
 * **Three starts, one artifact.** The hosted form first, with the origin set to
 * `https://pilot.example.test`, a reserved test name standing for the origin a
 * proxy would serve; no proxy runs, so the headers a proxy or a client could
 * add are sent by hand. Then the same artifact without
 * `DATASTRATA_PUBLIC_ORIGIN`, which must fail closed: an unusable origin
 * refuses even a valid session. Then the local form, `http://localhost:<port>`
 * on a server bound to 127.0.0.1, which is how a pilot runs on one machine and
 * the one case where the configured host equals the host Next builds the
 * request URL with, so Next's adapter rewrites the middleware's `Location`
 * itself.
 *
 * **Why it is not part of `npm test`.** It runs `next build`, which fetches
 * Google Fonts, and `npm test` performs no network fetch. It is run by hand
 * before a deployment, from the repository root: `node scripts/smoke-production.mjs`,
 * with `--keep` to keep the isolated artifact for inspection.
 *
 * **What it does not test.** The sign-in limiter's policy (pilot readiness
 * B1) is unchanged and unexamined here; the limiter is used only to show that
 * refused posts are not charged to it. It is five failures per fifteen minutes
 * shared by everyone, so each start sends at most two wrong passphrases.
 * Isolation from the source checkout is `test-standalone.mjs`'s question, not
 * this one's: no read guard is loaded here, so a read of the checkout would go
 * unseen.
 */

import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { chmodSync, lstatSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import { join } from 'node:path';
import {
  CHECK_REQUEST_BODY,
  StandaloneFailure,
  buildStandalone,
  isolateArtifact,
  releaseIsolation,
  repoRoot,
  timelineLines,
  timelineSummary,
} from './standalone-harness.mjs';

// ---------------------------------------------------------------------------
// What the deployment promises, stated here rather than read from the source,
// so a change on either side is a disagreement this run reports.
// ---------------------------------------------------------------------------

/** The public origin a proxy would serve, a reserved test name (RFC 6761). */
const PUBLIC_ORIGIN = 'https://pilot.example.test';
/** Another site, for the cross-site posts. */
const OTHER_SITE = 'https://evil.example';
const SECRET_ENV = 'DATASTRATA_PILOT_ACCESS_SECRET';
const ORIGIN_ENV = 'DATASTRATA_PUBLIC_ORIGIN';
const COOKIE_NAME = 'ds_pilot_access';
const COOKIE_PATH = '/dashboard';
const SESSION_SECONDS = '43200';
/** The body limits pilot readiness B4 states for each public POST. */
const LIMITS = { signIn: 4096, check: 8192, contact: 32768 };
/** The B5 set, exact names and values, each to arrive exactly once. */
const B5_HEADERS = [
  ['Content-Security-Policy', "frame-ancestors 'none'"],
  ['X-Frame-Options', 'DENY'],
  ['X-Content-Type-Options', 'nosniff'],
  ['Referrer-Policy', 'strict-origin-when-cross-origin'],
  ['Strict-Transport-Security', 'max-age=31536000'],
];
const NOT_CONFIGURED = 'Pilot access is not configured on this server.';
const CROSS_SITE_SENTENCE = 'That request did not come from this site, so it was refused.';
/** The ports a local `next dev` or `next start` takes by default: a run never binds or contacts them, so it can never answer for, or be answered by, a server someone else started. */
const FORBIDDEN_PORTS = new Set([3000, 3001]);
const HTML_ACCEPT = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';
/** What a browser adds to a form post it submits from a page of the site itself. */
const SAME_ORIGIN_FORM = {
  accept: HTML_ACCEPT,
  'content-type': 'application/x-www-form-urlencoded',
  'sec-fetch-site': 'same-origin',
  'sec-fetch-mode': 'navigate',
  'sec-fetch-dest': 'document',
};

const USAGE = 'usage: node scripts/smoke-production.mjs [--keep]';
const args = process.argv.slice(2);
if (args.some((a) => a !== '--keep')) {
  console.error(USAGE);
  process.exit(2);
}
const keep = args.includes('--keep');

// ---------------------------------------------------------------------------
// Output. Everything printed in this process is kept, so the leak scan at the
// end can read this run's own output for the secret and the session tokens.
// ---------------------------------------------------------------------------

const printed = [];
for (const stream of ['log', 'error']) {
  const original = console[stream].bind(console);
  console[stream] = (...parts) => {
    printed.push(parts.map(String).join(' '));
    original(...parts);
  };
}
const say = (line = '') => console.log(line);

function heading(text) {
  say(`\n${'═'.repeat(78)}\n${text}\n${'═'.repeat(78)}`);
}

const results = [];
const counters = new Map();
function nextId(prefix) {
  const n = (counters.get(prefix) ?? 0) + 1;
  counters.set(prefix, n);
  return `${prefix}${String(n).padStart(2, '0')}`;
}

/** One PASS or FAIL line; a FAIL line ends with everything that failed. What was observed follows, indented. */
function check(id, label, problems, details = []) {
  const ok = problems.length === 0;
  results.push({ id, label, ok, problems });
  say(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${label}${ok ? '' : `  ✗ ${problems.join('; ')}`}`);
  for (const d of details) say(`        · ${d}`);
}

// ---------------------------------------------------------------------------
// Requests, over node:http, so every header is exactly what is written here.
// ---------------------------------------------------------------------------

function assertPort(port) {
  if (FORBIDDEN_PORTS.has(port)) throw new Error(`refusing to contact port ${port}`);
}

function toResponse(res, buffer) {
  return { status: res.statusCode, raw: res.rawHeaders, body: buffer.toString('utf8') };
}

/** Every value of a header, in order, matched case-insensitively. */
function values(response, name) {
  const found = [];
  for (let i = 0; i < response.raw.length; i += 2) {
    if (response.raw[i].toLowerCase() === name.toLowerCase()) found.push(response.raw[i + 1]);
  }
  return found;
}

/** One request with exactly the headers given. A body is sent with its `Content-Length`. */
function send(port, { method = 'GET', path, headers = {}, body }) {
  assertPort(port);
  return new Promise((resolve, reject) => {
    const all = { ...headers };
    if (body !== undefined) all['content-length'] = String(Buffer.byteLength(body));
    const req = http.request({ host: '127.0.0.1', port, method, path, headers: all, agent: false }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(toResponse(res, Buffer.concat(chunks))));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(60_000, () => req.destroy(new Error(`timed out: ${method} ${path}`)));
    req.end(body);
  });
}

/**
 * A body streamed with `Transfer-Encoding: chunked` and no `Content-Length`, 1 KiB at a time, up to `totalBytes`, stopping
 * as soon as a status arrives. The server may answer and close before the client has finished writing, so a write error is
 * recorded rather than thrown, the status is still read, and the outcome says whether the connection was reset.
 */
function sendStreamed(port, { path, headers, prefix, suffix, totalBytes }) {
  assertPort(port);
  return new Promise((resolve) => {
    const outcome = { status: null, response: null, errors: [], written: 0, writtenAtStatus: null, totalBytes };
    let responseDone = false;
    let requestClosed = false;
    let settled = false;
    const finish = () => {
      if (settled || !requestClosed || (outcome.status !== null && !responseDone)) return;
      settled = true;
      resolve(outcome);
    };
    const req = http.request({
      host: '127.0.0.1',
      port,
      method: 'POST',
      path,
      headers: { ...headers, 'transfer-encoding': 'chunked' },
      agent: false,
    });
    req.on('response', (res) => {
      outcome.status = res.statusCode;
      outcome.writtenAtStatus = outcome.written;
      const chunks = [];
      const done = () => {
        if (responseDone) return;
        outcome.response = toResponse(res, Buffer.concat(chunks));
        responseDone = true;
        finish();
      };
      res.on('data', (c) => chunks.push(c));
      res.on('end', done);
      res.on('error', (e) => {
        outcome.errors.push(e.code ?? e.message);
        done();
      });
      res.on('close', done);
    });
    req.on('error', (e) => outcome.errors.push(e.code ?? e.message));
    req.on('close', () => {
      requestClosed = true;
      finish();
    });
    req.setTimeout(60_000, () => req.destroy(new Error('timed out')));
    setTimeout(() => {
      if (!settled) {
        outcome.errors.push('gave up after 90 s');
        settled = true;
        resolve(outcome);
      }
    }, 90_000).unref();

    const stillWriting = () => outcome.status === null && !requestClosed && outcome.errors.length === 0;
    (async () => {
      try {
        const padding = Buffer.alloc(1024, 'a');
        req.write(prefix);
        outcome.written += Buffer.byteLength(prefix);
        while (outcome.written < totalBytes && stillWriting()) {
          const flushed = req.write(padding);
          outcome.written += padding.length;
          if (!flushed) {
            await firstOf(req, ['drain', 'response', 'close']);
          } else {
            await new Promise((r) => setImmediate(r));
          }
        }
        // Closing the JSON or form keeps a body that got through (a defect) a well-formed sign-in or check, so it would show
        // as an answer, never as a parse failure charged to the limiter.
        if (stillWriting()) {
          req.write(suffix);
          outcome.written += Buffer.byteLength(suffix);
        }
        if (!requestClosed) req.end();
      } catch (e) {
        outcome.errors.push(e.code ?? e.message);
      }
    })();
  });
}

/**
 * Resolves with whichever event fires first and detaches every listener it added. Not `events.once`: that rejects on
 * `'error'`, and the losers of a race would then be unhandled rejections, which end the process.
 */
function firstOf(emitter, events) {
  return new Promise((resolve) => {
    const handlers = events.map((event) => [event, () => {
      for (const [e, h] of handlers) emitter.off(e, h);
      resolve(event);
    }]);
    for (const [e, h] of handlers) emitter.on(e, h);
  });
}

function connectionWasReset(outcome) {
  return outcome.errors.some((e) => e === 'ECONNRESET' || e === 'EPIPE' || /hang up/.test(e));
}

// ---------------------------------------------------------------------------
// Judgements, as lists of problems. An empty list is a PASS.
// ---------------------------------------------------------------------------

const show = (list) => (list.length === 0 ? 'absent' : list.map((v) => JSON.stringify(v)).join(' + '));
/** A header's name as a FAIL line prints it: `cache-control` as `Cache-Control`. */
const titled = (name) => name.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('-');

function statusIs(r, status) {
  return r.status === status ? [] : [`status ${r.status}, not ${status}`];
}

function headerIs(r, name, value) {
  const got = values(r, name);
  return got.length === 1 && got[0] === value ? [] : [`${titled(name)} ${show(got)}, not ${JSON.stringify(value)}`];
}

function headerAbsent(r, name) {
  const got = values(r, name);
  return got.length === 0 ? [] : [`${titled(name)} present: ${name.toLowerCase() === 'set-cookie' ? got.map(redactCookie).join(' + ') : show(got)}`];
}

function tokens(r, name) {
  return values(r, name).flatMap((v) => v.split(',').map((t) => t.trim().toLowerCase()));
}

/** `Cookie` among `Vary`'s comma-separated tokens: Next's compression appends `Accept-Encoding` to a body it compresses. */
function varyHasCookie(r) {
  return tokens(r, 'vary').includes('cookie') ? [] : [`Vary ${show(values(r, 'vary'))} has no Cookie token`];
}

function bodyIs(r, text) {
  return r.body === text ? [] : [`body ${JSON.stringify(r.body.slice(0, 200))}, not ${JSON.stringify(text)}`];
}

/** The five B5 headers, each exactly once with its exact value, and no `X-Powered-By`. */
function b5Problems(r) {
  const problems = [];
  for (const [name, value] of B5_HEADERS) {
    const got = values(r, name);
    if (got.length === 0) problems.push(`${name} absent`);
    else if (got.length > 1) problems.push(`${name} sent ${got.length} times: ${show(got)}`);
    else if (got[0] !== value) problems.push(`${name} is ${JSON.stringify(got[0])}, not ${JSON.stringify(value)}`);
  }
  const powered = values(r, 'X-Powered-By');
  if (powered.length > 0) problems.push(`X-Powered-By present: ${show(powered)}`);
  return problems;
}

function parseCookie(header) {
  const [pair, ...rest] = header.split(';').map((part) => part.trim());
  const eq = pair.indexOf('=');
  const attributes = new Map();
  for (const attribute of rest) {
    const i = attribute.indexOf('=');
    if (i === -1) attributes.set(attribute.toLowerCase(), true);
    else attributes.set(attribute.slice(0, i).trim().toLowerCase(), attribute.slice(i + 1).trim());
  }
  return { name: eq === -1 ? pair : pair.slice(0, eq), value: eq === -1 ? '' : pair.slice(eq + 1), attributes };
}

/** A `Set-Cookie` with its value replaced by its length: the value is a credential. */
function redactCookie(header) {
  const [pair, ...rest] = header.split(';');
  const eq = pair.indexOf('=');
  const value = eq === -1 ? '' : pair.slice(eq + 1);
  const shown = value === '' ? '' : `<redacted, ${value.length} chars>`;
  return [`${eq === -1 ? pair : pair.slice(0, eq)}=${shown}`, ...rest].join(';');
}

/**
 * The session cookie as the design states it, each attribute judged on its own so a FAIL names the one missing: `Secure`,
 * `HttpOnly`, `SameSite=Strict`, `Path=/dashboard`, and `Max-Age` 43200 when issued or 0 when cleared.
 */
function cookieProblems(r, { cleared }) {
  const headers = values(r, 'set-cookie');
  if (headers.length !== 1) return [`expected exactly one Set-Cookie, got ${headers.length}`];
  const cookie = parseCookie(headers[0]);
  const problems = [];
  if (cookie.name !== COOKIE_NAME) problems.push(`cookie name ${JSON.stringify(cookie.name)}, not ${COOKIE_NAME}`);
  if (cleared && cookie.value !== '') problems.push('cookie value not emptied');
  if (!cleared && cookie.value === '') problems.push('cookie value empty');
  if (cookie.attributes.get('secure') !== true) problems.push('Secure absent');
  if (cookie.attributes.get('httponly') !== true) problems.push('HttpOnly absent');
  if (cookie.attributes.get('samesite') !== 'Strict') problems.push(`SameSite ${JSON.stringify(cookie.attributes.get('samesite') ?? null)}, not Strict`);
  if (cookie.attributes.get('path') !== COOKIE_PATH) problems.push(`Path ${JSON.stringify(cookie.attributes.get('path') ?? null)}, not ${COOKIE_PATH}`);
  const maxAge = cleared ? '0' : SESSION_SECONDS;
  if (cookie.attributes.get('max-age') !== maxAge) problems.push(`Max-Age ${JSON.stringify(cookie.attributes.get('max-age') ?? null)}, not ${maxAge}`);
  return problems;
}

function sessionToken(r) {
  const headers = values(r, 'set-cookie');
  if (headers.length !== 1) return null;
  const cookie = parseCookie(headers[0]);
  return cookie.name === COOKIE_NAME && cookie.value !== '' ? cookie.value : null;
}

/**
 * Phase 1's judgement of the check's answer (`scripts/test-standalone.mjs`), condition for condition: a CSRD pack identity,
 * at least one timeline line, at least one citation, and draft content declared, because the real ledger is empty. Phase 1
 * keeps it inline rather than exporting it, so it is restated here; a change to one is a change to make in the other. (The
 * check answers with the start-year timeline since DP1 Task 6; before, a list of determinations.)
 */
function checkAnswerProblems(r) {
  const problems = statusIs(r, 200);
  let body;
  try {
    body = JSON.parse(r.body);
  } catch {
    return [...problems, 'body is not JSON'];
  }
  if (!body || body.pack?.id !== 'csrd') problems.push('no CSRD pack identity');
  const lines = timelineLines(body);
  if (lines.length === 0) problems.push('no timeline lines: the knowledge pack did not load');
  else if (!lines.some((line) => Array.isArray(line.legalBasis?.sources) && line.legalBasis.sources.length > 0)) problems.push('no timeline line carries a citation');
  if (body?.content?.draft !== true) problems.push('content.draft is not true over a repository whose ledger is empty');
  return problems;
}

// ---------------------------------------------------------------------------
// The artifact, read-only as the image makes it.
// ---------------------------------------------------------------------------

/** Every directory and file under `root` (symbolic links counted and left alone), deepest first. */
function walk(root, visit) {
  let links = 0;
  const go = (path) => {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) {
      links += 1;
      return;
    }
    if (stat.isDirectory()) for (const entry of readdirSync(path)) go(join(path, entry));
    visit(path, stat);
  };
  go(root);
  return links;
}

/**
 * Takes every write bit off the artifact except on `frontend/web/.next/cache`, created if absent, which is what the image
 * does by owning the tree as root and the cache as the server's user. Returns the number of symbolic links seen.
 */
function makeReadOnly(artifact, cacheDir) {
  mkdirSync(cacheDir, { recursive: true });
  const links = walk(artifact, (path, stat) => chmodSync(path, stat.mode & 0o7555));
  chmodSync(cacheDir, 0o755);
  return links;
}

/** Gives directories their owner's write bit back, so the isolation directory can be removed (or, with `--keep`, removed later). */
function restoreDirectoryWrite(artifact) {
  walk(artifact, (path, stat) => {
    if (stat.isDirectory()) chmodSync(path, stat.mode | 0o200);
  });
}

function probeWrite(dir) {
  const probe = join(dir, '.smoke-write-probe');
  try {
    writeFileSync(probe, 'probe');
    rmSync(probe, { force: true });
    return { written: true };
  } catch (e) {
    return { written: false, code: e.code ?? e.message };
  }
}

// ---------------------------------------------------------------------------
// Servers: one process group each, always stopped, and shown to be gone.
// ---------------------------------------------------------------------------

const live = new Set();
const started = [];

function tool(command, argv) {
  const r = spawnSync(command, argv, { encoding: 'utf8' });
  if (r.error) return null;
  return r.stdout.trim();
}

function listenerOn(port) {
  return tool('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN']);
}

async function freePort() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const port = await new Promise((res, rej) => {
      const probe = net.createServer();
      probe.on('error', rej);
      probe.listen(0, '127.0.0.1', () => {
        const { port: p } = probe.address();
        probe.close(() => res(p));
      });
    });
    if (FORBIDDEN_PORTS.has(port)) continue;
    const listener = listenerOn(port);
    if (listener !== null && listener !== '') continue;
    return port;
  }
  throw new Error('no free loopback port found');
}

function refusesConnections(port) {
  assertPort(port);
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    socket.on('connect', () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('error', () => resolve(true));
  });
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Starts `node server.js` in the artifact with an environment built here: `PATH` from the caller and nothing else of its,
 * then the values the image or the host supplies. `origin` undefined leaves `DATASTRATA_PUBLIC_ORIGIN` unset.
 */
async function startServer(name, { serverDir, port, origin, secret }) {
  const env = {
    PATH: process.env.PATH ?? '',
    NODE_ENV: 'production',
    HOSTNAME: '127.0.0.1',
    PORT: String(port),
    NEXT_TELEMETRY_DISABLED: '1',
    [SECRET_ENV]: secret,
  };
  if (origin !== undefined) env[ORIGIN_ENV] = origin;
  say(`server ${name}: node ${process.version}, \`node server.js\` in ${serverDir}`);
  say(`server ${name}: environment names ${Object.keys(env).join(' ')}`);
  say(
    `server ${name}: NODE_ENV=production HOSTNAME=127.0.0.1 PORT=${port} NEXT_TELEMETRY_DISABLED=1 ` +
      `${ORIGIN_ENV}=${origin ?? '(unset)'} ${SECRET_ENV}=(synthetic, ${secret.length} characters, not printed)`,
  );
  const child = spawn(process.execPath, ['server.js'], { cwd: serverDir, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const server = { name, port, pid: child.pid, child, log: '', exited: false, stopped: false };
  child.stdout.on('data', (d) => (server.log += d));
  child.stderr.on('data', (d) => (server.log += d));
  server.exit = new Promise((res) => child.on('exit', (code, signal) => res({ code, signal })));
  server.exit.then(() => (server.exited = true));
  live.add(server);
  started.push(server);
  say(`server ${name}: started, pid ${child.pid} in a process group of its own`);

  const deadline = Date.now() + 60_000;
  const t0 = Date.now();
  while (Date.now() < deadline && !server.exited) {
    try {
      await send(port, { path: '/', headers: { accept: HTML_ACCEPT } });
      say(`server ${name}: answering on 127.0.0.1:${port} after ${Date.now() - t0} ms`);
      return server;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  throw new StandaloneFailure(`Server ${name} never answered on 127.0.0.1:${port}.`, redact(server.log));
}

/** Signals the server's process group, waits for it, and judges that the process is gone and the port refuses connections. */
async function stopServer(server, id) {
  if (!server.stopped) {
    try {
      process.kill(-server.pid, 'SIGTERM');
    } catch {
      /* already gone */
    }
    await Promise.race([server.exit, new Promise((r) => setTimeout(r, 10_000))]);
    if (!server.exited) {
      try {
        process.kill(-server.pid, 'SIGKILL');
      } catch {
        /* gone */
      }
      await Promise.race([server.exit, new Promise((r) => setTimeout(r, 5_000))]);
    }
    server.stopped = true;
    live.delete(server);
  }
  if (id === undefined) return;
  const problems = [];
  if (alive(server.pid)) problems.push(`pid ${server.pid} is still running`);
  if (!(await refusesConnections(server.port))) problems.push(`127.0.0.1:${server.port} still accepts connections`);
  const ps = tool('ps', ['-p', String(server.pid), '-o', 'pid=']);
  const group = tool('pgrep', ['-g', String(server.pid)]);
  const listener = listenerOn(server.port);
  const shown = (v) => (v === null ? 'unavailable' : v === '' ? '(none)' : v.replace(/\n/g, ' | '));
  check(id, `server ${server.name} stopped: pid ${server.pid} gone and port ${server.port} closed`, problems, [
    `ps -p ${server.pid}: ${shown(ps)}; pgrep -g ${server.pid}: ${shown(group)}; lsof LISTEN on ${server.port}: ${shown(listener)}`,
  ]);
}

function killEverythingNow() {
  for (const server of live) {
    try {
      process.kill(-server.pid, 'SIGKILL');
    } catch {
      /* gone */
    }
  }
}

// ---------------------------------------------------------------------------
// The run.
// ---------------------------------------------------------------------------

/** Every response read, for the leak scan. */
const responses = [];
/** Every session token any response set, expected or not, for the leak scan and the redaction of printed logs. */
const issuedTokens = [];
/** The session the hosted start's browser sign-in issued, presented again to the fail-closed start. */
let hostedSession = null;
let secret;
let isolationDir;
let artifact;

/** Keeps a response for the leak scan, with any session token it set. */
function remember(r) {
  responses.push(r);
  for (const header of values(r, 'set-cookie')) {
    const cookie = parseCookie(header);
    if (cookie.name === COOKIE_NAME && cookie.value !== '' && !issuedTokens.includes(cookie.value)) issuedTokens.push(cookie.value);
  }
}

/** One exchange: the behavioural check, then the B5 header check on the same response. */
async function exchange(prefix, label, perform, judge) {
  const id = nextId(prefix);
  let r;
  try {
    r = await perform();
  } catch (e) {
    check(id, label, [`no response: ${e instanceof Error ? e.message : String(e)}`]);
    check(`${id}h`, 'the five B5 headers', ['no response to read']);
    return null;
  }
  remember(r);
  const { problems, details = [] } = judge(r);
  check(id, label, problems, details);
  check(`${id}h`, 'the five B5 headers, each exactly once, and no X-Powered-By', b5Problems(r));
  return r;
}

/** A streamed oversize post, judged on its status; what happened to the connection is recorded beside it. */
async function streamedExchange(prefix, label, port, request, expectedBody) {
  const id = nextId(prefix);
  const outcome = await sendStreamed(port, request);
  const reset = connectionWasReset(outcome);
  const details = [
    `${outcome.status === null ? `no status arrived; the client had handed ${outcome.written}` : `the status arrived after the client had handed ${outcome.writtenAtStatus}`} ` +
      `of ${outcome.totalBytes} body bytes to the socket; ` +
      `connection reset: ${reset ? 'yes' : 'no'}${outcome.errors.length > 0 ? ` (${outcome.errors.join(', ')})` : ''}`,
  ];
  if (outcome.status === null) {
    check(id, label, [`no status was received${outcome.errors.length > 0 ? `: ${outcome.errors.join(', ')}` : ''}`], details);
    check(`${id}h`, 'the five B5 headers', ['no response to read']);
    return outcome;
  }
  const problems = [...(outcome.status === 413 ? [] : [`status ${outcome.status}, not 413`])];
  if (outcome.response === null) problems.push('the response body could not be read');
  else problems.push(...bodyIs(outcome.response, expectedBody), ...headerAbsent(outcome.response, 'set-cookie'));
  check(id, label, problems, details);
  if (outcome.response !== null) {
    remember(outcome.response);
    check(`${id}h`, 'the five B5 headers, each exactly once, and no X-Powered-By', b5Problems(outcome.response));
  } else {
    check(`${id}h`, 'the five B5 headers', ['the response could not be read']);
  }
  return outcome;
}

/**
 * What the server wrote, judged after it has stopped: no write the read-only tree refused, and every sign-in or sign-out
 * refusal logged as `pilot-access: refused (<status>)` and nothing else, in the numbers this start's requests should cause.
 */
function judgeServerLog(prefix, server, expectedRefusals) {
  const id = nextId(prefix);
  const problems = [];
  const permission = server.log.split('\n').filter((line) => /EACCES|EPERM|EROFS|read-only file system|permission denied/i.test(line));
  if (permission.length > 0) problems.push(`a write was refused: ${permission.slice(0, 3).map(redact).join(' | ')}`);
  const gateLines = server.log.split('\n').filter((line) => line.includes('pilot-access'));
  const malformed = gateLines.filter((line) => !/^pilot-access: refused \(\d{3}\)$/.test(line.trim()));
  if (malformed.length > 0) problems.push(`a pilot-access log line says more than a status: ${malformed.slice(0, 3).map((l) => JSON.stringify(redact(l))).join(' | ')}`);
  const counted = {};
  for (const line of gateLines) {
    const status = /\((\d{3})\)/.exec(line)?.[1];
    if (status !== undefined) counted[status] = (counted[status] ?? 0) + 1;
  }
  const want = Object.entries(expectedRefusals).map(([s, n]) => `${n}×${s}`).join(', ') || 'none';
  const got = Object.entries(counted).sort().map(([s, n]) => `${n}×${s}`).join(', ') || 'none';
  if (want !== got) problems.push(`refusals logged ${got}, not ${want}`);
  check(id, `server ${server.name} log: refusals logged as a status alone (${want}), and no refused write`, problems);
}

/** A server's own text with the secret and every session token replaced by a placeholder, so it can be printed. */
function redact(text) {
  let out = text;
  const redactions = [[secret, '<the synthetic secret>'], ...issuedTokens.map((t) => [t, '<a session token>'])];
  for (const [value, label] of redactions) if (value) out = out.split(value).join(label);
  return out;
}

function printServerLog(server) {
  say(`server ${server.name} log (a secret or session token would show as a placeholder; the leak scan counts them in the raw log):`);
  for (const line of redact(server.log).trimEnd().split('\n')) say(`  | ${line}`);
}

async function hostedStart(serverDir) {
  heading(`START A — the hosted form: ${ORIGIN_ENV}=${PUBLIC_ORIGIN}`);
  const port = await freePort();
  const server = await startServer('A', { serverDir, port, origin: PUBLIC_ORIGIN, secret });
  try {
    const P = 'A';
    const html = { accept: HTML_ACCEPT };
    const page = (path) => () => send(port, { path, headers: html });

    say('\n▸ pages, a static asset, a 404 and the check');
    const home = await exchange(P, 'GET / answers 200', page('/'), (r) => ({ problems: statusIs(r, 200) }));
    // Served from `.next/static` copied beside the server, which is the image's layout; a 404 here would mean the copy is wrong.
    const asset = home === null ? undefined : /\/_next\/static\/[^"'\s]+\.js/.exec(home.body)?.[0];
    await exchange(P, `a script the home page references (${asset ?? 'none found'}) answers 200 from .next/static beside the server`, async () => {
      if (asset === undefined) throw new Error('the home page references no /_next/static script');
      return send(port, { path: asset });
    }, (r) => ({ problems: statusIs(r, 200), details: [`Cache-Control: ${show(values(r, 'cache-control'))}`] }));
    await exchange(P, 'GET /no-such-page-smoke answers 404', page('/no-such-page-smoke'), (r) => ({ problems: statusIs(r, 404) }));
    for (const path of ['/check', '/contact']) {
      await exchange(P, `GET ${path} answers 200`, page(path), (r) => ({ problems: statusIs(r, 200) }));
    }
    const plainAccess = await exchange(P, 'GET /pilot-access answers 200', page('/pilot-access'), (r) => ({ problems: statusIs(r, 200) }));
    await exchange(P, `GET /pilot-access?reason=cross_site answers 200 with the cross_site sentence, which /pilot-access alone does not carry`, page('/pilot-access?reason=cross_site'), (r) => ({
      problems: [
        ...statusIs(r, 200),
        ...(r.body.includes(CROSS_SITE_SENTENCE) ? [] : ['the cross_site sentence is not on the page']),
        ...(plainAccess !== null && !plainAccess.body.includes(CROSS_SITE_SENTENCE) ? [] : ['/pilot-access without a reason carries the sentence too, or was not read']),
      ],
    }));
    await exchange(
      P,
      "POST /api/check answers 200 with the answer test-standalone's phase 1 accepts",
      () => send(port, { method: 'POST', path: '/api/check', headers: { 'content-type': 'application/json' }, body: JSON.stringify(CHECK_REQUEST_BODY) }),
      (r) => {
        const problems = checkAnswerProblems(r);
        let detail = [];
        try {
          const b = JSON.parse(r.body);
          detail = [`pack ${b.pack?.id}@${b.pack?.version} · ${timelineSummary(b)} · content.draft ${b.content?.draft}`];
        } catch {
          /* the problem list says so */
        }
        return { problems, details: detail };
      },
    );

    say('\n▸ /dashboard without a session');
    const gateDetails = (r) => [`Location: ${show(values(r, 'location'))}; Cache-Control: ${show(values(r, 'cache-control'))}; Vary: ${show(values(r, 'vary'))}`];
    await exchange(P, '/dashboard without a session, as a script (Accept: application/json): 401 no_session, private, no-store, Vary names Cookie', () => send(port, { path: '/dashboard', headers: { accept: 'application/json' } }), (r) => ({
      problems: [...statusIs(r, 401), ...bodyIs(r, '{"error":"unauthorized","reason":"no_session"}'), ...headerIs(r, 'cache-control', 'private, no-store'), ...varyHasCookie(r), ...headerAbsent(r, 'location')],
      details: gateDetails(r),
    }));
    const refusedTo = `${PUBLIC_ORIGIN}/pilot-access?reason=no_session`;
    const steering = [
      ['with no proxy header', {}],
      ['with Host: evil.example', { host: 'evil.example' }],
      ['with X-Forwarded-Host: evil.example', { 'x-forwarded-host': 'evil.example' }],
      ['with X-Forwarded-Proto: https', { 'x-forwarded-proto': 'https' }],
      ['with all three at once', { host: 'evil.example', 'x-forwarded-host': 'evil.example', 'x-forwarded-proto': 'https' }],
    ];
    for (const [how, extra] of steering) {
      await exchange(P, `/dashboard without a session, as a browser, ${how}: 303 to exactly ${refusedTo}`, () => send(port, { path: '/dashboard', headers: { ...html, ...extra } }), (r) => ({
        problems: [...statusIs(r, 303), ...headerIs(r, 'location', refusedTo), ...headerIs(r, 'cache-control', 'private, no-store'), ...varyHasCookie(r), ...headerAbsent(r, 'set-cookie')],
        details: gateDetails(r),
      }));
    }

    say('\n▸ sign-in, and the dashboard with the session it issues');
    const formWithSecret = `passphrase=${encodeURIComponent(secret)}`;
    const jsonWithSecret = JSON.stringify({ passphrase: secret });
    const sameOrigin = { ...SAME_ORIGIN_FORM, origin: PUBLIC_ORIGIN };
    const cookieDetails = (r) => [`Location: ${show(values(r, 'location'))}; Cache-Control: ${show(values(r, 'cache-control'))}`, `Set-Cookie: ${values(r, 'set-cookie').map(redactCookie).join(' + ') || 'absent'}`];
    // No X-Forwarded-Proto: the request URL is plain http, so a `Secure` here can only come from the production rule.
    const signedIn = await exchange(P, `sign-in as a browser sends it (form, Origin ${PUBLIC_ORIGIN}, Sec-Fetch-Site: same-origin, no X-Forwarded-Proto): relative 303 to /dashboard with ${COOKIE_NAME} Secure, HttpOnly, SameSite=Strict, Path=/dashboard, Max-Age=43200`, () => send(port, { method: 'POST', path: '/api/pilot-access', headers: sameOrigin, body: formWithSecret }), (r) => ({
      problems: [...statusIs(r, 303), ...headerIs(r, 'location', '/dashboard'), ...headerIs(r, 'cache-control', 'no-store'), ...cookieProblems(r, { cleared: false })],
      details: cookieDetails(r),
    }));
    const session = signedIn === null ? null : sessionToken(signedIn);
    hostedSession = session;
    await exchange(P, '/dashboard with that session: 200, the labelled synthetic profile, Cache-Control private and no-store', async () => {
      if (session === null) throw new Error('the browser sign-in issued no session cookie');
      return send(port, { path: '/dashboard', headers: { ...html, cookie: `${COOKIE_NAME}=${session}` } });
    }, (r) => ({
      problems: [
        ...statusIs(r, 200),
        ...(r.body.includes('Synthetic development profile') ? [] : ['the page does not say "Synthetic development profile"']),
        ...(r.body.includes('Meridian Steelworks') ? [] : ['the page does not name the synthetic company']),
        ...(tokens(r, 'cache-control').includes('private') && tokens(r, 'cache-control').includes('no-store') ? [] : [`Cache-Control ${show(values(r, 'cache-control'))} lacks private or no-store`]),
      ],
      details: [`Cache-Control: ${show(values(r, 'cache-control'))}; Vary: ${show(values(r, 'vary'))} (the page's own Vary; recorded, not judged)`],
    }));
    await exchange(P, 'compatibility exception, not evidence of a script: a sign-in with neither Origin nor Sec-Fetch-Site (JSON, no Accept) is let through and issues the same cookie', () => send(port, { method: 'POST', path: '/api/pilot-access', headers: { 'content-type': 'application/json' }, body: jsonWithSecret }), (r) => ({
      problems: [...statusIs(r, 303), ...headerIs(r, 'location', '/dashboard'), ...cookieProblems(r, { cleared: false })],
      details: cookieDetails(r),
    }));

    say('\n▸ cross-site sign-in, each carrying the right passphrase, then a wrong passphrase that must not find them charged');
    const crossSite403 = (r) => ({
      problems: [...statusIs(r, 403), ...bodyIs(r, '{"error":"cross_site"}'), ...headerIs(r, 'cache-control', 'no-store'), ...headerAbsent(r, 'set-cookie')],
    });
    const crossSite303 = (r) => ({
      problems: [...statusIs(r, 303), ...headerIs(r, 'location', '/pilot-access?reason=cross_site'), ...headerIs(r, 'cache-control', 'no-store'), ...headerAbsent(r, 'set-cookie')],
    });
    const json = { 'content-type': 'application/json' };
    const signInVariants = [
      [`Origin: ${OTHER_SITE} (no Sec-Fetch-Site): 403 cross_site, no cookie`, { ...json, origin: OTHER_SITE }, jsonWithSecret, crossSite403],
      ['Sec-Fetch-Site: cross-site without Origin: 403 cross_site, no cookie', { ...json, 'sec-fetch-site': 'cross-site' }, jsonWithSecret, crossSite403],
      [`a browser's form post from ${OTHER_SITE}: relative 303 to /pilot-access?reason=cross_site, no cookie`, { ...SAME_ORIGIN_FORM, 'sec-fetch-site': 'cross-site', origin: OTHER_SITE }, formWithSecret, crossSite303],
      ['Origin: http://pilot.example.test (the public host over plain http): 403, no cookie', { ...json, origin: 'http://pilot.example.test' }, jsonWithSecret, crossSite403],
      ['Sec-Fetch-Site: same-site without Origin (a sibling subdomain): 403, no cookie', { ...json, 'sec-fetch-site': 'same-site' }, jsonWithSecret, crossSite403],
      ['Origin: null (an opaque origin): 403, no cookie', { ...json, origin: 'null' }, jsonWithSecret, crossSite403],
    ];
    for (const [how, headers, body, judge] of signInVariants) {
      await exchange(P, `cross-site sign-in, ${how}`, () => send(port, { method: 'POST', path: '/api/pilot-access', headers, body }), judge);
    }
    const wrong = () => JSON.stringify({ passphrase: `wrong-${randomBytes(9).toString('base64url')}` });
    const sameOriginJson = { ...json, accept: 'application/json', origin: PUBLIC_ORIGIN, 'sec-fetch-site': 'same-origin' };
    await exchange(P, 'wrong passphrase 1 of 2, after the six cross-site sign-ins: 401 refused, not 429 — they were not charged (six charged would pass the limit of five)', () => send(port, { method: 'POST', path: '/api/pilot-access', headers: sameOriginJson, body: wrong() }), (r) => ({
      problems: [...statusIs(r, 401), ...bodyIs(r, '{"error":"refused"}'), ...headerAbsent(r, 'set-cookie')],
    }));

    say('\n▸ oversize sign-in (the right passphrase inside an oversize body), then a wrong passphrase that must not find them charged');
    const tooLarge = '{"error":"too_large"}';
    const pad = (n) => 'a'.repeat(n);
    const oversizeJson = JSON.stringify({ passphrase: secret, padding: pad(LIMITS.signIn) });
    const oversizeForm = `passphrase=${encodeURIComponent(secret)}&padding=${pad(LIMITS.signIn)}`;
    const declared413 = (r) => ({ problems: [...statusIs(r, 413), ...bodyIs(r, tooLarge), ...headerAbsent(r, 'set-cookie')] });
    await exchange(P, `sign-in, JSON, declared ${Buffer.byteLength(oversizeJson)} bytes (limit ${LIMITS.signIn}): 413 too_large`, () => send(port, { method: 'POST', path: '/api/pilot-access', headers: sameOriginJson, body: oversizeJson }), declared413);
    await exchange(P, `sign-in, form, declared ${Buffer.byteLength(oversizeForm)} bytes (limit ${LIMITS.signIn}): 413 too_large`, () => send(port, { method: 'POST', path: '/api/pilot-access', headers: { ...sameOriginJson, 'content-type': 'application/x-www-form-urlencoded' }, body: oversizeForm }), declared413);
    await streamedExchange(P, `sign-in, JSON, streamed chunked with no Content-Length (limit ${LIMITS.signIn}): 413 too_large`, port, {
      path: '/api/pilot-access', headers: sameOriginJson, prefix: `{"passphrase":${JSON.stringify(secret)},"padding":"`, suffix: '"}', totalBytes: LIMITS.signIn * 8,
    }, tooLarge);
    await streamedExchange(P, `sign-in, form, streamed chunked with no Content-Length (limit ${LIMITS.signIn}): 413 too_large`, port, {
      path: '/api/pilot-access', headers: { ...sameOriginJson, 'content-type': 'application/x-www-form-urlencoded' }, prefix: `passphrase=${encodeURIComponent(secret)}&padding=`, suffix: '', totalBytes: LIMITS.signIn * 8,
    }, tooLarge);
    await exchange(P, 'wrong passphrase 2 of 2, after the four oversize sign-ins: 401 refused, not 429 — they were not charged (one failure plus four would reach the limit)', () => send(port, { method: 'POST', path: '/api/pilot-access', headers: sameOriginJson, body: wrong() }), (r) => ({
      problems: [...statusIs(r, 401), ...bodyIs(r, '{"error":"refused"}'), ...headerAbsent(r, 'set-cookie')],
    }));

    say('\n▸ oversize check and contact posts, beside a contact post within the limit');
    const checkTooLarge = '{"error":"Request body too large."}';
    const contactTooLarge = '{"ok":false,"message":"Your message is too long."}';
    const oversizeCheck = JSON.stringify({ ...CHECK_REQUEST_BODY, padding: pad(LIMITS.check) });
    await exchange(P, `/api/check, declared ${Buffer.byteLength(oversizeCheck)} bytes (limit ${LIMITS.check}): 413`, () => send(port, { method: 'POST', path: '/api/check', headers: json, body: oversizeCheck }), (r) => ({ problems: [...statusIs(r, 413), ...bodyIs(r, checkTooLarge)] }));
    await streamedExchange(P, `/api/check, streamed chunked with no Content-Length (limit ${LIMITS.check}): 413`, port, {
      path: '/api/check', headers: json, prefix: `${JSON.stringify(CHECK_REQUEST_BODY).slice(0, -1)},"padding":"`, suffix: '"}', totalBytes: LIMITS.check * 8,
    }, checkTooLarge);
    const contactBase = { email: 'smoke@example.test', message: 'A synthetic message from the production smoke check.' };
    await exchange(P, '/api/contact within the limit: 503, not connected to an inbox (no webhook is configured, so nothing is sent)', () => send(port, { method: 'POST', path: '/api/contact', headers: json, body: JSON.stringify(contactBase) }), (r) => ({
      problems: [...statusIs(r, 503), ...bodyIs(r, '{"ok":false,"message":"This form is not connected to an inbox yet, so nothing was sent."}')],
    }));
    const oversizeContact = JSON.stringify({ ...contactBase, padding: pad(LIMITS.contact) });
    await exchange(P, `/api/contact, declared ${Buffer.byteLength(oversizeContact)} bytes (limit ${LIMITS.contact}): 413`, () => send(port, { method: 'POST', path: '/api/contact', headers: json, body: oversizeContact }), (r) => ({ problems: [...statusIs(r, 413), ...bodyIs(r, contactTooLarge)] }));
    await streamedExchange(P, `/api/contact, streamed chunked with no Content-Length (limit ${LIMITS.contact}): 413`, port, {
      path: '/api/contact', headers: json, prefix: `${JSON.stringify(contactBase).slice(0, -1)},"padding":"`, suffix: '"}', totalBytes: LIMITS.contact * 8,
    }, contactTooLarge);

    say('\n▸ sign-out');
    const signOut = (headers) => () => send(port, { method: 'POST', path: '/api/pilot-access/sign-out', headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers }, body: '' });
    await exchange(P, `cross-site sign-out, Origin: ${OTHER_SITE}: 403 cross_site, no Set-Cookie (the cookie is not cleared)`, signOut({ origin: OTHER_SITE }), crossSite403);
    await exchange(P, 'cross-site sign-out, Sec-Fetch-Site: cross-site without Origin: 403, no Set-Cookie', signOut({ 'sec-fetch-site': 'cross-site' }), crossSite403);
    await exchange(P, `cross-site sign-out, a browser's form post from ${OTHER_SITE}: relative 303 to /pilot-access?reason=cross_site, no Set-Cookie`, signOut({ ...SAME_ORIGIN_FORM, 'sec-fetch-site': 'cross-site', origin: OTHER_SITE }), crossSite303);
    const cleared = (r) => ({
      problems: [...statusIs(r, 303), ...headerIs(r, 'location', '/pilot-access'), ...headerIs(r, 'cache-control', 'no-store'), ...cookieProblems(r, { cleared: true })],
      details: cookieDetails(r),
    });
    await exchange(P, `sign-out as a browser sends it (form, Origin ${PUBLIC_ORIGIN}, Sec-Fetch-Site: same-origin): relative 303 to /pilot-access, the cookie cleared (empty, Max-Age=0, same Path, Secure)`, signOut(sameOrigin), cleared);
    await exchange(P, 'compatibility exception: a sign-out with neither Origin nor Sec-Fetch-Site clears the cookie', signOut({}), cleared);
  } finally {
    await stopServer(server);
  }
  judgeServerLog('A', server, { 401: 2, 403: 9, 413: 4 });
  await stopServer(server, nextId('A'));
  printServerLog(server);
}

async function failClosedStart(serverDir) {
  heading(`START B — fail closed: the same artifact with ${ORIGIN_ENV} unset`);
  const port = await freePort();
  const server = await startServer('B', { serverDir, port, origin: undefined, secret });
  try {
    const P = 'B';
    const html = { accept: HTML_ACCEPT };
    await exchange(P, 'GET / answers 200: the server is up, only the gate is closed', () => send(port, { path: '/', headers: html }), (r) => ({ problems: statusIs(r, 200) }));
    const failClosed = (r) => {
      const lines = r.body.split('\n');
      return {
        problems: [
          ...statusIs(r, 503),
          ...headerIs(r, 'content-type', 'text/plain; charset=utf-8'),
          ...(lines.length === 2 && lines[0] === NOT_CONFIGURED && lines[1].startsWith(`${ORIGIN_ENV} `) ? [] : [`body ${JSON.stringify(r.body)} is not the first line and one ${ORIGIN_ENV} problem`]),
          ...headerIs(r, 'cache-control', 'private, no-store'),
          ...varyHasCookie(r),
          ...headerAbsent(r, 'location'),
        ],
        details: [`body: ${JSON.stringify(r.body)}`, `Cache-Control: ${show(values(r, 'cache-control'))}; Vary: ${show(values(r, 'vary'))}`],
      };
    };
    await exchange(P, `/dashboard without a session, as a browser: 503 naming ${ORIGIN_ENV} (start A answered this 303)`, () => send(port, { path: '/dashboard', headers: html }), failClosed);
    await exchange(P, `/dashboard without a session, as a script: 503 naming ${ORIGIN_ENV} (start A answered this 401)`, () => send(port, { path: '/dashboard', headers: { accept: 'application/json' } }), failClosed);
    await exchange(P, `/dashboard with start A's valid session (same secret): 503 naming ${ORIGIN_ENV} (start A answered this 200)`, async () => {
      if (hostedSession === null) throw new Error('start A issued no session to present');
      return send(port, { path: '/dashboard', headers: { ...html, cookie: `${COOKIE_NAME}=${hostedSession}` } });
    }, failClosed);
    await exchange(P, 'sign-in with the right passphrase, neither Origin nor Sec-Fetch-Site: 503 unconfigured, no cookie', () => send(port, { method: 'POST', path: '/api/pilot-access', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ passphrase: secret }) }), (r) => ({
      problems: [...statusIs(r, 503), ...bodyIs(r, '{"error":"unconfigured"}'), ...headerIs(r, 'cache-control', 'no-store'), ...headerAbsent(r, 'set-cookie')],
    }));
    await exchange(P, `sign-in with the right passphrase as a browser sends it (Origin ${PUBLIC_ORIGIN}, same-origin): relative 303 to /pilot-access?reason=unconfigured, no cookie`, () => send(port, { method: 'POST', path: '/api/pilot-access', headers: { ...SAME_ORIGIN_FORM, origin: PUBLIC_ORIGIN }, body: `passphrase=${encodeURIComponent(secret)}` }), (r) => ({
      problems: [...statusIs(r, 303), ...headerIs(r, 'location', '/pilot-access?reason=unconfigured'), ...headerAbsent(r, 'set-cookie')],
    }));
    await exchange(P, 'sign-out as a browser sends it (Sec-Fetch-Site: same-origin) still clears the cookie on a misconfigured server', () => send(port, { method: 'POST', path: '/api/pilot-access/sign-out', headers: { ...SAME_ORIGIN_FORM, origin: PUBLIC_ORIGIN }, body: '' }), (r) => ({
      problems: [...statusIs(r, 303), ...headerIs(r, 'location', '/pilot-access'), ...cookieProblems(r, { cleared: true })],
      details: [`Set-Cookie: ${values(r, 'set-cookie').map(redactCookie).join(' + ') || 'absent'}`],
    }));
  } finally {
    await stopServer(server);
  }
  judgeServerLog('B', server, { 503: 2 });
  await stopServer(server, nextId('B'));
  printServerLog(server);
}

async function localStart(serverDir) {
  const port = await freePort();
  const local = `http://localhost:${port}`;
  heading(`START C — the local form: ${ORIGIN_ENV}=${local}, HOSTNAME=127.0.0.1`);
  const server = await startServer('C', { serverDir, port, origin: local, secret });
  try {
    const P = 'C';
    // A browser that opened the local origin sends that host.
    const browser = { accept: HTML_ACCEPT, host: `localhost:${port}` };
    await exchange(P, 'GET / answers 200', () => send(port, { path: '/', headers: browser }), (r) => ({ problems: statusIs(r, 200) }));
    const target = `${local}/pilot-access?reason=no_session`;
    await exchange(P, `/dashboard without a session, as a browser on ${local}: 303 that lands on exactly ${target}`, () => send(port, { path: '/dashboard', headers: browser }), (r) => {
      const location = values(r, 'location');
      const problems = [...statusIs(r, 303), ...headerIs(r, 'cache-control', 'private, no-store'), ...varyHasCookie(r)];
      const details = [`Location as it arrived: ${show(location)}`];
      if (location.length !== 1) problems.push(`Location ${show(location)}`);
      else if (location[0] !== target) {
        // Relativised by Next: say exactly what arrived and where a browser on the local origin would land.
        const landed = new URL(location[0], `${local}/dashboard`).href;
        details.push(`not the absolute URL; a browser on ${local} resolves it to ${landed}`);
        problems.push(`Location ${JSON.stringify(location[0])} is not exactly ${target}${landed === target ? ' (it lands there all the same)' : ` and lands on ${landed}`}`);
      }
      return { problems, details };
    });
    const signedIn = await exchange(P, `sign-in as a browser on ${local} sends it (Origin ${local}, Sec-Fetch-Site: same-origin): relative 303 to /dashboard with the session cookie`, () => send(port, { method: 'POST', path: '/api/pilot-access', headers: { ...SAME_ORIGIN_FORM, host: `localhost:${port}`, origin: local }, body: `passphrase=${encodeURIComponent(secret)}` }), (r) => ({
      problems: [...statusIs(r, 303), ...headerIs(r, 'location', '/dashboard'), ...cookieProblems(r, { cleared: false })],
      details: [`Set-Cookie: ${values(r, 'set-cookie').map(redactCookie).join(' + ') || 'absent'}`],
    }));
    const session = signedIn === null ? null : sessionToken(signedIn);
    await exchange(P, '/dashboard with that session: 200, the labelled synthetic profile', async () => {
      if (session === null) throw new Error('the local sign-in issued no session cookie');
      return send(port, { path: '/dashboard', headers: { ...browser, cookie: `${COOKIE_NAME}=${session}` } });
    }, (r) => ({ problems: [...statusIs(r, 200), ...(r.body.includes('Synthetic development profile') ? [] : ['the page does not say "Synthetic development profile"'])] }));
    await exchange(P, `sign-in from a browser that opened http://127.0.0.1:${port} instead (Origin http://127.0.0.1:${port}): relative 303 to cross_site, no cookie`, () => send(port, { method: 'POST', path: '/api/pilot-access', headers: { ...SAME_ORIGIN_FORM, origin: `http://127.0.0.1:${port}` }, body: `passphrase=${encodeURIComponent(secret)}` }), (r) => ({
      problems: [...statusIs(r, 303), ...headerIs(r, 'location', '/pilot-access?reason=cross_site'), ...headerAbsent(r, 'set-cookie')],
    }));
  } finally {
    await stopServer(server);
  }
  judgeServerLog('C', server, { 403: 1 });
  await stopServer(server, nextId('C'));
  printServerLog(server);
}

function leakScans() {
  heading('LEAK SCAN — the secret and every session token');
  const P = 'Z';
  const count = (texts, value) => texts.filter((t) => t.includes(value)).length;
  const planted = [`a text carrying ${secret} inside it`];
  check(nextId(P), 'control: the scan finds the secret in a text planted with it', count(planted, secret) === 1 ? [] : ['the scan did not find a planted copy']);
  const responseTexts = responses.map((r) => `${JSON.stringify(r.raw)}\n${r.body}`);
  check(nextId(P), `the secret is in none of the ${responseTexts.length} responses (headers and bodies)`, count(responseTexts, secret) === 0 ? [] : [`found in ${count(responseTexts, secret)} responses`]);
  const logs = started.map((s) => s.log);
  check(nextId(P), `the secret is in none of the ${logs.length} server logs`, count(logs, secret) === 0 ? [] : [`found in ${count(logs, secret)} server logs`]);
  const tokenHits = issuedTokens.reduce((n, t) => n + count(logs, t), 0);
  check(nextId(P), `none of the ${issuedTokens.length} session tokens issued is in a server log`, issuedTokens.length > 0 && tokenHits === 0 ? [] : [issuedTokens.length === 0 ? 'no session was issued, so this scan would be vacuous' : `found ${tokenHits} times`]);
  const output = printed.join('\n');
  const outputHits = count([output], secret) + issuedTokens.reduce((n, t) => n + count([output], t), 0);
  check(nextId(P), 'neither the secret nor any session token is in this run\'s own output', outputHits === 0 ? [] : [`found ${outputHits} times`]);
}

function cleanUp() {
  if (artifact !== undefined) {
    try {
      restoreDirectoryWrite(artifact);
    } catch {
      /* the release below reports what it cannot remove */
    }
  }
  if (isolationDir !== undefined) {
    releaseIsolation(isolationDir, keep);
    isolationDir = undefined;
  }
}

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => {
    console.error(`\nreceived ${signal}: stopping every server this run started`);
    killEverythingNow();
    cleanUp();
    process.exit(signal === 'SIGINT' ? 130 : 143);
  });
}
process.on('exit', killEverythingNow);

let crashed = false;
try {
  heading('PRODUCTION SMOKE CHECK — the standalone artifact, started as the container starts it');
  say(`node ${process.version} · repository ${repoRoot} · not part of npm test (it builds, and the build fetches Google Fonts)`);
  say('No container image is built or run: this starts the standalone server directly, in the image\'s layout.');

  // The build inherits this process's environment (the sentinel scan depends on it); telemetry is turned off for it.
  process.env.NEXT_TELEMETRY_DISABLED = '1';
  heading('BUILD — next build, through the harness');
  const t0 = Date.now();
  const { webDir, standaloneDir } = buildStandalone(repoRoot);
  say(`built in ${Math.round((Date.now() - t0) / 1000)} s`);

  heading('ARTIFACT — isolated outside the repository, read-only except .next/cache');
  ({ isolationDir, artifact } = isolateArtifact({ webDir, standaloneDir, forbiddenRoots: [repoRoot] }));
  const serverDir = join(artifact, 'frontend', 'web');
  const cacheDir = join(serverDir, '.next', 'cache');
  const links = makeReadOnly(artifact, cacheDir);
  say(`artifact: ${artifact}`);
  say(`write bits removed from every file and directory but ${cacheDir}; ${links} symbolic links seen and left alone`);
  for (const [dir, why] of [[serverDir, 'the server\'s working directory'], [join(serverDir, '.next'), 'the build output']]) {
    const probe = probeWrite(dir);
    check(nextId('M'), `a write into ${why} (${dir.slice(artifact.length + 1)}) is refused, as in the image`, probe.written ? ['the write succeeded: the tree is not read-only, so a silent server log below would prove nothing'] : [], probe.written ? [] : [`refused: ${probe.code}`]);
  }
  const cacheProbe = probeWrite(cacheDir);
  check(nextId('M'), 'a write into frontend/web/.next/cache succeeds, as in the image', cacheProbe.written ? [] : [`refused: ${cacheProbe.code}`]);

  secret = randomBytes(24).toString('base64url');

  await hostedStart(serverDir);
  await failClosedStart(serverDir);
  await localStart(serverDir);

  const cacheContents = [];
  walk(cacheDir, (path, stat) => {
    if (stat.isFile()) cacheContents.push(path.slice(cacheDir.length + 1));
  });
  say(`\n.next/cache after the three starts: ${cacheContents.length === 0 ? 'empty' : cacheContents.join(', ')}`);

  leakScans();
} catch (error) {
  crashed = true;
  if (error instanceof StandaloneFailure) {
    console.error(`\n✗ ${error.message}`);
    if (error.detail) console.error(`\n${error.detail}`);
  } else {
    console.error(`\n✗ ${error instanceof Error ? error.stack : String(error)}`);
  }
} finally {
  for (const server of [...live]) await stopServer(server);
  cleanUp();
}

const failed = results.filter((r) => !r.ok);
heading('SUMMARY');
say('servers started by this run:');
for (const s of started) {
  say(`  ${s.name}: pid ${s.pid} on 127.0.0.1:${s.port} — ${alive(s.pid) ? 'STILL RUNNING' : 'stopped'}`);
}
if (started.length === 0) say('  none');
say(`${results.length} checks · ${results.length - failed.length} PASS · ${failed.length} FAIL${crashed ? ' · the run stopped early on an error' : ''}`);
for (const f of failed) say(`  FAIL ${f.id}  ✗ ${f.problems.join('; ')}  (${f.label})`);
say(failed.length === 0 && !crashed ? 'RESULT: PASS' : 'RESULT: FAIL');
process.exit(failed.length === 0 && !crashed ? 0 : 1);
