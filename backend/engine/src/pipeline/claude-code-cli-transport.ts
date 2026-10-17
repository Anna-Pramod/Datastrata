/**
 * The process transport: the one place in `src/` that launches a child.
 *
 * `anthropic-messages@1` reaches a provider over HTTP through `fetch`;
 * `claude-code-cli@1` reaches it through the pinned Claude Code CLI on a
 * subscription, and the CLI is a local process. This module is that
 * launch, and it is the **only** module under `src/` that imports
 * `node:child_process` or starts a process by any route; a static test
 * holds that boundary, and the suite-wide process guard makes any other
 * launch loud. The only API used is `spawn` — no shell, ever — and it is
 * injectable so a test can wrap it and see exactly what was asked of it.
 *
 * **Why the transport owns so much.** The runner's record contract
 * (`live-runner.ts`) says that on the process channel the facts about a
 * child are the account of the attempt: whether a child started decides
 * whether money may have moved, and whether it was reaped and its process
 * group is gone decides whether the operator's machine is clean. Those are
 * facts only the launcher can observe, so the launcher records them and
 * never infers them:
 *
 * - **The pin is checked before every launch**, gate or role, by streaming
 *   SHA-256 and size of the executable. A mismatch is a `before_send`
 *   failure with `started: false`, because nothing ran.
 * - **The environment is exactly what the caller names.** Three inherited
 *   variables plus the launch controls; nothing else from this process's
 *   environment reaches the child, so a stray `ANTHROPIC_API_KEY` cannot
 *   quietly turn a subscription run into a metered one.
 * - **The system prompt goes through a file** created `O_EXCL` at `0600`
 *   inside a `0700` directory made for this launch, and the user message
 *   goes on stdin. The file's path is evidence on disk and appears in no
 *   record, no error message and no launch record: the argv handed to
 *   `onLaunch` carries a placeholder in its place.
 * - **Every child is its own process group** (`detached: true`), so
 *   termination is addressed to `-pid` and reaches whatever the CLI
 *   spawned. Termination is TERM, a bounded wait, KILL, a bounded wait, and
 *   the facts say what was *observed* — the exit event, and `kill(-pid, 0)`
 *   reporting the group gone — never what was sent and hoped for.
 *   `termination` is `null` only after a natural exit whose group was seen
 *   to be gone.
 * - **A leftover is not an answer.** When the child exits but something it
 *   started is still in its group, the group is ended and every cleanup
 *   fact is recorded — and the launch is then refused rather than returned.
 *   A role launch throws `ProcessTransportError` naming
 *   `leftover_processes_terminated`; a gate blocks with the reason
 *   `leftover_processes_after_exit`. What the child wrote still reaches
 *   `onLaunch`, so the evidence is complete; it is only not projected as
 *   the CLI's answer, because a CLI that left processes behind did not
 *   finish the way an answer would claim.
 * - **Cancellation is never lost, and never waits on a stranger.** The abort
 *   listener is in place before `launch` is called, so an abort at any
 *   point after the initial check — between `launch` and the 'spawn'
 *   event, during the stdin write, or during the wait for the pipes — ends
 *   the child and rejects. And the wait for the pipes to close is bounded
 *   by the TERM grace even once the child is reaped and its group gone: a
 *   process that left the group (`setsid`) but kept the inherited stdout
 *   holds the pipes open for as long as it likes, and it is outside
 *   anything this transport can address. On a give-up the pipes are
 *   destroyed and the launch record says `streamsClosed: false` — the pipes
 *   were still held by an untracked process when the launch was given up
 *   on — where `true` means every writer was seen to be gone.
 * - **A give-up is not an answer either.** A launch given up on with its
 *   pipes still held is refused where it happens, under the same shape as a
 *   leftover: a role launch throws `ProcessTransportError` naming
 *   `streams_not_closed`, after `onLaunch` has the record and the output, so
 *   the runner books the attempt as possibly billed and nothing projects the
 *   output; a gate blocks with the reason `streams_not_closed` beside
 *   whatever else its facts said. Acting on the record only at the end of a
 *   run let a gate with unclosed pipes pass and roles start, and let a role
 *   with unclosed pipes be taken for an answer while later roles launched;
 *   the harness's post-drain rule remains as a backstop, not the path.
 * - **Output is bounded** across both streams; past the bound the child is
 *   ended and the attempt fails under a name, because an unbounded pipe
 *   read is a way to lose the machine before losing the run.
 * - **Evidence failures keep their name.** `onLaunch` is the harness's
 *   observation of every launch; when it throws, the primary error is
 *   `EvidenceObservationFailedError` carrying the facts, and a cleanup
 *   failure afterwards is appended to the facts rather than replacing it.
 * - **Cleanup is reported, not assumed.** `promptFileRemoved` is `true` only
 *   when `unlink` succeeded; a failure records the error code.
 *
 * The gate (`runGate`) runs `auth status --json` under the same pin, env
 * and process handling, and reduces the answer to allowlisted display labels
 * — never the account's email or organisation identifiers — plus the
 * process facts. It is not a runner attempt: it is reported to `onLaunch`
 * with `kind: 'gate'`. Its rules are the profile's, handed in as `gate`:
 * each executable reports its own set of keys, and an allowlist written for
 * one would either block the other or be widened for both. Without `gate`,
 * the rules are `@1`'s, as they always were.
 *
 * The launch description may carry a `--settings` text; it must be the text
 * of one JSON object, or nothing is launched. Without one, the argv carries
 * the setting `@1` has always launched with (`DEFAULT_LAUNCH_SETTINGS`).
 * A transport handed its profile's `settings` text refuses a role launch
 * whose effective `--settings` — the description's, or that default — is
 * not exactly that text, before anything is launched or written
 * (`LaunchSettingsMismatchError`; a parent decision in the Opus 5.5
 * migration's Task 5a, closing HANDOVER-b's open decision 7 fail-closed).
 * The profile is the authority on what a launch runs under, and a
 * description built by another profile's adapter would otherwise launch
 * under settings this profile never stated. Without `settings` nothing is
 * compared, and every launch is exactly what it always was.
 *
 * The permission mode is held the same way.
 * - A launch description may carry `permissionMode`, exactly `"default"`. It
 *   is `@3`'s alone, and any other value launches nothing.
 * - It reaches the argv as `--permission-mode default`, right after
 *   `--no-session-persistence`. A description without it launches the argv
 *   it always did.
 * - A transport handed its profile's `permissionMode` refuses a role launch
 *   whose description does not carry exactly that mode, absent included. The
 *   refusal is `LaunchPermissionModeMismatchError`, before anything is
 *   launched or written. Without the option nothing is compared.
 *
 * Tracked children exist so an operator's second interrupt (`escalate`) can
 * reach every live child at once, and so a harness can `drain` — wait,
 * bounded, for every launch to finish — before it writes a final status.
 * The drain's bound covers the longest a launch can take once signalled:
 * the TERM grace, the KILL grace, and the bounded wait for the pipes.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { chmod, mkdtemp, open, rmdir, stat, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import {
  EvidenceObservationFailedError,
  ProcessTransportError,
  TransportFailure,
  type ProcessFacts,
  type ProviderHttpResponse,
  type ProviderTransport,
} from './live-runner';
import { CLAUDE_CODE_CLI_GATE_RULES, type CliGateRules } from './claude-code-cli';
import type { ProviderHttpRequest } from './provider-adapter';

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

/** The only URL this transport serves; anything else is a wrong-transport refusal. */
export const CLI_TRANSPORT_URL = 'claude-code-cli:pinned';
/** Combined stdout + stderr bound, past which the child is ended. */
export const DEFAULT_MAX_OUTPUT_BYTES = 20 * 1024 * 1024;
/** Default bounded wait after TERM and after KILL. */
export const DEFAULT_GRACE_MS = 5000;
/** The prompt file's name inside the per-launch directory. */
export const PROMPT_FILE_NAME = 'system-prompt.txt';
/** Stands in for the prompt file's path in every launch record. */
export const PROMPT_FILE_PLACEHOLDER = '<system-prompt-file>';
/** The gate's argv. */
export const GATE_ARGV: readonly string[] = ['auth', 'status', '--json'];
/** Keys `@1`'s gate answer may carry; anything else blocks. Defined once, in `@1`'s gate rules. */
export const GATE_FIELD_ALLOWLIST: readonly string[] = CLAUDE_CODE_CLI_GATE_RULES.allowlist;
/** The `--settings` text a launch description without one launches with: the setting `@1` has always run under. */
export const DEFAULT_LAUNCH_SETTINGS = '{"switchModelsOnFlag":false}';

