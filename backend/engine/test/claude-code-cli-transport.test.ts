/**
 * The process transport, exercised against real children.
 *
 * Every case launches a `/bin/sh` script this file writes under a fresh
 * temp directory and never commits. A fake `spawn` would prove that the
 * transport asks for the right thing; only a real child proves that the
 * right thing arrives — the argv the child saw, the environment it saw, the
 * bytes on its stdin, the mode of the prompt file it could read — and that
 * a child which ignores TERM is nevertheless gone afterwards. So the
 * dummies record what they observe, NUL-separated, and the assertions are
 * against literals written here, not imported from the transport: a
 * transport that changed a flag and its own constant together would agree
 * with itself, and this file is the party that does not.
 *
 * Nothing here contacts anything: the dummies print, sleep, exit or ignore
 * a signal. Every child the transport starts is killed in `afterEach` if it
 * is still alive, and the last case of each process-ending kind asserts the
 * child is gone by `kill(pid, 0)`, so a leftover would be a red test, not a
 * stray on the machine.
 *
 * The last blocks take `claude-code-cli@2` through the same dummies: its
 * adapter's request reaches the child as a literal argv beside `@1`'s, a
 * `--settings` text that is not one JSON object launches nothing, the gate
 * reads a 2.1.280-shaped answer under whichever rules it was handed, and a
 * transport holding its profile's `--settings` text launches nothing for a
 * description whose effective settings say otherwise.
 * The adapters and rule sets are imported as subjects; every expectation is
 * a literal here.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createSpawnTransport,
  evaluateGateOutput,
  ExecutablePinMismatchError,
  GATE_FIELD_ALLOWLIST,
  LaunchSettingsMismatchError,
  WrongTransportError,
  type GateResult,
  type LaunchFunction,
  type LaunchRecord,
  type SpawnTransport,
  type SpawnTransportOptions,
} from '../src/pipeline/claude-code-cli-transport';
import { EvidenceObservationFailedError, ProcessTransportError, TransportFailure, type ProcessFacts, type ProviderHttpResponse } from '../src/pipeline/live-runner';
import type { ProviderHttpRequest } from '../src/pipeline/provider-adapter';
import { allowDummyDir } from './setup/process-guard';
import { roleOutputJsonSchema } from '../src/pipeline/anthropic-messages';
import { CLAUDE_CODE_CLI_ADAPTER, CLAUDE_CODE_CLI_GATE_RULES, CLAUDE_CODE_CLI_V2_ADAPTER, CLAUDE_CODE_CLI_V2_GATE_RULES } from '../src/pipeline/claude-code-cli';
import type { RoleRequest } from '../src/pipeline/roles';

// ---------------------------------------------------------------------------
// Literals. These are the contract as this file understands it.
// ---------------------------------------------------------------------------

const INHERITED = { HOME: '/nonexistent/ds-home', USER: 'ds-transport-user', PATH: '/usr/bin:/bin' } as const;
const CONTROLS = { CLAUDE_CODE_MAX_OUTPUT_TOKENS: '16000', DS_LAUNCH_CONTROL: 'literal-control-value' } as const;
/** Every NAME=VALUE the child must see, and nothing else. */
const EXPECTED_ENV_LINES = [
  'CLAUDE_CODE_MAX_OUTPUT_TOKENS=16000',
  'DS_LAUNCH_CONTROL=literal-control-value',
  'HOME=/nonexistent/ds-home',
  'PATH=/usr/bin:/bin',
  'USER=ds-transport-user',
];
/** What the transport must hand `spawn` as `env`: the same five, exactly. */
const EXPECTED_ENV_OBJECT = {
  HOME: '/nonexistent/ds-home',
  USER: 'ds-transport-user',
  PATH: '/usr/bin:/bin',
  CLAUDE_CODE_MAX_OUTPUT_TOKENS: '16000',
  DS_LAUNCH_CONTROL: 'literal-control-value',
};
/**
 * `/bin/sh` exports these to its own children on top of what it inherited;
 * they are the shell's, not the transport's, and are stripped before the
 * env the dummy recorded is compared.
 */
const SHELL_ADDED = new Set(['PWD', 'OLDPWD', 'SHLVL', '_']);

const MODEL = 'claude-opus-5';
const SYSTEM_PROMPT = 'SYSTEM PROMPT TEXT\nline two with é and a tab\t.';
const USER_MESSAGE = 'USER MESSAGE TEXT — with unicode ✓ and\nnewline';
const JSON_SCHEMA = { type: 'object', properties: { sum: { type: 'integer' } }, required: ['sum'], additionalProperties: false };
const JSON_SCHEMA_LITERAL = '{"type":"object","properties":{"sum":{"type":"integer"}},"required":["sum"],"additionalProperties":false}';

/** The complete role argv, with the prompt path as the one variable element. */
function expectedRoleArgv(promptPath: string): string[] {
  return [
    '-p',
    '--model',
    'claude-opus-5',
    '--effort',
    'high',
    '--safe-mode',
    '--tools',
    '',
    '--strict-mcp-config',
    '--setting-sources',
    '',
    '--disable-slash-commands',
    '--no-session-persistence',
    '--settings',
    '{"switchModelsOnFlag":false}',
    '--system-prompt-file',
    promptPath,
    '--json-schema',
    JSON_SCHEMA_LITERAL,
    '--output-format',
    'stream-json',
    '--verbose',
    '--include-partial-messages',
  ];
}

const FIXTURE_STDOUT = '{"type":"system","subtype":"init","model":"claude-opus-5"}\n{"type":"result","text":"caf\\u00e9 \\t tab","raw":"é"}\n';
const FIXTURE_STDERR = 'warn: 12345';

const GATE_OK = {
  loggedIn: true,
  authMethod: 'claude.ai',
  apiProvider: 'firstParty',
  subscriptionType: 'max',
  email: 'someone@example.invalid',
  orgId: 'org_1234567890',
  orgName: 'Example Org',
};

// ---------------------------------------------------------------------------
// Scaffolding: a scratch tree per test, dummies, a recording spawn
// ---------------------------------------------------------------------------

let scratch: string;
let recordDir: string;
let tempRoot: string;
let children: ChildProcess[];
/**
 * Processes a dummy started beside itself — a leftover in its group, or a
 * grandchild that left the group — known by the pid the dummy wrote down.
 * Each case asserts what became of them; this list is the safety net that
 * kills whatever a red case left, so a failing test never strands a `sleep`.
 */
let strays: number[];
let launches: Array<{ file: string; args: string[]; options: Parameters<LaunchFunction>[2] }>;
let records: Array<{ record: LaunchRecord; partialStdout: string }>;

beforeEach(() => {
  // Resolved, because macOS answers `$PWD` with `/private/var/...` for a `/var/...` tmpdir.
  scratch = realpathSync(mkdtempSync(join(tmpdir(), 'ds-cli-transport-test-')));
  // The suite-wide process guard lets only registered dummies launch.
  allowDummyDir(scratch);
  recordDir = join(scratch, 'record');
  tempRoot = join(scratch, 'tmp');
  mkdirSync(recordDir);
  mkdirSync(tempRoot);
  children = [];
  strays = [];
  launches = [];
  records = [];
});

afterEach(async () => {
  // No child outlives its test. Group first, then the pid itself, so a
  // mutant that dropped `detached` still leaves the machine clean.
  for (const child of children) {
    if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) continue;
    for (const target of [-child.pid, child.pid]) {
      try {
        process.kill(target, 'SIGKILL');
      } catch {
        // Already gone.
      }
    }
  }
  for (const pid of strays) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // Already gone, as the case asserted.
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 50));
  // A removal-failure case leaves a 0500 directory behind on purpose.
  for (const entry of readdirSync(tempRoot)) chmodSync(join(tempRoot, entry), 0o700);
  rmSync(scratch, { recursive: true, force: true });
});

/** The recording prologue every dummy starts with; the record dir is a literal in the script. */
function prologue(): string {
  return [
    '#!/bin/sh',
    `R=${JSON.stringify(recordDir)}`,
    ': > "$R/marker"',
    'printf \'%s\\0\' "$@" > "$R/argv.bin"',
    '/usr/bin/perl -e \'print map { "$_=$ENV{$_}\\0" } sort keys %ENV\' > "$R/env.bin"',
    '/usr/bin/stat -f %Lp "$PWD" > "$R/cwd-mode"',
    'printf %s "$PWD" > "$R/cwd"',
    '',
  ].join('\n');
}

/** Writes a dummy and returns its pin (computed here, so the pin check has something true to check). */
function writeDummy(name: string, body: string): { path: string; sha256: string; sizeBytes: number } {
  const path = join(scratch, `${name}.sh`);
  const text = prologue() + body + '\n';
  writeFileSync(path, text, { mode: 0o700 });
  const bytes = readFileSync(path);
  return { path, sha256: createHash('sha256').update(bytes).digest('hex'), sizeBytes: bytes.length };
}