/** The executable pin: absolute path, streaming SHA-256 and exact size. */
export interface ExecutablePin {
  path: string;
  sha256: string;
  sizeBytes: number;
}

/** The three variables the child inherits. Nothing else does. */
export interface InheritedEnv {
  HOME: string;
  USER: string;
  PATH: string;
}

/** The transport's envelope: what the adapter projects. */
export interface CliEnvelope {
  exitCode: number | null;
  signal: string | null;
  stdout: string;
  stderrBytes: number;
}

/** One launch, as reported to the harness. Facts plus what was asked, minus the prompt path. */
export type LaunchRecord = ProcessFacts & {
  kind: 'gate' | 'role';
  role: string | null;
  index: number | null;
  argv: string[];
  envNames: string[];
  /**
   * `true` when both pipes were seen to close, which happens only once every
   * process holding them is gone. `false` means the launch was given up on
   * after the bounded wait while the pipes were still held by an untracked
   * process — one that left the child's group, so nothing here could reach
   * it — and the pipes were destroyed on this side.
   */
  streamsClosed: boolean;
};

/** The gate's verdict: reasons name every rule that blocked; fields are display labels only. */
export interface GateResult {
  pass: boolean;
  reasons: string[];
  fields: Record<string, string>;
  process: ProcessFacts;
}

/** `spawn`'s shape, narrowed to the one call this module makes. */
export type LaunchFunction = (
  file: string,
  args: readonly string[],
  options: {
    shell: false;
    detached: true;
    env: Record<string, string>;
    cwd: string;
    stdio: ['pipe', 'pipe', 'pipe'];
  },
) => ChildProcess;

export interface SpawnTransportOptions {
  executable: ExecutablePin;
  inheritedEnv: InheritedEnv;
  controls: Readonly<Record<string, string>>;
  launch?: LaunchFunction;
  onLaunch?: (record: LaunchRecord, partialStdout: string) => void;
  /** The gate's rules, from the profile being launched. Defaults to `@1`'s. */
  gate?: CliGateRules;
  /**
   * The profile's `--settings` text, where it states one. Every role launch's
   * effective `--settings` must then be exactly this text, or the launch is
   * refused before anything is launched or written. Absent, nothing is
   * compared.
   */
  settings?: string;
  /**
   * The profile's permission mode, where it states one (`@3`'s `'default'`).
   * Every role launch's description must then carry exactly this mode, or
   * the launch is refused before anything is launched or written. Absent,
   * nothing is compared.
   */
  permissionMode?: 'default';
  tempRoot?: string;
  maxOutputBytes?: number;
  termGraceMs?: number;
  killGraceMs?: number;
}

export interface SpawnTransport extends ProviderTransport {
  runGate(signal: AbortSignal): Promise<GateResult>;
  activeChildren(): number;
  escalate(): void;
  drain(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Refusals before a launch. Each carries `process` with `started: false` so
// the runner's record says truthfully that no child existed.
// ---------------------------------------------------------------------------

/** The request was built for another transport. Nothing launched. */
export class WrongTransportError extends Error {
  readonly process: ProcessFacts;
  constructor(readonly url: string) {
    super(`request url ${JSON.stringify(url)} is not ${JSON.stringify(CLI_TRANSPORT_URL)}; this transport launches the pinned CLI and nothing else`);
    this.name = 'WrongTransportError';
    this.process = unstartedFacts();
  }
}

/** The request body is not the launch description the adapter emits. Nothing launched. */
export class LaunchSpecError extends Error {
  readonly process: ProcessFacts;
  constructor(detail: string) {
    super(`request body is not a CLI launch description: ${detail}`);
    this.name = 'LaunchSpecError';
    this.process = unstartedFacts();
  }
}

/**
 * The launch description's effective `--settings` is not the text the
 * transport's profile states. Nothing launched, and nothing written: no
 * launch directory, no prompt file. Both texts are named — they are launch
 * configuration, never a credential — so the refusal says which side said
 * what.
 */
export class LaunchSettingsMismatchError extends Error {
  readonly process: ProcessFacts;
  constructor(readonly described: string, readonly profiled: string) {
    super(`the launch description's --settings ${JSON.stringify(described)} is not the transport's profile settings ${JSON.stringify(profiled)}: the launch description and the transport's profile disagree, so nothing was launched`);
    this.name = 'LaunchSettingsMismatchError';
    this.process = unstartedFacts();
  }
}

/**
 * The launch description's permission mode is not the one the transport's
 * profile states, absent included. Nothing launched and nothing written: no
 * launch directory, no prompt file. Both sides are named, as the settings
 * refusal names both texts.
 */
export class LaunchPermissionModeMismatchError extends Error {
  readonly process: ProcessFacts;
  constructor(readonly described: string | null, readonly profiled: string) {
    super(`the launch description's --permission-mode ${described === null ? 'is absent' : JSON.stringify(described)}, and the transport's profile permission mode is ${JSON.stringify(profiled)}: the launch description and the transport's profile disagree, so nothing was launched`);
    this.name = 'LaunchPermissionModeMismatchError';
    this.process = unstartedFacts();
  }
}

/**
 * The executable on disk is not the pinned one. A `before_send` transport
 * failure, so the runner may retry under its own rule — and `started: false`
 * says it is safe to, because nothing ran.
 */
export class ExecutablePinMismatchError extends TransportFailure {
  readonly process: ProcessFacts;
  constructor(detail: string) {
    super('before_send', `executable pin mismatch: ${detail}`);
    this.name = 'ExecutablePinMismatchError';
    this.process = unstartedFacts();
  }
}

/** `spawn` itself failed before a child existed (for instance, not executable). */
export class LaunchFailedError extends TransportFailure {
  readonly process: ProcessFacts;
  constructor(detail: string) {
    super('before_send', `launch failed before a child existed: ${detail}`);
    this.name = 'LaunchFailedError';
    this.process = unstartedFacts();
  }
}

function unstartedFacts(): ProcessFacts {
  return {
    started: false,
    pid: null,
    exitCode: null,
    signal: null,
    durationMs: 0,
    stdoutBytes: 0,
    stderrBytes: 0,
    promptFileBytes: null,
    stdinBytes: null,
    promptFileRemoved: null,
    promptFileRemovalError: null,
    termination: null,
  };
}

// ---------------------------------------------------------------------------
// The launch description the adapter's request body carries
// ---------------------------------------------------------------------------

const launchSpecSchema = z
  .object({
    model: z.string().min(1),
    systemPrompt: z.string(),
    userMessage: z.string(),
    jsonSchema: z.record(z.unknown()),
    effort: z.string().min(1),
    settings: z.string().refine(isJsonObjectText, { message: 'must be the text of one JSON object' }).optional(),
    permissionMode: z.literal('default').optional(),
    role: z.string().min(1).optional(),
    index: z.number().int().nonnegative().optional(),
  })
  .strict();

/**
 * `--settings` is handed to the CLI as one argument, and the CLI reads it
 * as a settings object. Text that is not one — an array, `null`, a bare
 * value, or not JSON at all — is refused before launch rather than left for
 * the CLI to interpret, since what it would do with one is unobserved.
 */
function isJsonObjectText(text: string): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return false;
  }
  return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed);
}

type LaunchSpec = z.infer<typeof launchSpecSchema>;