const recordingLaunch: LaunchFunction = (file, args, options) => {
  launches.push({ file, args: [...args], options: { ...options, env: { ...options.env } } });
  const child = spawn(file, args, options);
  children.push(child);
  return child;
};

function transportFor(pin: SpawnTransportOptions['executable'], extra: Partial<SpawnTransportOptions> = {}): SpawnTransport {
  return createSpawnTransport({
    executable: pin,
    inheritedEnv: { ...INHERITED },
    controls: { ...CONTROLS },
    launch: recordingLaunch,
    onLaunch: (record, partialStdout) => records.push({ record, partialStdout }),
    tempRoot,
    termGraceMs: 300,
    killGraceMs: 300,
    ...extra,
  });
}

function roleRequest(overrides: Record<string, unknown> = {}): ProviderHttpRequest {
  return {
    url: 'claude-code-cli:pinned',
    method: 'SPAWN',
    headers: {},
    body: JSON.stringify({ model: MODEL, systemPrompt: SYSTEM_PROMPT, userMessage: USER_MESSAGE, jsonSchema: JSON_SCHEMA, effort: 'high', role: 'reader', index: 0, ...overrides }),
  };
}

function recorded(name: string): string {
  return readFileSync(join(recordDir, name), 'utf8');
}

function nulSeparated(name: string): string[] {
  const parts = recorded(name).split('\0');
  if (parts.at(-1) === '') parts.pop();
  return parts;
}

function envSeenByChild(): string[] {
  return nulSeparated('env.bin').filter((line) => !SHELL_ADDED.has(line.slice(0, line.indexOf('=')))).sort();
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function groupAlive(pid: number): boolean {
  return alive(-pid);
}

async function settleWith<T extends Error>(promise: Promise<unknown>, cls: new (...args: never[]) => T): Promise<T> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(cls);
    return error as T;
  }
  throw new Error(`expected the launch to reject with ${cls.name}, but it resolved`);
}

/**
 * Waits until the dummy has written `ready` — after its prologue and after
 * whatever it prints or traps before stalling. A fixed delay raced the perl
 * in the prologue on a cold start and ended the shell before it had reached
 * `trap` or `printf`, so the cases below wait for the child's own word.
 */
async function awaitReady(): Promise<void> {
  const deadline = Date.now() + 5000;
  while (!existsSync(join(recordDir, 'ready'))) {
    if (Date.now() > deadline) throw new Error('dummy never wrote ready');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/** A signal that aborts once the dummy is ready (and a little after, so any output has been read). */
function abortWhenReady(reason = 'timeout'): AbortSignal {
  const controller = new AbortController();
  void awaitReady().then(() => setTimeout(() => controller.abort(reason), 50));
  return controller.signal;
}

const never = (): AbortSignal => new AbortController().signal;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Polls until `condition` holds, or fails by name. */
async function waitUntil(condition: () => boolean, what: string, deadlineMs = 5000): Promise<void> {
  const deadline = Date.now() + deadlineMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`gave up waiting for ${what}`);
    await sleep(10);
  }
}

/** A launch that has not settled by the time a case stops waiting for it. */
const PENDING = 'still pending when the case stopped waiting' as const;

/**
 * The launch's value or error, or `PENDING` after `ms`. A case that must
 * prove the transport does *not* hang waits this way, so a regression is a
 * red assertion naming what was still pending, never a vitest timeout.
 */
function settledWithin(launch: Promise<ProviderHttpResponse | GateResult>, ms: number): Promise<ProviderHttpResponse | GateResult | Error | typeof PENDING> {
  return Promise.race([
    launch.then(
      (value) => value,
      (error: unknown) => (error instanceof Error ? error : new Error(String(error))),
    ),
    sleep(ms).then(() => PENDING),
  ]);
}

/** The pid a dummy wrote to `<name>` in the record dir, remembered for cleanup. */
async function strayPid(name: string): Promise<number> {
  await waitUntil(() => existsSync(join(recordDir, name)), `${name} to be written`);
  const pid = Number(recorded(name).trim());
  if (!Number.isInteger(pid) || pid <= 1) throw new Error(`${name} does not hold a pid: ${JSON.stringify(recorded(name))}`);
  strays.push(pid);
  return pid;
}

/**
 * A grandchild that leaves the child's process group by `setsid` and keeps
 * the inherited stdout: the one holder of the pipes that `-pid` cannot
 * reach. macOS has no `setsid` binary, so perl makes the call, and writes
 * its pid to `grandchild.pid` only once it has made it, so the shell can
 * wait for that before exiting — otherwise the child exits while perl is
 * still starting inside the group, and the transport rightly finds a
 * leftover instead. The grandchild is the `sleep 600` a case must show gone.
 */
const ORPHAN_WRITER = [
  `/usr/bin/perl -e 'use POSIX; POSIX::setsid(); open(my $f, ">", "$ARGV[0]/grandchild.pid"); print $f $$; close $f; sleep 600' "$R" &`,
  'while [ ! -s "$R/grandchild.pid" ]; do /bin/sleep 0.01; done',
].join('\n');
/** A leftover in the child's own group, holding the inherited stdout; its pid goes to `leftover.pid`. */
const LEFTOVER_IN_GROUP = '/bin/sleep 600 &\necho $! > "$R/leftover.pid"';

// ---------------------------------------------------------------------------
// Role launches
// ---------------------------------------------------------------------------

describe('a role launch that answers', () => {
  it('reaches the child with exactly the argv, env, cwd, stdin and prompt file the contract states, and reports honestly', async () => {
    const fixture = join(scratch, 'fixture.jsonl');
    writeFileSync(fixture, FIXTURE_STDOUT);
    const pin = writeDummy(
      'answer',
      [
        'cat > "$R/stdin.bin"',
        '/usr/bin/stat -f %Lp "$PWD/system-prompt.txt" > "$R/prompt-mode"',
        'cp "$PWD/system-prompt.txt" "$R/prompt.copy"',
        `printf %s ${JSON.stringify(FIXTURE_STDERR)} >&2`,
        `cat ${JSON.stringify(fixture)}`,
      ].join('\n'),
    );
    const transport = transportFor(pin);

    const response = await transport(roleRequest(), never());

    // What spawn was asked.
    expect(launches).toHaveLength(1);
    const [launch] = launches;
    expect(launch!.file).toBe(pin.path);
    expect(launch!.options.shell).toBe(false);
    expect(launch!.options.detached).toBe(true);
    expect(launch!.options.env).toEqual(EXPECTED_ENV_OBJECT);
    expect(launch!.options.cwd.startsWith(tempRoot + '/ds-cli-')).toBe(true);

    // What the child saw: the complete argv, with the prompt path where it belongs.
    const argv = nulSeparated('argv.bin');
    const promptPath = argv[16]!;
    expect(promptPath).toBe(join(launch!.options.cwd, 'system-prompt.txt'));
    expect(argv).toEqual(expectedRoleArgv(promptPath));
    expect(launch!.args).toEqual(expectedRoleArgv(promptPath));
    expect(envSeenByChild()).toEqual(EXPECTED_ENV_LINES);
    expect(recorded('cwd')).toBe(launch!.options.cwd);
    expect(recorded('cwd-mode').trim()).toBe('700');
    expect(recorded('prompt-mode').trim()).toBe('600');
    expect(recorded('prompt.copy')).toBe(SYSTEM_PROMPT);
    expect(recorded('stdin.bin')).toBe(USER_MESSAGE);

    // What came back.
    expect(response.status).toBe(0);
    expect(response.headers).toEqual({});
    expect(JSON.parse(response.body)).toEqual({ exitCode: 0, signal: null, stdout: FIXTURE_STDOUT, stderrBytes: Buffer.byteLength(FIXTURE_STDERR) });
    const facts = response.process!;
    expect(facts.started).toBe(true);
    expect(facts.pid).toBe(children[0]!.pid);
    expect(facts.exitCode).toBe(0);
    expect(facts.signal).toBeNull();
    expect(facts.termination).toBeNull();
    expect(facts.stdoutBytes).toBe(Buffer.byteLength(FIXTURE_STDOUT));
    expect(facts.stderrBytes).toBe(Buffer.byteLength(FIXTURE_STDERR));
    expect(facts.promptFileBytes).toBe(Buffer.byteLength(SYSTEM_PROMPT));
    expect(facts.stdinBytes).toBe(Buffer.byteLength(USER_MESSAGE));
    expect(facts.promptFileRemoved).toBe(true);
    expect(facts.promptFileRemovalError).toBeNull();
    expect(facts.durationMs).toBeGreaterThanOrEqual(0);

    // The evidence on disk is gone, and the record says so without saying where it was.
    expect(existsSync(promptPath)).toBe(false);
    expect(existsSync(launch!.options.cwd)).toBe(false);
    expect(readdirSync(tempRoot)).toEqual([]);
    expect(records).toHaveLength(1);
    const { record, partialStdout } = records[0]!;
    expect(partialStdout).toBe(FIXTURE_STDOUT);
    expect(record.kind).toBe('role');
    expect(record.role).toBe('reader');
    expect(record.index).toBe(0);
    expect(record.argv).toEqual(expectedRoleArgv('<system-prompt-file>'));
    expect(record.envNames).toEqual(['CLAUDE_CODE_MAX_OUTPUT_TOKENS', 'DS_LAUNCH_CONTROL', 'HOME', 'PATH', 'USER']);
    expect(record.exitCode).toBe(0);
    expect(record.promptFileRemoved).toBe(true);
    // Positive control for the give-up cases below: a child whose pipes closed is recorded as such.
    expect(record.streamsClosed).toBe(true);
    expect(JSON.stringify(record)).not.toContain('ds-cli-');
    expect(JSON.stringify(record)).not.toContain(tempRoot);
    expect(transport.activeChildren()).toBe(0);
    expect(alive(facts.pid!)).toBe(false);
  });

  it('returns a non-zero exit as an envelope for the adapter to refuse, not as a transport error', async () => {
    const pin = writeDummy('exit-one', 'printf %s "not an answer"\nexit 1');
    const response = await transportFor(pin)(roleRequest(), never());
    expect(JSON.parse(response.body)).toEqual({ exitCode: 1, signal: null, stdout: 'not an answer', stderrBytes: 0 });
    expect(response.process!.exitCode).toBe(1);
    expect(response.process!.termination).toBeNull();
    expect(response.process!.promptFileRemoved).toBe(true);
  });

  it('a launch description that is not the adapter shape is refused before the pin, with started: false', async () => {
    const pin = writeDummy('unused', 'exit 0');
    const transport = transportFor({ ...pin, sha256: 'f'.repeat(64) });
    const request = roleRequest();
    const error = await settleWith(transport({ ...request, body: JSON.stringify({ model: MODEL }) }, never()), Error);
    expect(error.name).toBe('LaunchSpecError');
    expect((error as { process?: ProcessFacts }).process?.started).toBe(false);
    expect(launches).toHaveLength(0);
  });
});

describe('a role launch that is ended', () => {
  it('a child holding its pipes is ended on abort: TERM observed, reaped, group gone, partial stdout reported, error carries the facts', async () => {
    const pin = writeDummy('stalled', 'printf %s "partial-out"\n: > "$R/ready"\n/bin/sleep 600');
    const transport = transportFor(pin);
    const startedAt = Date.now();

    const error = await settleWith(transport(roleRequest(), abortWhenReady()), ProcessTransportError);

    expect(error.message).toContain('aborted while the child was running (timeout)');
    expect(error.process.started).toBe(true);
    expect(error.process.exitCode).toBeNull();
    expect(error.process.signal).toBe('SIGTERM');
    expect(error.process.termination).toEqual({ forced: true, processGroupMade: true, signalsSent: ['SIGTERM'], childReaped: true, groupGone: true });
    expect(error.process.durationMs).toBeGreaterThan(0);
    expect(error.process.durationMs).toBeLessThan(Date.now() - startedAt + 1);
    expect(error.process.promptFileRemoved).toBe(true);
    expect(records).toHaveLength(1);
    expect(records[0]!.partialStdout).toBe('partial-out');
    expect(records[0]!.record.termination?.signalsSent).toEqual(['SIGTERM']);
    expect(records[0]!.record.streamsClosed).toBe(true);
    expect(JSON.stringify(records[0]!.record)).not.toContain('ds-cli-');
    expect(error.message).not.toContain('ds-cli-');
    expect(transport.activeChildren()).toBe(0);
    expect(alive(error.process.pid!)).toBe(false);
    expect(groupAlive(error.process.pid!)).toBe(false);
    expect(readdirSync(tempRoot)).toEqual([]);
  });

  it('a child that closed its streams but is still running is not taken for finished', async () => {
    const pin = writeDummy('streams-closed', 'printf %s "before-close"\nexec >&- 2>&-\n: > "$R/ready"\n/bin/sleep 600');
    const transport = transportFor(pin);
    const controller = new AbortController();
    let settled = false;
    const launch = transport(roleRequest(), controller.signal).finally(() => {
      settled = true;
    });
    // The streams are closed once the dummy says ready; the launch must still be pending well after.
    await awaitReady();
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(settled).toBe(false);
    expect(transport.activeChildren()).toBe(1);
    controller.abort('cancelled');
    const error = await settleWith(launch, ProcessTransportError);
    expect(error.process.termination?.childReaped).toBe(true);
    expect(error.process.termination?.signalsSent).toEqual(['SIGTERM']);
    expect(records[0]!.partialStdout).toBe('before-close');
    expect(alive(error.process.pid!)).toBe(false);
  });

  it('a child that ignores TERM is KILLed after the grace, and the facts show both signals were sent and both observations made', async () => {
    const pin = writeDummy('term-ignoring', 'trap "" TERM\n: > "$R/ready"\nwhile :; do /bin/sleep 1; done');
    const transport = transportFor(pin);

    const error = await settleWith(transport(roleRequest(), abortWhenReady()), ProcessTransportError);

    expect(error.process.termination).toEqual({ forced: true, processGroupMade: true, signalsSent: ['SIGTERM', 'SIGKILL'], childReaped: true, groupGone: true });
    expect(error.process.signal).toBe('SIGKILL');
    // KILL is sent only after the TERM grace, so the launch lasted at least that long.
    expect(error.process.durationMs).toBeGreaterThanOrEqual(300);
    expect(alive(error.process.pid!)).toBe(false);
    expect(groupAlive(error.process.pid!)).toBe(false);
    expect(transport.activeChildren()).toBe(0);
  });

  it('output past the bound ends the child and fails under output_too_large, keeping what was read', async () => {
    const pin = writeDummy('flood', 'dd if=/dev/zero bs=1024 count=200 2>/dev/null | tr "\\0" a\n/bin/sleep 600');
    const transport = transportFor(pin, { maxOutputBytes: 4096 });

    const error = await settleWith(transport(roleRequest(), never()), ProcessTransportError);

    expect(error.message).toContain('output_too_large');
    expect(error.process.stdoutBytes).toBeGreaterThan(4096);
    expect(error.process.termination?.signalsSent).toContain('SIGTERM');
    expect(error.process.termination?.childReaped).toBe(true);
    expect(records).toHaveLength(1);
    expect(Buffer.byteLength(records[0]!.partialStdout)).toBeLessThanOrEqual(4096);
    expect(records[0]!.partialStdout.length).toBeGreaterThan(0);
    expect(alive(error.process.pid!)).toBe(false);
  });
});

describe('cancellation that arrives while the child is starting', () => {
  /**
   * The two places an abort could once fall through: synchronously inside
   * `launch`, before a ChildProcess exists to the transport, and on the
   * child's own 'spawn' event — in both, the child is real, so the abort
   * must end it and be the reason the launch gives.
   */
  const arrivals: Array<[string, (child: ChildProcess, abort: () => void) => void]> = [
    ['synchronously inside launch, before the ChildProcess is returned', (_child, abort) => abort()],
    ["on the child's own spawn event", (child, abort) => child.once('spawn', abort)],
  ];

  it.each(arrivals)('an abort %s ends the child and rejects with the facts', async (label, arrange) => {
    const pin = writeDummy('stalled', ': > "$R/ready"\n/bin/sleep 600');
    const controller = new AbortController();
    const transport = transportFor(pin, {
      launch: (file, args, options) => {
        const child = recordingLaunch(file, args, options);
        arrange(child, () => controller.abort(label));
        return child;
      },
    });

    // Bounded by the case, so a lost abort is a red assertion naming the
    // pending launch rather than a five-second vitest timeout.
    const outcome = await settledWithin(transport(roleRequest(), controller.signal), 2000);

    expect(outcome).toBeInstanceOf(ProcessTransportError);
    const error = outcome as ProcessTransportError;
    expect(error.message).toBe(`aborted while the child was running (${label})`);
    expect(error.process.started).toBe(true);
    expect(error.process.pid).toBe(children[0]!.pid);
    expect(error.process.termination).toEqual({ forced: true, processGroupMade: true, signalsSent: ['SIGTERM'], childReaped: true, groupGone: true });
    expect(error.process.promptFileRemoved).toBe(true);
    expect(records).toHaveLength(1);
    expect(records[0]!.record.termination?.signalsSent).toEqual(['SIGTERM']);
    expect(alive(error.process.pid!)).toBe(false);
    expect(groupAlive(error.process.pid!)).toBe(false);
    expect(transport.activeChildren()).toBe(0);
    expect(readdirSync(tempRoot)).toEqual([]);
  });
});