function parseLaunchSpec(body: string): LaunchSpec {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (error) {
    throw new LaunchSpecError(`not JSON (${error instanceof Error ? error.message : String(error)})`);
  }
  const result = launchSpecSchema.safeParse(parsed);
  if (!result.success) {
    throw new LaunchSpecError(result.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`).join('; '));
  }
  return result.data;
}

/** The role argv, with the real prompt path; the record form substitutes the placeholder. */
function roleArgv(spec: LaunchSpec, promptPath: string): string[] {
  return [
    '-p',
    '--model',
    spec.model,
    '--effort',
    spec.effort,
    '--safe-mode',
    '--tools',
    '',
    '--strict-mcp-config',
    '--setting-sources',
    '',
    '--disable-slash-commands',
    '--no-session-persistence',
    ...(spec.permissionMode === undefined ? [] : ['--permission-mode', spec.permissionMode]),
    '--settings',
    spec.settings ?? DEFAULT_LAUNCH_SETTINGS,
    '--system-prompt-file',
    promptPath,
    '--json-schema',
    JSON.stringify(spec.jsonSchema),
    '--output-format',
    'stream-json',
    '--verbose',
    '--include-partial-messages',
  ];
}

// ---------------------------------------------------------------------------
// The pin
// ---------------------------------------------------------------------------

/** Streams the file's SHA-256; a 280 MB executable is never read into memory. */
async function sha256Of(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

/** Returns the mismatch detail, or `null` when the executable is the pinned one. */
export async function verifyExecutablePin(pin: ExecutablePin): Promise<string | null> {
  let size: number;
  try {
    const info = await stat(pin.path);
    if (!info.isFile()) return `${pin.path} is not a regular file`;
    size = info.size;
  } catch (error) {
    return `${pin.path} not readable (${codeOf(error)})`;
  }
  if (size !== pin.sizeBytes) return `size ${size} bytes, pinned ${pin.sizeBytes}`;
  const digest = await sha256Of(pin.path);
  if (digest !== pin.sha256) return `sha256 ${digest}, pinned ${pin.sha256}`;
  return null;
}

function codeOf(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const { code, name } = error as { code?: unknown; name?: unknown };
    if (typeof code === 'string' && code !== '') return code;
    if (typeof name === 'string' && name !== '') return name;
  }
  return String(error);
}

// ---------------------------------------------------------------------------
// The gate's verdict, as a pure function so each rule can be exercised alone
// ---------------------------------------------------------------------------

/** A display label that can never be the value of an identifier field. */
function gateLabel(present: boolean, value: unknown, identifier: boolean): string {
  if (!present) return 'ABSENT';
  if (value === null) return 'null';
  if (typeof value === 'string') return identifier ? 'PRESENT' : JSON.stringify(value);
  if (typeof value === 'boolean') return identifier ? 'UNEXPECTED_TYPE' : String(value);
  return 'UNEXPECTED_TYPE';
}

/**
 * Reduces the gate's stdout and process facts to a verdict under one
 * profile's rules (`@1`'s unless others are given). Every rule adds its own
 * reason, so a blocked gate says everything that blocked it; fields are
 * labels, and an identifier field's label says only whether it was there.
 */
export function evaluateGateOutput(stdout: string, facts: ProcessFacts, rules: CliGateRules = CLAUDE_CODE_CLI_GATE_RULES): Omit<GateResult, 'process'> {
  const reasons: string[] = [];
  const fields: Record<string, string> = {};
  if (facts.exitCode !== 0 || facts.signal !== null || facts.termination !== null) {
    reasons.push(
      `process outcome not clean (exit ${facts.exitCode ?? 'null'}, signal ${facts.signal ?? 'null'}, ${
        facts.termination === null ? 'no termination' : `termination signals [${facts.termination.signalsSent.join(', ')}]`
      })`,
    );
  }
  let answer: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = JSON.parse(stdout.trim());
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) answer = parsed as Record<string, unknown>;
  } catch {
    // Reported below as not one JSON object.
  }
  if (answer === null) {
    reasons.push('stdout is not exactly one JSON object');
    return { pass: false, reasons, fields };
  }
  for (const key of Object.keys(answer)) {
    if (!rules.allowlist.includes(key)) reasons.push(`unexpected key: ${key}`);
  }
  for (const key of rules.allowlist) {
    fields[key] = gateLabel(Object.hasOwn(answer, key), answer[key], rules.identifierFields.includes(key));
  }
  for (const [key, expected] of rules.required) {
    if (answer[key] !== expected) reasons.push(`${key} is ${fields[key]}, required ${JSON.stringify(expected)}`);
  }
  for (const key of rules.requiredAbsent) {
    if (Object.hasOwn(answer, key)) reasons.push(`${key} present (${fields[key]}), required absent`);
  }
  return { pass: reasons.length === 0, reasons, fields };
}

// ---------------------------------------------------------------------------
// Children
// ---------------------------------------------------------------------------

interface Tracked {
  readonly pid: number;
  readonly proc: ChildProcess;
  exited: boolean;
  exitCode: number | null;
  exitSignal: string | null;
  /** Every signal actually delivered to the group, in order. */
  readonly signalsSent: string[];
  /** A signal reached the group while the child was alive: the transport ended it. */
  signalledWhileAlive: boolean;
  /** Observed right after spawn: `kill(-pid, 0)` found a group led by the child. */
  processGroupMade: boolean;
  /** Last observation of `kill(-pid, 0)`; `null` until first checked. */
  groupGone: boolean | null;
  terminating: Promise<void> | null;
  escalationTimer: NodeJS.Timeout | null;
  readonly exit: Promise<void>;
  /** The 'close' event was seen: both pipes are closed, so every holder of them is gone. */
  closed: boolean;
  readonly close: Promise<void>;
  readonly finished: Promise<void>;
  finish: () => void;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * The promise's value, or `'timeout'` after `ms`. The timer is cleared when
 * the promise wins, so a bound never holds the process open past the thing
 * it bounded.
 */
async function bounded<T>(promise: Promise<T>, ms: number): Promise<T | 'timeout'> {
  let timer: NodeJS.Timeout | null = null;
  const expiry = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), ms);
  });
  try {
    return await Promise.race([promise, expiry]);
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}

/** `kill(-pid, 0)`: ESRCH means the group is gone; anything else means something in it exists. */
function observeGroupGone(t: Tracked): boolean {
  try {
    process.kill(-t.pid, 0);
    t.groupGone = false;
  } catch (error) {
    t.groupGone = codeOf(error) === 'ESRCH';
  }
  return t.groupGone;
}

/** Sends to the group; records the signal only if the kernel accepted it. */
function signalGroup(t: Tracked, sig: 'SIGTERM' | 'SIGKILL'): void {
  try {
    process.kill(-t.pid, sig);
    t.signalsSent.push(sig);
    if (!t.exited) t.signalledWhileAlive = true;
  } catch (error) {
    if (codeOf(error) === 'ESRCH') t.groupGone = true;
  }
}

/** Polls until the child has exited and its group is gone, or the grace runs out. */
async function awaitQuiet(t: Tracked, graceMs: number): Promise<boolean> {
  const deadline = Date.now() + graceMs;
  for (;;) {
    if (t.exited && observeGroupGone(t)) return true;
    const remaining = deadline - Date.now();
    if (remaining <= 0) return false;
    await sleep(Math.min(20, remaining));
  }
}

// ---------------------------------------------------------------------------
// The transport
// ---------------------------------------------------------------------------

interface LaunchPlan {
  kind: 'gate' | 'role';
  role: string | null;
  index: number | null;
  argv: string[];
  recordArgv: string[];
  stdin: string | null;
  dir: string;
  promptPath: string | null;
  promptFileBytes: number | null;
}

interface LaunchOutcome {
  facts: ProcessFacts;
  stdout: string;
  /** Set when the transport ended the child before an answer; the launch then throws. */
  ended: string | null;
  /** The child exited on its own but its group still held processes, which were then ended. */
  leftover: boolean;
  /** Both pipes were seen to close; `false` means the bounded wait was given up on. */
  streamsClosed: boolean;
}

export function createSpawnTransport(options: SpawnTransportOptions): SpawnTransport {
  const launch: LaunchFunction = options.launch ?? (spawn as unknown as LaunchFunction);
  const tempRoot = options.tempRoot ?? tmpdir();
  const maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
  const termGraceMs = options.termGraceMs ?? DEFAULT_GRACE_MS;
  const killGraceMs = options.killGraceMs ?? DEFAULT_GRACE_MS;
  const gateRules = options.gate ?? CLAUDE_CODE_CLI_GATE_RULES;
  const env: Record<string, string> = {
    HOME: options.inheritedEnv.HOME,
    USER: options.inheritedEnv.USER,
    PATH: options.inheritedEnv.PATH,
    ...options.controls,
  };
  const envNames = Object.keys(env).sort();
  const tracked = new Set<Tracked>();

  function terminate(t: Tracked): Promise<void> {
    t.terminating ??= (async () => {
      signalGroup(t, 'SIGTERM');
      if (await awaitQuiet(t, termGraceMs)) return;
      signalGroup(t, 'SIGKILL');
      await awaitQuiet(t, killGraceMs);
    })();
    return t.terminating;
  }

  /** `null` only for a natural exit, nothing sent, group observed gone. Anything else is written down. */
  function terminationFacts(t: Tracked): ProcessFacts['termination'] {
    if (t.exited && t.signalsSent.length === 0 && t.groupGone === true) return null;
    return {
      forced: true,
      processGroupMade: t.processGroupMade,
      signalsSent: [...t.signalsSent],
      childReaped: t.exited,
      groupGone: t.groupGone,
    };
  }

  async function makeLaunchDir(): Promise<string> {
    const dir = await mkdtemp(join(tempRoot, 'ds-cli-'));
    await chmod(dir, 0o700);
    return dir;
  }

  async function removeArtifacts(plan: LaunchPlan): Promise<{ removed: boolean | null; error: string | null }> {
    const errors: string[] = [];
    let removed: boolean | null = null;
    if (plan.promptPath !== null) {
      try {
        await unlink(plan.promptPath);
        removed = true;
      } catch (error) {
        removed = false;
        errors.push(`unlink: ${codeOf(error)}`);
      }
    }
    try {
      await rmdir(plan.dir);
    } catch (error) {
      errors.push(`rmdir: ${codeOf(error)}`);
    }
    return { removed, error: errors.length === 0 ? null : errors.join('; ') };
  }

  /** Spawns, drains, ends or waits, and reports. Never cleans the directory: the caller does, always. */
  async function performLaunch(plan: LaunchPlan, signal: AbortSignal): Promise<LaunchOutcome> {
    if (signal.aborted) throw new ProcessTransportError('aborted before launch', unstartedFacts());

    const startedAt = Date.now();

    // The listener goes on before anything is launched, so an abort that
    // fires between `launch` and the 'spawn' event, or while stdin is being
    // written, is held rather than lost: the races below consume it once
    // there is a child to end.
    let onAbort: (() => void) | null = null;
    const aborted = new Promise<'abort'>((resolve) => {
      onAbort = () => resolve('abort');
      signal.addEventListener('abort', onAbort, { once: true });
    });
    const abortDetail = (): string => `aborted while the child was running (${String(signal.reason)})`;

    let t: Tracked | null = null;
    try {
      const proc = launch(options.executable.path, plan.argv, { shell: false, detached: true, env, cwd: plan.dir, stdio: ['pipe', 'pipe', 'pipe'] });

      // A launch failure surfaces as an 'error' event with no pid; a success
      // as 'spawn'. Wait for one, so `started` is an observation.
      await new Promise<void>((resolve, reject) => {
        proc.once('spawn', resolve);
        proc.once('error', (error) => reject(new LaunchFailedError(codeOf(error))));
      });
      const pid = proc.pid;
      if (pid === undefined) throw new LaunchFailedError('no pid after spawn');

      let finish: () => void = () => {};
      const finished = new Promise<void>((resolve) => {
        finish = resolve;
      });
      const tracked_: Tracked = {
        pid,
        proc,
        exited: false,
        exitCode: null,
        exitSignal: null,
        signalsSent: [],
        signalledWhileAlive: false,
        processGroupMade: false,
        groupGone: null,
        terminating: null,
        escalationTimer: null,
        exit: new Promise<void>((resolve) => {
          proc.once('exit', (code, sig) => {
            tracked_.exited = true;
            tracked_.exitCode = code;
            tracked_.exitSignal = sig;
            if (tracked_.escalationTimer !== null) clearTimeout(tracked_.escalationTimer);
            resolve();
          });
        }),
        closed: false,
        close: new Promise<void>((resolve) =>
          proc.once('close', () => {
            tracked_.closed = true;
            resolve();
          }),
        ),
        finished,
        finish,
      };
      t = tracked_;
      // A late 'error' (for instance EPIPE-adjacent failures) must not crash the process.
      proc.on('error', () => {});
      // `detached` is a request; a group led by the child is an observation.
      t.processGroupMade = !observeGroupGone(t);
      tracked.add(t);

      // Bounded, concurrent drain of both streams. stdout is retained up to the
      // bound; stderr is counted. Reading continues past the bound so the child
      // is not blocked on a full pipe while it is being ended.
      const stdoutChunks: Buffer[] = [];
      let stdoutBytes = 0;
      let stderrBytes = 0;
      let retained = 0;
      let overflowed: (() => void) | null = null;
      const overflow = new Promise<'overflow'>((resolve) => {
        overflowed = () => resolve('overflow');
      });
      const note = (stream: 'stdout' | 'stderr', chunk: Buffer): void => {
        // What fits under the bound is kept, even from the chunk that crosses
        // it: a pipe hands over up to 64 KiB at once, and a small bound would
        // otherwise retain nothing of a child that wrote everything in one go.
        const room = Math.max(0, maxOutputBytes - (stdoutBytes + stderrBytes));
        if (stream === 'stdout') stdoutBytes += chunk.length;
        else stderrBytes += chunk.length;
        if (stream === 'stdout' && room > 0) {
          const kept = chunk.length > room ? chunk.subarray(0, room) : chunk;
          stdoutChunks.push(kept);
          retained += kept.length;
        }
        if (chunk.length > room) overflowed?.();
      };
      proc.stdout!.on('data', (chunk: Buffer) => note('stdout', chunk));
      proc.stderr!.on('data', (chunk: Buffer) => note('stderr', chunk));

      // The user message, then EOF. A child that exits without reading gives
      // EPIPE, which is its business, not a launch failure.
      proc.stdin!.on('error', () => {});
      proc.stdin!.end(plan.stdin ?? '');
      const stdinBytes = plan.stdin === null ? 0 : Buffer.byteLength(plan.stdin, 'utf8');

      let ended: string | null = null;
      let leftover = false;
      // `aborted` is first: an abort already held beats an exit already seen,
      // so a cancellation that arrived while the child was starting is a
      // cancellation, not an answer.
      const first = await Promise.race([aborted, t.exit.then(() => 'exit' as const), overflow]);
      if (first === 'abort') {
        ended = abortDetail();
        await terminate(t);
      } else if (first === 'overflow') {
        ended = `output_too_large: stdout+stderr exceeded ${maxOutputBytes} bytes`;
        await terminate(t);
      } else if (t.signalledWhileAlive) {
        // Ended from outside this launch — an escalation — before it answered.
        ended = `terminated by transport escalation (${t.signalsSent.join(', ')})`;
        if (t.terminating !== null) await t.terminating;
        else await awaitQuiet(t, termGraceMs);
      } else if (!observeGroupGone(t)) {
        // The child exited but something it started is still in the group:
        // ended and recorded, and the caller refuses the launch, so no
        // leftover is ever reported as an answer. An abort that lands while
        // the leftover is being ended is still the reason the launch gives.
        leftover = true;
        await terminate(t);
        if (signal.aborted) ended = abortDetail();
      }

      // Once the child is reaped and its group is gone, every writer this
      // transport can see is gone and the pipes close on their own — but a
      // process that left the group and kept the inherited pipes is outside
      // the group and outside what `-pid` can reach, so this wait is bounded
      // whatever was observed, and a give-up is a fact, never a hang. A
      // cancellation not yet consumed above still counts during the wait.
      const waits: Promise<'close' | 'abort'>[] = [t.close.then(() => 'close' as const)];
      if (ended === null) waits.push(aborted);
      const second = await bounded(Promise.race(waits), termGraceMs);
      if (second === 'abort') {
        ended = abortDetail();
        await terminate(t);
      }
      const streamsClosed = t.closed;
      if (!streamsClosed) {
        proc.stdout?.destroy();
        proc.stderr?.destroy();
        proc.stdin?.destroy();
      }

      const facts: ProcessFacts = {
        started: true,
        pid,
        exitCode: t.exitCode,
        signal: t.exitSignal,
        durationMs: Date.now() - startedAt,
        stdoutBytes,
        stderrBytes,
        promptFileBytes: plan.promptFileBytes,
        stdinBytes,
        promptFileRemoved: null,
        promptFileRemovalError: null,
        termination: terminationFacts(t),
      };
      return { facts, stdout: Buffer.concat(stdoutChunks, retained).toString('utf8'), ended, leftover, streamsClosed };
    } finally {
      if (onAbort !== null) signal.removeEventListener('abort', onAbort);
      if (t !== null) {
        tracked.delete(t);
        t.finish();
      }
    }
  }

  /**
   * One launch, start to finish: perform, clean up, report to `onLaunch`,
   * then answer or throw. Cleanup precedes the report so the record the
   * harness keeps says what became of the evidence on disk. A role launch
   * that needed a leftover ended, or that was given up on with its pipes
   * still held, is thrown here, after the report; a gate's leftover and
   * give-up are returned for `runGate` to block on, since a gate answers
   * with a verdict rather than an error unless it was itself aborted.
   */
  async function runPlanned(plan: LaunchPlan, signal: AbortSignal): Promise<{ facts: ProcessFacts; stdout: string; leftover: boolean; streamsClosed: boolean }> {
    let outcome: LaunchOutcome | null = null;
    let primary: unknown = null;
    try {
      outcome = await performLaunch(plan, signal);
    } catch (error) {
      primary = error;
    }
    const cleanup = await removeArtifacts(plan);
    if (outcome === null) {
      // Nothing started, or the launch failed before a child existed: the
      // error carries its own `started: false` facts. Cleanup failures ride
      // on those facts rather than replacing the error.
      const facts = (primary as { process?: ProcessFacts } | null)?.process;
      if (facts !== undefined && facts !== null) {
        facts.promptFileRemoved = cleanup.removed;
        facts.promptFileRemovalError = cleanup.error;
      }
      throw primary;
    }
    outcome.facts.promptFileRemoved = cleanup.removed;
    outcome.facts.promptFileRemovalError = cleanup.error;
    const record: LaunchRecord = {
      ...outcome.facts,
      kind: plan.kind,
      role: plan.role,
      index: plan.index,
      argv: [...plan.recordArgv],
      envNames: [...envNames],
      streamsClosed: outcome.streamsClosed,
    };
    if (options.onLaunch !== undefined) {
      try {
        options.onLaunch(record, outcome.stdout);
      } catch (error) {
        // A harness that already speaks the evidence-failure language keeps
        // its own name and identity — a subclass is its way of saying which
        // rule withheld the launch — and gains the facts only if it carried
        // none. Anything else is wrapped so the failure is still named.
        if (error instanceof EvidenceObservationFailedError) {
          if (error.process === undefined) (error as { process?: ProcessFacts }).process = outcome.facts;
          throw error;
        }
        throw new EvidenceObservationFailedError(
          `onLaunch refused the ${plan.kind} launch record: ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`,
          outcome.facts,
        );
      }
    }
    if (outcome.ended !== null) throw new ProcessTransportError(outcome.ended, outcome.facts);
    if (plan.kind === 'role') {
      // A role launch is an answer only when the child finished the way an
      // answer would claim: nothing left in its group, and every holder of
      // its pipes gone. Either failing is refused here, after the report, so
      // the facts are on record and the output is evidence, not an answer.
      // Both are named when both happened.
      const refusals: string[] = [];
      if (outcome.leftover) {
        const signals = outcome.facts.termination?.signalsSent.join(', ') ?? '';
        refusals.push(
          `leftover_processes_terminated: the child exited (code ${outcome.facts.exitCode ?? 'null'}) but its process group still held processes, which were ended (signals [${signals}])`,
        );
      }
      if (!outcome.streamsClosed) refusals.push(streamsNotClosedDetail(outcome.facts));
      if (refusals.length > 0) throw new ProcessTransportError(`${refusals.join('; ')}; the output is not taken for an answer`, outcome.facts);
    }
    return { facts: outcome.facts, stdout: outcome.stdout, leftover: outcome.leftover, streamsClosed: outcome.streamsClosed };
  }

  /** The full facts of a give-up, in words: what was observed of the child, and what was not. */
  function streamsNotClosedDetail(facts: ProcessFacts): string {
    const termination =
      facts.termination === null
        ? 'no termination sent, group observed gone'
        : `termination signals [${facts.termination.signalsSent.join(', ')}], childReaped ${facts.termination.childReaped}, groupGone ${String(facts.termination.groupGone)}`;
    return `streams_not_closed: the child (pid ${facts.pid ?? 'null'}) is finished (exit code ${facts.exitCode ?? 'null'}, signal ${facts.signal ?? 'null'}, ${termination}) but its stdout and stderr were still held by a process outside its group when the bounded wait of ${termGraceMs} ms gave up, so the pipes were destroyed on this side and every holder of them is unaccounted for`;
  }

  async function assertPin(): Promise<void> {
    const mismatch = await verifyExecutablePin(options.executable);
    if (mismatch !== null) throw new ExecutablePinMismatchError(mismatch);
  }

  const transport = async (request: ProviderHttpRequest, signal: AbortSignal): Promise<ProviderHttpResponse> => {
    if (request.url !== CLI_TRANSPORT_URL) throw new WrongTransportError(request.url);
    const spec = parseLaunchSpec(request.body);
    // The profile's settings, where it states them, are the only ones a role
    // launches under: compared before the pin, the directory and the prompt
    // file, so a refusal leaves nothing behind (a parent decision, Task 5a).
    const effectiveSettings = spec.settings ?? DEFAULT_LAUNCH_SETTINGS;
    if (options.settings !== undefined && effectiveSettings !== options.settings) throw new LaunchSettingsMismatchError(effectiveSettings, options.settings);
    // The profile's permission mode, where it states one, likewise: compared before the pin, so a refusal leaves nothing.
    if (options.permissionMode !== undefined && spec.permissionMode !== options.permissionMode) throw new LaunchPermissionModeMismatchError(spec.permissionMode ?? null, options.permissionMode);
    await assertPin();
    if (signal.aborted) throw new ProcessTransportError('aborted before launch', unstartedFacts());

    const dir = await makeLaunchDir();
    const promptPath = join(dir, PROMPT_FILE_NAME);
    const plan: LaunchPlan = {
      kind: 'role',
      role: spec.role ?? null,
      index: spec.index ?? null,
      argv: roleArgv(spec, promptPath),
      recordArgv: roleArgv(spec, PROMPT_FILE_PLACEHOLDER),
      stdin: spec.userMessage,
      dir,
      promptPath: null,
      promptFileBytes: null,
    };
    try {
      const handle = await open(promptPath, 'wx', 0o600);
      plan.promptPath = promptPath;
      try {
        await handle.writeFile(spec.systemPrompt, 'utf8');
      } finally {
        await handle.close();
      }
      plan.promptFileBytes = Buffer.byteLength(spec.systemPrompt, 'utf8');
    } catch (error) {
      await removeArtifacts(plan);
      throw new LaunchFailedError(`prompt file not written (${codeOf(error)})`);
    }

    const { facts, stdout } = await runPlanned(plan, signal);
    const envelope: CliEnvelope = { exitCode: facts.exitCode, signal: facts.signal, stdout, stderrBytes: facts.stderrBytes };
    return { status: 0, headers: {}, body: JSON.stringify(envelope), process: facts };
  };

  const runGate = async (signal: AbortSignal): Promise<GateResult> => {
    await assertPin();
    if (signal.aborted) throw new ProcessTransportError('aborted before launch', unstartedFacts());
    const dir = await makeLaunchDir();
    const plan: LaunchPlan = {
      kind: 'gate',
      role: null,
      index: null,
      argv: [...GATE_ARGV],
      recordArgv: [...GATE_ARGV],
      stdin: null,
      dir,
      promptPath: null,
      promptFileBytes: null,
    };
    const { facts, stdout, leftover, streamsClosed } = await runPlanned(plan, signal);
    const verdict = evaluateGateOutput(stdout, facts, gateRules);
    // A gate that left a process behind, or whose pipes were still held when
    // it was given up on, blocks under its own name beside whatever the
    // process facts already said: the facts were recorded, and the verdict
    // says why the answer is not taken. A gate is the check that no role
    // starts under an unaccounted-for process; it cannot pass under one.
    if (leftover) verdict.reasons.push('leftover_processes_after_exit');
    if (!streamsClosed) verdict.reasons.push('streams_not_closed');
    if (leftover || !streamsClosed) verdict.pass = false;
    return { ...verdict, process: facts };
  };

  const escalate = (): void => {
    for (const t of tracked) {
      if (t.exited) continue;
      if (!t.signalsSent.includes('SIGTERM')) signalGroup(t, 'SIGTERM');
      if (t.escalationTimer === null && !t.signalsSent.includes('SIGKILL')) {
        t.escalationTimer = setTimeout(() => {
          t.escalationTimer = null;
          if (!t.exited) signalGroup(t, 'SIGKILL');
        }, termGraceMs);
        t.escalationTimer.unref();
      }
    }
  };

  const drain = async (): Promise<void> => {
    // The longest a launch can take once signalled: TERM grace, KILL grace,
    // then the bounded wait for the pipes. `finished` resolves after that
    // wait, so a stream wait still pending when the drain starts is inside
    // the bound, never beyond it.
    const bound = termGraceMs + killGraceMs + termGraceMs;
    await Promise.all([...tracked].map((t) => bounded(t.finished, bound)));
  };

  return Object.assign(transport, { runGate, activeChildren: () => tracked.size, escalate, drain });
}