describe('the wait for the pipes', () => {
  it('a role launch whose grandchild left the group but kept stdout is refused, not answered: the wait is bounded, the error names streams_not_closed, the record says streamsClosed: false, the group is gone', async () => {
    const pin = writeDummy('orphan-writer', `${ORPHAN_WRITER}\nprintf %s "answer-despite-orphan"\nexit 0`);
    const transport = transportFor(pin);
    const startedAt = Date.now();

    const outcome = await settledWithin(transport(roleRequest(), never()), 2000);
    const elapsedMs = Date.now() - startedAt;
    const grandchild = await strayPid('grandchild.pid');

    // Gave up only after the TERM grace (300 ms), and well inside the case's own bound.
    expect(elapsedMs).toBeLessThan(2000);
    expect(elapsedMs).toBeGreaterThanOrEqual(300);
    expect(outcome).not.toBe(PENDING);
    // Not an envelope: a launch given up on with its pipes still held did not
    // finish the way an answer would claim, so it is thrown here — the runner
    // books it, and nothing projects it. The answering case above, whose
    // pipes closed, resolves with `streamsClosed: true`: the control.
    expect(outcome, 'expected the launch to reject with ProcessTransportError naming streams_not_closed').toBeInstanceOf(ProcessTransportError);
    const error = outcome as ProcessTransportError;
    expect(error.message).toContain('streams_not_closed');
    expect(error.message).toContain('exit code 0');
    expect(error.message).toContain('300 ms');
    const facts = error.process;
    expect(facts.started).toBe(true);
    expect(facts.exitCode).toBe(0);
    expect(facts.signal).toBeNull();
    // A natural exit whose own group was observed gone: nothing was sent, nothing forced.
    expect(facts.termination).toBeNull();
    expect(facts.promptFileRemoved).toBe(true);
    expect(groupAlive(facts.pid!)).toBe(false);
    // The harness saw the launch, output included, before the refusal.
    expect(records).toHaveLength(1);
    expect(records[0]!.record.kind).toBe('role');
    expect(records[0]!.record.streamsClosed).toBe(false);
    expect(records[0]!.record.exitCode).toBe(0);
    expect(records[0]!.record.termination).toBeNull();
    expect(records[0]!.partialStdout).toBe('answer-despite-orphan');
    expect(transport.activeChildren()).toBe(0);
    expect(readdirSync(tempRoot)).toEqual([]);
    // The holder of the pipes is real, and outside the group: the transport
    // could not have ended it, and says so rather than claiming the pipes closed.
    expect(alive(grandchild)).toBe(true);

    // The case ends what the transport could not reach, and proves it gone.
    process.kill(grandchild, 'SIGKILL');
    await waitUntil(() => !alive(grandchild), 'the grandchild to be gone');
    expect(alive(grandchild)).toBe(false);
  });

  it('a gate whose grandchild left the group but kept stdout blocks with streams_not_closed, facts kept, rather than passing or throwing', async () => {
    const pin = writeDummy('gate-orphan-writer', `${ORPHAN_WRITER}\nprintf %s ${JSON.stringify(JSON.stringify(GATE_OK))}\nexit 0`);
    const transport = transportFor(pin);

    const outcome = await settledWithin(transport.runGate(never()), 2000);
    const grandchild = await strayPid('grandchild.pid');

    expect(outcome).not.toBe(PENDING);
    expect(outcome).not.toBeInstanceOf(Error);
    const result = outcome as GateResult;
    // The answer itself was the good one, and the process outcome was clean:
    // the unclosed pipes alone are what blocked. The clean gate case under
    // `runGate` passes the same answer with `streamsClosed: true`: the control.
    expect(result.pass).toBe(false);
    expect(result.reasons).toEqual(['streams_not_closed']);
    expect(result.fields).toEqual(expect.objectContaining({ loggedIn: 'true', subscriptionType: '"max"', email: 'PRESENT' }));
    expect(result.process.started).toBe(true);
    expect(result.process.exitCode).toBe(0);
    expect(result.process.termination).toBeNull();
    expect(records).toHaveLength(1);
    expect(records[0]!.record.kind).toBe('gate');
    expect(records[0]!.record.streamsClosed).toBe(false);
    expect(records[0]!.record.exitCode).toBe(0);
    expect(groupAlive(result.process.pid!)).toBe(false);
    expect(transport.activeChildren()).toBe(0);
    expect(alive(grandchild)).toBe(true);

    process.kill(grandchild, 'SIGKILL');
    await waitUntil(() => !alive(grandchild), 'the grandchild to be gone');
    expect(alive(grandchild)).toBe(false);
  });

  it('an abort during the wait for the pipes is still a cancellation: rejected at once, not after the grace', async () => {
    const pin = writeDummy('orphan-writer-ready', `${ORPHAN_WRITER}\n: > "$R/ready"\nexit 0`);
    const transport = transportFor(pin, { termGraceMs: 5000 });
    const controller = new AbortController();
    const startedAt = Date.now();
    const launch = transport(roleRequest(), controller.signal);
    // Observed below through `settledWithin`; this branch only keeps an early rejection from being reported as unhandled.
    launch.catch(() => {});
    // The child has exited by now, and the transport is waiting on pipes the grandchild holds.
    await awaitReady();
    await sleep(150);
    controller.abort('cancelled');

    const outcome = await settledWithin(launch, 2000);
    const elapsedMs = Date.now() - startedAt;
    const grandchild = await strayPid('grandchild.pid');

    expect(elapsedMs).toBeLessThan(2000);
    expect(outcome).toBeInstanceOf(ProcessTransportError);
    const error = outcome as ProcessTransportError;
    expect(error.message).toBe('aborted while the child was running (cancelled)');
    expect(error.process.exitCode).toBe(0);
    expect(records).toHaveLength(1);
    expect(records[0]!.record.streamsClosed).toBe(false);
    expect(transport.activeChildren()).toBe(0);
    expect(alive(grandchild)).toBe(true);

    process.kill(grandchild, 'SIGKILL');
    await waitUntil(() => !alive(grandchild), 'the grandchild to be gone');
  });
});

describe('a leftover after a natural exit', () => {
  it('a role launch whose child leaves a process in its group is refused, not answered: the leftover is ended, every fact and the output kept, and the error names leftover_processes_terminated', async () => {
    const pin = writeDummy('leaves-one-behind', `${LEFTOVER_IN_GROUP}\nprintf %s "answer-with-leftover"\nexit 0`);
    const transport = transportFor(pin);

    const error = await settleWith(transport(roleRequest(), never()), ProcessTransportError);
    const leftover = await strayPid('leftover.pid');

    expect(error.message).toContain('leftover_processes_terminated');
    expect(error.message).toContain('signals [SIGTERM]');
    expect(error.process.started).toBe(true);
    expect(error.process.exitCode).toBe(0);
    expect(error.process.signal).toBeNull();
    expect(error.process.termination).toEqual({ forced: true, processGroupMade: true, signalsSent: ['SIGTERM'], childReaped: true, groupGone: true });
    expect(error.process.promptFileRemoved).toBe(true);
    // The harness saw the launch, output included, before the refusal.
    expect(records).toHaveLength(1);
    expect(records[0]!.record.kind).toBe('role');
    expect(records[0]!.partialStdout).toBe('answer-with-leftover');
    expect(records[0]!.record.termination?.signalsSent).toEqual(['SIGTERM']);
    // The leftover held stdout; once it was ended the pipes closed on their own.
    expect(records[0]!.record.streamsClosed).toBe(true);
    expect(alive(leftover)).toBe(false);
    expect(groupAlive(error.process.pid!)).toBe(false);
    expect(transport.activeChildren()).toBe(0);
    expect(readdirSync(tempRoot)).toEqual([]);
  });

  it('a gate whose child leaves a process behind blocks with leftover_processes_after_exit, facts kept, rather than throwing', async () => {
    const pin = writeDummy('gate-leaves-one-behind', `${LEFTOVER_IN_GROUP}\nprintf %s ${JSON.stringify(JSON.stringify(GATE_OK))}\nexit 0`);
    const transport = transportFor(pin);

    const result = await transport.runGate(never());
    const leftover = await strayPid('leftover.pid');

    expect(result.pass).toBe(false);
    expect(result.reasons).toEqual(['process outcome not clean (exit 0, signal null, termination signals [SIGTERM])', 'leftover_processes_after_exit']);
    // The answer itself was the good one: the leftover alone is what blocked.
    expect(result.fields).toEqual(expect.objectContaining({ loggedIn: 'true', subscriptionType: '"max"', email: 'PRESENT' }));
    expect(result.process.exitCode).toBe(0);
    expect(result.process.termination).toEqual({ forced: true, processGroupMade: true, signalsSent: ['SIGTERM'], childReaped: true, groupGone: true });
    expect(records).toHaveLength(1);
    expect(records[0]!.record.kind).toBe('gate');
    expect(records[0]!.record.streamsClosed).toBe(true);
    expect(alive(leftover)).toBe(false);
    expect(groupAlive(result.process.pid!)).toBe(false);
    expect(transport.activeChildren()).toBe(0);
  });
});

describe('the prompt file', () => {
  it('a removal failure is recorded as false with the error code, and the answer is unaffected', async () => {
    const pin = writeDummy('lock-dir', 'chmod 500 "$PWD"\nprintf %s "answer-despite-lock"');
    const response = await transportFor(pin)(roleRequest(), never());

    expect(JSON.parse(response.body).stdout).toBe('answer-despite-lock');
    expect(response.process!.exitCode).toBe(0);
    expect(response.process!.promptFileRemoved).toBe(false);
    expect(response.process!.promptFileRemovalError).toMatch(/^unlink: (EACCES|EPERM); rmdir: /);
    const [dir] = readdirSync(tempRoot);
    expect(dir).toMatch(/^ds-cli-/);
    expect(existsSync(join(tempRoot, dir!, 'system-prompt.txt'))).toBe(true);
    expect(records[0]!.record.promptFileRemoved).toBe(false);
    // Positive control for the success case's `true`: the same field, from the same seam, can be false.
    chmodSync(join(tempRoot, dir!), 0o700);
    expect(statSync(join(tempRoot, dir!, 'system-prompt.txt')).mode & 0o777).toBe(0o600);
  });
});

describe('refusals before any launch', () => {
  it('a request for another transport is refused by url, with started: false and nothing spawned', async () => {
    const pin = writeDummy('unused', 'exit 0');
    const transport = transportFor(pin);
    const error = await settleWith(transport({ ...roleRequest(), url: 'https://api.example.invalid/v1/messages' }, never()), WrongTransportError);
    expect(error.url).toBe('https://api.example.invalid/v1/messages');
    expect(error.process.started).toBe(false);
    expect(launches).toHaveLength(0);
    expect(existsSync(join(recordDir, 'marker'))).toBe(false);
    expect(readdirSync(tempRoot)).toEqual([]);
  });

  it('a pin mismatch on sha256 is a before_send transport failure with started: false; the dummy never ran', async () => {
    const pin = writeDummy('pinned', 'exit 0');
    const transport = transportFor({ ...pin, sha256: '0'.repeat(64) });
    const error = await settleWith(transport(roleRequest(), never()), ExecutablePinMismatchError);
    expect(error).toBeInstanceOf(TransportFailure);
    expect(error.phase).toBe('before_send');
    expect(error.message).toContain('sha256');
    expect(error.process.started).toBe(false);
    expect(launches).toHaveLength(0);
    expect(existsSync(join(recordDir, 'marker'))).toBe(false);
    expect(readdirSync(tempRoot)).toEqual([]);
  });

  it('a pin mismatch on size is refused the same way, naming the size', async () => {
    const pin = writeDummy('pinned', 'exit 0');
    const error = await settleWith(transportFor({ ...pin, sizeBytes: pin.sizeBytes + 1 })(roleRequest(), never()), ExecutablePinMismatchError);
    expect(error.message).toContain(`size ${pin.sizeBytes} bytes, pinned ${pin.sizeBytes + 1}`);
    expect(existsSync(join(recordDir, 'marker'))).toBe(false);
  });

  it('the pin is checked before every launch, not once: the gate is refused too', async () => {
    const pin = writeDummy('pinned', 'exit 0');
    const transport = transportFor({ ...pin, sha256: '0'.repeat(64) });
    await settleWith(transport.runGate(never()), ExecutablePinMismatchError);
    expect(launches).toHaveLength(0);
  });
});

describe('evidence observation', () => {
  it('an onLaunch that throws makes EvidenceObservationFailedError the primary error, facts attached, called exactly once, disk cleaned', async () => {
    const pin = writeDummy('observed', 'printf %s "answer"');
    let calls = 0;
    const transport = transportFor(pin, {
      onLaunch: () => {
        calls += 1;
        throw new Error('launches.jsonl is not writable');
      },
    });

    const error = await settleWith(transport(roleRequest(), never()), EvidenceObservationFailedError);

    expect(error.name).toBe('EvidenceObservationFailedError');
    expect(error.message).toContain('launches.jsonl is not writable');
    expect(error.process?.started).toBe(true);
    expect(error.process?.exitCode).toBe(0);
    expect(error.process?.promptFileRemoved).toBe(true);
    expect(calls).toBe(1);
    expect(readdirSync(tempRoot)).toEqual([]);
    expect(transport.activeChildren()).toBe(0);
  });

  it('an onLaunch that throws an EvidenceObservationFailedError subclass has it rethrown as the same instance, its name kept, the facts attached only where it carried none', async () => {
    class WithheldByHarness extends EvidenceObservationFailedError {
      constructor(detail: string, facts?: ProcessFacts) {
        super(detail, facts);
        this.name = 'WithheldByHarness';
      }
    }
    const pin = writeDummy('observed', 'printf %s "answer"');
    // First launch: the subclass carries no facts; the transport attaches the
    // launch's own. Second: it carries facts of its own, which stay.
    const own: ProcessFacts = { started: false, pid: null, exitCode: null, signal: null, durationMs: 0, stdoutBytes: 0, stderrBytes: 0, promptFileBytes: null, stdinBytes: null, promptFileRemoved: null, promptFileRemovalError: null, termination: null };
    const thrown: WithheldByHarness[] = [];
    const transport = transportFor(pin, {
      onLaunch: () => {
        const error = thrown.length === 0 ? new WithheldByHarness('withheld: launch 1 model output at result contains an email pattern') : new WithheldByHarness('withheld again', own);
        thrown.push(error);
        throw error;
      },
    });

    const first = await settleWith(transport(roleRequest(), never()), EvidenceObservationFailedError);
    expect(first).toBe(thrown[0]);
    expect(first.name).toBe('WithheldByHarness');
    expect(first.message).toBe('withheld: launch 1 model output at result contains an email pattern');
    expect(first.process?.started).toBe(true);
    expect(first.process?.exitCode).toBe(0);
    expect(first.process?.promptFileRemoved).toBe(true);

    const second = await settleWith(transport(roleRequest(), never()), EvidenceObservationFailedError);
    expect(second).toBe(thrown[1]);
    expect(second.process).toBe(own);
    expect(second.process?.started).toBe(false);
    // Positive control, same seam: a plain Error is still wrapped under the transport's name.
    const wrapped = await settleWith(transportFor(pin, { onLaunch: () => { throw new Error('plain'); } })(roleRequest(), never()), EvidenceObservationFailedError);
    expect(wrapped.name).toBe('EvidenceObservationFailedError');
    expect(wrapped.message).toContain('Error: plain');
    expect(readdirSync(tempRoot)).toEqual([]);
    expect(transport.activeChildren()).toBe(0);
  });

  it('an onLaunch that throws on an ended launch is still the primary error, not the termination', async () => {
    const pin = writeDummy('stalled', ': > "$R/ready"\n/bin/sleep 600');
    const transport = transportFor(pin, {
      onLaunch: () => {
        throw new Error('refused');
      },
    });
    const error = await settleWith(transport(roleRequest(), abortWhenReady()), EvidenceObservationFailedError);
    expect(error.process?.termination?.signalsSent).toEqual(['SIGTERM']);
    expect(alive(error.process!.pid!)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The gate
// ---------------------------------------------------------------------------

describe('runGate', () => {
  it('passes a clean, first-party, max, claude.ai answer; reports labels, never the identifiers', async () => {
    const pin = writeDummy('gate-ok', `printf %s ${JSON.stringify(JSON.stringify(GATE_OK))}`);
    const transport = transportFor(pin);

    const result = await transport.runGate(never());

    expect(nulSeparated('argv.bin')).toEqual(['auth', 'status', '--json']);
    expect(envSeenByChild()).toEqual(EXPECTED_ENV_LINES);
    expect(launches[0]!.options.detached).toBe(true);
    expect(launches[0]!.options.shell).toBe(false);
    expect(result.pass).toBe(true);
    expect(result.reasons).toEqual([]);
    expect(result.fields).toEqual({
      loggedIn: 'true',
      authMethod: '"claude.ai"',
      apiProvider: '"firstParty"',
      apiKeySource: 'ABSENT',
      forcedLoginMethod: 'ABSENT',
      subscriptionType: '"max"',
      email: 'PRESENT',
      orgId: 'PRESENT',
      orgName: 'PRESENT',
    });
    const serialised = JSON.stringify(result);
    expect(serialised).not.toContain('example.invalid');
    expect(serialised).not.toContain('org_1234567890');
    expect(serialised).not.toContain('Example Org');
    expect(result.process.started).toBe(true);
    expect(result.process.exitCode).toBe(0);
    expect(result.process.termination).toBeNull();
    expect(result.process.stdinBytes).toBe(0);
    expect(result.process.promptFileBytes).toBeNull();
    expect(result.process.promptFileRemoved).toBeNull();
    expect(result.process.promptFileRemovalError).toBeNull();
    expect(records).toHaveLength(1);
    expect(records[0]!.record.kind).toBe('gate');
    expect(records[0]!.record.role).toBeNull();
    expect(records[0]!.record.argv).toEqual(['auth', 'status', '--json']);
    // Positive control for the unclosed-pipes gate case: a gate whose pipes closed says so, and passes.
    expect(records[0]!.record.streamsClosed).toBe(true);
    expect(readdirSync(tempRoot)).toEqual([]);
  });

  it('a gate whose child exits 1 with an auth failure fails on both the process outcome and the fields', async () => {
    const pin = writeDummy('gate-failed', `printf %s ${JSON.stringify(JSON.stringify({ loggedIn: false, authMethod: 'none', apiProvider: 'firstParty', subscriptionType: null }))}\nexit 1`);
    const result = await transportFor(pin).runGate(never());
    expect(result.pass).toBe(false);
    expect(result.reasons).toEqual([
      'process outcome not clean (exit 1, signal null, no termination)',
      'loggedIn is false, required true',
      'authMethod is "none", required "claude.ai"',
      'subscriptionType is null, required "max"',
    ]);
    expect(result.fields['subscriptionType']).toBe('null');
    expect(result.fields['email']).toBe('ABSENT');
  });

  it('an aborted gate is a ProcessTransportError like any ended launch', async () => {
    const pin = writeDummy('gate-stalled', ': > "$R/ready"\n/bin/sleep 600');
    const error = await settleWith(transportFor(pin).runGate(abortWhenReady()), ProcessTransportError);
    expect(error.process.termination?.signalsSent).toEqual(['SIGTERM']);
    expect(alive(error.process.pid!)).toBe(false);
  });

  describe('presence rules, each alone through the pure verdict', () => {
    const clean: ProcessFacts = {
      started: true,
      pid: 1,
      exitCode: 0,
      signal: null,
      durationMs: 1,
      stdoutBytes: 1,
      stderrBytes: 0,
      promptFileBytes: null,
      stdinBytes: 0,
      promptFileRemoved: null,
      promptFileRemovalError: null,
      termination: null,
    };
    const verdict = (answer: Record<string, unknown>, facts: ProcessFacts = clean): Omit<GateResult, 'process'> => evaluateGateOutput(JSON.stringify(answer) + '\n', facts);

    it('the good answer passes with no reasons (the control for every case below)', () => {
      expect(verdict(GATE_OK)).toEqual({ pass: true, reasons: [], fields: expect.objectContaining({ email: 'PRESENT' }) });
    });

    it.each([
      ['apiKeySource with the literal string "ABSENT"', { apiKeySource: 'ABSENT' }, 'apiKeySource present ("ABSENT"), required absent'],
      ['apiKeySource null', { apiKeySource: null }, 'apiKeySource present (null), required absent'],
      ['apiKeySource empty string', { apiKeySource: '' }, 'apiKeySource present (""), required absent'],
      ['forcedLoginMethod false', { forcedLoginMethod: false }, 'forcedLoginMethod present (false), required absent'],
      ['forcedLoginMethod as an object', { forcedLoginMethod: {} }, 'forcedLoginMethod present (UNEXPECTED_TYPE), required absent'],
      ['loggedIn as the string "true"', { loggedIn: 'true' }, 'loggedIn is "true", required true'],
      ['apiProvider not firstParty', { apiProvider: 'bedrock' }, 'apiProvider is "bedrock", required "firstParty"'],
      ['subscriptionType pro', { subscriptionType: 'pro' }, 'subscriptionType is "pro", required "max"'],
      ['authMethod absent', { authMethod: undefined }, 'authMethod is ABSENT, required "claude.ai"'],
      ['an unexpected key', { overage: true }, 'unexpected key: overage'],
    ])('%s blocks with exactly that reason', (_label, patch, reason) => {
      const answer: Record<string, unknown> = { ...GATE_OK, ...patch };
      for (const [key, value] of Object.entries(patch)) if (value === undefined) delete answer[key];
      expect(verdict(answer)).toEqual({ pass: false, reasons: [reason], fields: expect.any(Object) });
    });

    it('an identifier field is never reproduced whatever its value, and an unexpected type is named', () => {
      const { fields } = verdict({ ...GATE_OK, email: 'x@y.invalid', orgId: 42, orgName: null });
      expect(fields['email']).toBe('PRESENT');
      expect(fields['orgId']).toBe('UNEXPECTED_TYPE');
      expect(fields['orgName']).toBe('null');
    });

    it('a process outcome that is not clean blocks even a perfect answer', () => {
      expect(verdict(GATE_OK, { ...clean, signal: 'SIGKILL', exitCode: null }).reasons).toEqual(['process outcome not clean (exit null, signal SIGKILL, no termination)']);
      expect(
        verdict(GATE_OK, { ...clean, termination: { forced: true, processGroupMade: true, signalsSent: ['SIGTERM'], childReaped: true, groupGone: true } }).reasons,
      ).toEqual(['process outcome not clean (exit 0, signal null, termination signals [SIGTERM])']);
    });

    it('stdout that is not exactly one JSON object blocks', () => {
      expect(evaluateGateOutput('', clean).reasons).toEqual(['stdout is not exactly one JSON object']);
      expect(evaluateGateOutput('[]', clean).reasons).toEqual(['stdout is not exactly one JSON object']);
      expect(evaluateGateOutput(JSON.stringify(GATE_OK) + '\n' + JSON.stringify(GATE_OK), clean).reasons).toEqual(['stdout is not exactly one JSON object']);
      expect(evaluateGateOutput('Logged in\n' + JSON.stringify(GATE_OK), clean).pass).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// Tracked children
// ---------------------------------------------------------------------------

describe('tracked children', () => {
  it('escalate() reaches every live child; drain() waits for them; none survives', async () => {
    const pin = writeDummy('stalled', '/bin/sleep 600');
    const transport = transportFor(pin);
    const first = transport(roleRequest({ index: 0 }), never());
    const second = transport(roleRequest({ index: 1 }), never());
    const deadline = Date.now() + 2000;
    while (transport.activeChildren() < 2 && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10));
    expect(transport.activeChildren()).toBe(2);
    const pids = children.map((child) => child.pid!);
    expect(pids.every(alive)).toBe(true);

    transport.escalate();
    await transport.drain();

    expect(transport.activeChildren()).toBe(0);
    expect(pids.map(alive)).toEqual([false, false]);
    expect(pids.map(groupAlive)).toEqual([false, false]);
    const errors = await Promise.all([settleWith(first, ProcessTransportError), settleWith(second, ProcessTransportError)]);
    for (const error of errors) {
      expect(error.message).toContain('escalation');
      expect(error.process.termination?.signalsSent).toEqual(['SIGTERM']);
      expect(error.process.termination?.childReaped).toBe(true);
      expect(error.process.termination?.groupGone).toBe(true);
    }
    expect(records.map((entry) => entry.record.index).sort()).toEqual([0, 1]);
  });

  it('escalate() follows TERM with KILL after the grace for a child that ignores TERM', async () => {
    const pin = writeDummy('term-ignoring', 'trap "" TERM\n: > "$R/ready"\nwhile :; do /bin/sleep 1; done');
    const transport = transportFor(pin);
    const launch = transport(roleRequest(), never());
    await awaitReady();
    expect(transport.activeChildren()).toBe(1);
    transport.escalate();
    await transport.drain();
    const error = await settleWith(launch, ProcessTransportError);
    expect(error.process.termination?.signalsSent).toEqual(['SIGTERM', 'SIGKILL']);
    expect(error.process.signal).toBe('SIGKILL');
    expect(alive(error.process.pid!)).toBe(false);
    expect(transport.activeChildren()).toBe(0);
  });

  it('drain() with no children resolves at once, and after an abort it does not resolve before the child is reaped', async () => {
    const pin = writeDummy('stalled', '/bin/sleep 600');
    const transport = transportFor(pin);
    await transport.drain();
    const controller = new AbortController();
    const launch = transport(roleRequest(), controller.signal);
    const deadline = Date.now() + 2000;
    while (transport.activeChildren() < 1 && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10));
    const pid = children[0]!.pid!;
    controller.abort('cancelled');
    await transport.drain();
    expect(alive(pid)).toBe(false);
    expect(transport.activeChildren()).toBe(0);
    await settleWith(launch, ProcessTransportError);
  });
});

// ---------------------------------------------------------------------------
// The launch boundary, statically
// ---------------------------------------------------------------------------

describe('the launch boundary', () => {
  it('the transport imports only spawn from node:child_process and names no other launch API', () => {
    const source = readFileSync(join('src', 'pipeline', 'claude-code-cli-transport.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
    const imports = [...source.matchAll(/import\s+([^;]*?)\s+from\s+'node:child_process'/g)].map((match) => match[1]);
    expect(imports).toEqual(['{ spawn, type ChildProcess }']);
    expect(source).not.toMatch(/\b(spawnSync|execFile|execFileSync|execSync|exec|fork)\s*\(/);
    expect(source).not.toMatch(/shell:\s*true/);
    // Positive control for the pattern.
    expect(/\b(spawnSync|execFile|execFileSync|execSync|exec|fork)\s*\(/.test('const x = exec("ls")')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// claude-code-cli@2 through the transport
// ---------------------------------------------------------------------------

/** A role request as the pipeline hands it to an adapter; the prompt and message are the literals above. */
function adapterRoleRequest(model: string): RoleRequest {
  return {
    role: 'reader',
    index: 0,
    model,
    promptSha256: 'a'.repeat(64),
    messages: [
      { from: 'prompt', content: SYSTEM_PROMPT },
      { from: 'input', content: USER_MESSAGE },
    ],
  };
}

/** Compares element by element first, so a red names the position that moved, then as a whole. */
function expectArgv(actual: readonly string[], expected: readonly string[]): void {
  for (let i = 0; i < expected.length; i += 1) expect(actual[i], `argv[${i}]`).toBe(expected[i]);
  expect(actual).toEqual(expected);
}

describe('claude-code-cli@2 through the transport', () => {
  it('V2-A1 — @2\'s request, built by its adapter, reaches the child as exactly this argv: claude-opus-5-5, effort high, the @2 settings, safe mode and no tools', async () => {
    const pin = writeDummy('v2-answer', 'printf %s "ok"');
    const built = CLAUDE_CODE_CLI_V2_ADAPTER.buildRequest(adapterRoleRequest('claude-opus-5-5'), { endpoint: '', apiKey: '' });

    await transportFor(pin)(built, never());

    const expected = [
      '-p',
      '--model',
      'claude-opus-5-5',
      '--effort',
      'high',
      '--safe-mode',
      '--tools',
      '',
      '--strict-mcp-config',
      '--setting-sources',
      '',
      '--disable-slash-commands',
      '--no-session-persistence',
      '--settings',
      '{"switchModelsOnFlag":false,"fastMode":false,"autoContinueAtUsageLimit":false}',
      '--system-prompt-file',
      '<system-prompt-file>',
      '--json-schema',
      JSON.stringify(roleOutputJsonSchema('reader')),
      '--output-format',
      'stream-json',
      '--verbose',
      '--include-partial-messages',
    ];
    expect(records).toHaveLength(1);
    expectArgv(records[0]!.record.argv, expected);
    // What the child saw: the same, with the real prompt path in the one variable position.
    const seen = nulSeparated('argv.bin');
    expect(seen[16]).toBe(join(launches[0]!.options.cwd, 'system-prompt.txt'));
    expectArgv(seen, expected.map((element, i) => (i === 16 ? seen[16]! : element)));
    expect(recorded('marker')).toBe('');
  });

  it('V1-A1 — @1\'s request, built by its adapter, reaches the child as the argv it always had (the control for V2-A1\'s model and settings elements)', async () => {
    const pin = writeDummy('v1-answer', 'printf %s "ok"');
    const built = CLAUDE_CODE_CLI_ADAPTER.buildRequest(adapterRoleRequest('claude-opus-5'), { endpoint: '', apiKey: '' });

    await transportFor(pin)(built, never());

    expect(records).toHaveLength(1);
    expectArgv(records[0]!.record.argv, [
      '-p',
      '--model',
      'claude-opus-5',
      '--effort',
      'high',
      '--safe-mode',
      '--tools',
      '',
      '--strict-mcp-config',
      '--setting-sources',
      '',
      '--disable-slash-commands',
      '--no-session-persistence',
      '--settings',
      '{"switchModelsOnFlag":false}',
      '--system-prompt-file',
      '<system-prompt-file>',
      '--json-schema',
      JSON.stringify(roleOutputJsonSchema('reader')),
      '--output-format',
      'stream-json',
      '--verbose',
      '--include-partial-messages',
    ]);
  });

  it.each([
    ['not JSON', 'not json'],
    ['empty', ''],
    ['an array', '[]'],
    ['null', 'null'],
    ['a JSON string', '"x"'],
    ['a number', '1'],
    ['a boolean', 'true'],
  ])('V2-S1 — a settings text that is %s (%j) is refused as a LaunchSpecError naming settings, before the pin, with nothing launched', async (_label, settings) => {
    const pin = writeDummy('unused', 'exit 0');
    // A pin that cannot match: a body that got past the schema would be refused by the pin instead, under another name.
    const transport = transportFor({ ...pin, sha256: 'f'.repeat(64) });
    const error = await settleWith(transport(roleRequest({ settings }), never()), Error);
    expect(error.name).toBe('LaunchSpecError');
    expect(error.message).toBe('request body is not a CLI launch description: settings: must be the text of one JSON object');
    expect((error as { process?: ProcessFacts }).process?.started).toBe(false);
    expect(launches).toHaveLength(0);
    expect(existsSync(join(recordDir, 'marker'))).toBe(false);
  });

  it('V2-S2 — a settings value that is not a string is refused the same way, naming settings', async () => {
    const pin = writeDummy('unused', 'exit 0');
    const transport = transportFor({ ...pin, sha256: 'f'.repeat(64) });
    const error = await settleWith(transport(roleRequest({ settings: { fastMode: false } }), never()), Error);
    expect(error.name).toBe('LaunchSpecError');
    expect(error.message).toBe('request body is not a CLI launch description: settings: Expected string, received object');
    expect(launches).toHaveLength(0);
  });

  it('V2-S3 — positive control for V2-S1: the text of an object reaches argv verbatim, whitespace and all, at --settings', async () => {
    const pin = writeDummy('settings-ok', 'printf %s "ok"');
    const settings = '{"a": [1, 2],  "b": {"c": null}}';
    await transportFor(pin)(roleRequest({ settings }), never());
    expect(records).toHaveLength(1);
    expect(records[0]!.record.argv.slice(13, 15)).toEqual(['--settings', '{"a": [1, 2],  "b": {"c": null}}']);
    expect(nulSeparated('argv.bin').slice(13, 15)).toEqual(['--settings', '{"a": [1, 2],  "b": {"c": null}}']);
  });
});

describe('the gate under @2\'s rules', () => {
  /** The shape 2.1.280's `auth status --json` answers with: @1's keys plus three. */
  const GATE_2_1_280 = {
    loggedIn: true,
    authMethod: 'claude.ai',
    apiProvider: 'firstParty',
    email: 'someone@example.invalid',
    orgId: 'org_1234567890',
    orgName: 'Example Org',
    subscriptionType: 'max',
    analyticsDisabled: true,
    projectsDirectory: '/Users/someone/.claude/projects',
    configDirectory: '/Users/someone/.claude',
  };
  const CLEAN: ProcessFacts = {
    started: true,
    pid: 1,
    exitCode: 0,
    signal: null,
    durationMs: 1,
    stdoutBytes: 1,
    stderrBytes: 0,
    promptFileBytes: null,
    stdinBytes: 0,
    promptFileRemoved: null,
    promptFileRemovalError: null,
    termination: null,
  };
  const V2_FIELDS = {
    loggedIn: 'true',
    authMethod: '"claude.ai"',
    apiProvider: '"firstParty"',
    apiKeySource: 'ABSENT',
    forcedLoginMethod: 'ABSENT',
    subscriptionType: '"max"',
    email: 'PRESENT',
    orgId: 'PRESENT',
    orgName: 'PRESENT',
    analyticsDisabled: 'true',
    projectsDirectory: 'PRESENT',
    configDirectory: 'PRESENT',
  };

  it('V2-G1 — a 2.1.280-shaped answer passes under @2\'s rules; the directories are PRESENT and neither value appears anywhere in the result', () => {
    const stdout = JSON.stringify(GATE_2_1_280) + '\n';
    // Positive control: both values are in what was evaluated, so their absence below is the gate's doing.
    expect(stdout).toContain('"/Users/someone/.claude/projects"');
    expect(stdout).toContain('"/Users/someone/.claude"');

    const result = evaluateGateOutput(stdout, CLEAN, CLAUDE_CODE_CLI_V2_GATE_RULES);

    const serialised = JSON.stringify(result);
    expect(serialised, 'the projects directory was reproduced in the gate result').not.toContain('/Users/someone/.claude/projects');
    expect(serialised, 'the config directory was reproduced in the gate result').not.toContain('/Users/someone/.claude');
    expect(serialised).not.toContain('/Users/someone');
    expect(serialised).not.toContain('example.invalid');
    expect(serialised).not.toContain('org_1234567890');
    expect(serialised).not.toContain('Example Org');
    expect(result).toEqual({ pass: true, reasons: [], fields: V2_FIELDS });
    expect(Object.keys(result.fields)).toEqual(Object.keys(V2_FIELDS));
  });

  it.each([
    ['false', false, 'analyticsDisabled is false, required true'],
    ['absent', undefined, 'analyticsDisabled is ABSENT, required true'],
    ['the string "true"', 'true', 'analyticsDisabled is "true", required true'],
    ['null', null, 'analyticsDisabled is null, required true'],
  ])('V2-G2 — analyticsDisabled %s blocks with exactly that reason', (_label, value, reason) => {
    const answer: Record<string, unknown> = { ...GATE_2_1_280, analyticsDisabled: value };
    if (value === undefined) delete answer['analyticsDisabled'];
    expect(evaluateGateOutput(JSON.stringify(answer), CLEAN, CLAUDE_CODE_CLI_V2_GATE_RULES)).toEqual({ pass: false, reasons: [reason], fields: expect.any(Object) });
  });

  it('V2-G3 — an unknown key still blocks under @2\'s rules, beside an otherwise good answer', () => {
    expect(evaluateGateOutput(JSON.stringify({ ...GATE_2_1_280, overage: true }), CLEAN, CLAUDE_CODE_CLI_V2_GATE_RULES)).toEqual({
      pass: false,
      reasons: ['unexpected key: overage'],
      fields: V2_FIELDS,
    });
  });

  it('V2-G4 — @1\'s rules, by default and by name, block the 2.1.280 answer exactly as today: one unexpected-key reason per new key', () => {
    const stdout = JSON.stringify(GATE_2_1_280);
    const expected = {
      pass: false,
      reasons: ['unexpected key: analyticsDisabled', 'unexpected key: projectsDirectory', 'unexpected key: configDirectory'],
      fields: {
        loggedIn: 'true',
        authMethod: '"claude.ai"',
        apiProvider: '"firstParty"',
        apiKeySource: 'ABSENT',
        forcedLoginMethod: 'ABSENT',
        subscriptionType: '"max"',
        email: 'PRESENT',
        orgId: 'PRESENT',
        orgName: 'PRESENT',
      },
    };
    expect(evaluateGateOutput(stdout, CLEAN)).toEqual(expected);
    expect(evaluateGateOutput(stdout, CLEAN, CLAUDE_CODE_CLI_GATE_RULES)).toEqual(expected);
    expect(JSON.stringify(evaluateGateOutput(stdout, CLEAN))).not.toContain('/Users/someone');
  });

  it('V2-G6 — the exported GATE_FIELD_ALLOWLIST is still @1\'s nine keys, in order: nothing reads it since the rules moved into the profile, so this is what pins it', () => {
    expect(GATE_FIELD_ALLOWLIST).toEqual(['loggedIn', 'authMethod', 'apiProvider', 'apiKeySource', 'forcedLoginMethod', 'subscriptionType', 'email', 'orgId', 'orgName']);
  });

  it('V2-G5 — runGate applies the rules it was handed: the same 2.1.280 answer passes with gate = @2\'s rules, and blocks without them', async () => {
    const pin = writeDummy('gate-2-1-280', `printf %s ${JSON.stringify(JSON.stringify(GATE_2_1_280))}`);

    const withV2 = await transportFor(pin, { gate: CLAUDE_CODE_CLI_V2_GATE_RULES }).runGate(never());
    const withDefault = await transportFor(pin).runGate(never());

    expect(withV2.reasons).toEqual([]);
    expect(withV2.pass).toBe(true);
    expect(withV2.fields).toEqual(V2_FIELDS);
    expect(JSON.stringify(withV2)).not.toContain('/Users/someone');
    expect(withDefault.reasons).toEqual(['unexpected key: analyticsDisabled', 'unexpected key: projectsDirectory', 'unexpected key: configDirectory']);
    expect(withDefault.pass).toBe(false);
    // Both were real gate launches of the same dummy, under the same argv.
    expect(records.map((entry) => entry.record.kind)).toEqual(['gate', 'gate']);
    expect(records.map((entry) => entry.record.argv)).toEqual([
      ['auth', 'status', '--json'],
      ['auth', 'status', '--json'],
    ]);
    expect(withV2.process.exitCode).toBe(0);
    expect(withDefault.process.exitCode).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// The profile's --settings, held by the transport (Task 5a, a parent decision)
// ---------------------------------------------------------------------------

describe('a transport holding its profile\'s --settings text', () => {
  /** `@2`'s settings text, written out: never read off the profile. */
  const V2_SETTINGS = '{"switchModelsOnFlag":false,"fastMode":false,"autoContinueAtUsageLimit":false}';
  /** The text a description without settings launches with, written out. */
  const DEFAULT_SETTINGS = '{"switchModelsOnFlag":false}';
  const DISAGREE = 'the launch description and the transport\'s profile disagree';

  it('H1-1 — positive control: a description whose settings are exactly the profile\'s launches once, with that text at --settings', async () => {
    const pin = writeDummy('h1-agree', 'printf %s "ok"');
    const built = CLAUDE_CODE_CLI_V2_ADAPTER.buildRequest(adapterRoleRequest('claude-opus-5-5'), { endpoint: '', apiKey: '' });

    const response = await transportFor(pin, { settings: V2_SETTINGS })(built, never());

    expect(response.process?.started).toBe(true);
    expect(launches).toHaveLength(1);
    expect(records).toHaveLength(1);
    expect(records[0]!.record.argv.slice(13, 15)).toEqual(['--settings', V2_SETTINGS]);
    expect(nulSeparated('argv.bin').slice(13, 15)).toEqual(['--settings', V2_SETTINGS]);
  });

  it('H1-2 — a description without settings, as @1\'s adapter builds it, is refused before the pin: nothing launched, no directory, no prompt file', async () => {
    const pin = writeDummy('unused', 'exit 0');
    // A pin that cannot match: a description that got past the comparison would be refused by the pin instead, under another name.
    const transport = transportFor({ ...pin, sha256: 'f'.repeat(64) }, { settings: V2_SETTINGS });
    const built = CLAUDE_CODE_CLI_ADAPTER.buildRequest(adapterRoleRequest('claude-opus-5'), { endpoint: '', apiKey: '' });
    expect(JSON.parse(built.body)).not.toHaveProperty('settings');

    const error = await settleWith(transport(built, never()), Error);

    expect(error.name).toBe('LaunchSettingsMismatchError');
    expect(error).toBeInstanceOf(LaunchSettingsMismatchError);
    expect(error.message).toContain('--settings');
    expect(error.message).toContain(DISAGREE);
    expect(error.message).toBe(
      `the launch description's --settings ${JSON.stringify(DEFAULT_SETTINGS)} is not the transport's profile settings ${JSON.stringify(V2_SETTINGS)}: ${DISAGREE}, so nothing was launched`,
    );
    expect((error as { process?: ProcessFacts }).process?.started).toBe(false);
    expect(launches).toHaveLength(0);
    expect(records).toHaveLength(0);
    expect(readdirSync(tempRoot)).toEqual([]);
    expect(existsSync(join(recordDir, 'marker'))).toBe(false);
  });

  it.each([
    ['other settings', '{"switchModelsOnFlag":false,"fastMode":false}'],
    ['the same keys in another order', '{"fastMode":false,"switchModelsOnFlag":false,"autoContinueAtUsageLimit":false}'],
    ['the same object with a space', '{"switchModelsOnFlag":false, "fastMode":false,"autoContinueAtUsageLimit":false}'],
  ])('H1-3 — a description carrying %s is refused the same way: the text is compared, not the object', async (_label, settings) => {
    const pin = writeDummy('unused', 'exit 0');
    const transport = transportFor({ ...pin, sha256: 'f'.repeat(64) }, { settings: V2_SETTINGS });

    const error = await settleWith(transport(roleRequest({ settings }), never()), Error);

    expect(error.name).toBe('LaunchSettingsMismatchError');
    // The class beside the name (Task 5a review repair R11).
    expect(error).toBeInstanceOf(LaunchSettingsMismatchError);
    expect(error.message).toContain(`--settings ${JSON.stringify(settings)}`);
    expect(error.message).toContain(DISAGREE);
    expect((error as { process?: ProcessFacts }).process?.started).toBe(false);
    expect(launches).toHaveLength(0);
    expect(readdirSync(tempRoot)).toEqual([]);
  });

  it('H1-4 — the comparison is of the effective settings: a transport holding the default text launches a description without settings', async () => {
    const pin = writeDummy('h1-default', 'printf %s "ok"');
    const built = CLAUDE_CODE_CLI_ADAPTER.buildRequest(adapterRoleRequest('claude-opus-5'), { endpoint: '', apiKey: '' });

    await transportFor(pin, { settings: DEFAULT_SETTINGS })(built, never());

    expect(launches).toHaveLength(1);
    expect(records[0]!.record.argv.slice(13, 15)).toEqual(['--settings', DEFAULT_SETTINGS]);
  });

  it('H1-5 — without the option nothing is compared, as before: @1\'s and @2\'s descriptions both launch, each with its own text', async () => {
    const pin = writeDummy('h1-unset', 'printf %s "ok"');
    const transport = transportFor(pin);
    await transport(CLAUDE_CODE_CLI_ADAPTER.buildRequest(adapterRoleRequest('claude-opus-5'), { endpoint: '', apiKey: '' }), never());
    await transport(CLAUDE_CODE_CLI_V2_ADAPTER.buildRequest(adapterRoleRequest('claude-opus-5-5'), { endpoint: '', apiKey: '' }), never());

    expect(launches).toHaveLength(2);
    expect(records.map((entry) => entry.record.argv.slice(13, 15))).toEqual([
      ['--settings', DEFAULT_SETTINGS],
      ['--settings', V2_SETTINGS],
    ]);
  });
});
