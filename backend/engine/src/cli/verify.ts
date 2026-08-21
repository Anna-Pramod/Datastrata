/**
 * `npm run verify` — the one entry point the verification CLIs are reached
 * through, and the only place in this layer that talks to the process.
 *
 * Everything below it returns a `CliOutcome` rather than exiting, so the
 * exit-code mapping is a value tests assert on instead of a side effect they
 * would have to spawn a process to observe. This file is the thin edge that
 * turns that value into a shell result: parse `process.argv`, dispatch, print,
 * exit. Keeping it to that is what stops the mapping from becoming untestable.
 *
 * ```
 * npm run verify -- sign   <packId> <requirementId> --by "<name>" [--kind ratified] [--on YYYY-MM-DD] [--note "<text>"]
 * npm run verify -- revoke <packId> <requirementId> --revokes <entryId> --by "<name>" --reason "<text>" [--on YYYY-MM-DD]
 * npm run verify -- sheet  <packId> [--out <path>] [--golden <path>]
 * ```
 *
 * **`sheet` takes no `--by`, and that is a difference in kind rather than a
 * convenience.** `sign` and `revoke` write a line into an append-only ledger,
 * and a line with nobody's name on it means nothing. `sheet` writes a
 * generated, git-ignored file that asserts nothing and is authoritative over
 * nothing; demanding a signer's name for it would imply otherwise. So it is
 * separated out before the arguments the two writing commands share, not after.
 *
 * Exit codes are the contract; see `exit-codes.ts` for what each one means and
 * why "you may not sign this yet" and "this repository is damaged" must not
 * share a number.
 *
 * **`--on` defaults to the UTC date.** UTC rather than local, on purpose: the
 * ledger's `on` is `display + audit` and is compared by nobody, so what it must
 * be is *stable* — two signers in different time zones on the same instant
 * should write the same date, and a machine crossing local midnight should not
 * make an otherwise identical operation look like a different day. (Task 1
 * found the public checker's date carrying the same UTC-versus-local split as an
 * accident rather than a decision; here it is the decision.)
 *
 * **`--skip-suite` exists and is not a convenience.** A signature over a red
 * build attests to nothing, so the suite runs by default and its result feeds
 * the gate. The flag is for the one case where running it here is impossible —
 * an outer harness that is *already* the test run — and it says so in its own
 * name rather than quietly defaulting to trust.
 */

import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runRevoke } from './revoke';
import { runSheet } from './review-sheet';
import { runSign, type VerifyPaths } from './sign';
import { EXIT_USAGE, type CliOutcome } from './exit-codes';

const here = dirname(fileURLToPath(import.meta.url));
const engineRoot = join(here, '..', '..');

const USAGE = [
  'Usage:',
  '  npm run verify -- sign   <packId> <requirementId> --by "<name>" [--kind verified|ratified] [--on YYYY-MM-DD] [--note "<text>"] [--skip-suite]',
  '  npm run verify -- revoke <packId> <requirementId> --revokes <entryId> --by "<name>" --reason "<text>" [--on YYYY-MM-DD]',
  '  npm run verify -- sheet  <packId> [--out <path>] [--golden <path>]',
  '',
  'Exit codes: 0 success · 1 refused · 2 integrity failure · 3 forensics required · 64 usage',
];

/**
 * The two paths only the review sheet needs, supplied by whoever knows where
 * the engine root is.
 *
 * They are a parameter rather than a constant because `dispatch` is called from
 * tests that point every read and every write at a temp directory, and because
 * `goldenProfilesPath` names a *test* file — a dependency worth keeping visible
 * at the call site instead of buried in the generator.
 */
export interface SheetDefaults {
  /** Where the sheet lands unless `--out` overrides it. */
  outPath: string;
  /** The golden-profile suite's source, unless `--golden` overrides it. */
  goldenProfilesPath: string;
}

/** `--name value` pairs and bare `--flag` switches, in one pass. */
export function parseFlags(argv: string[]): {
  positional: string[];
  flags: Record<string, string | true>;
} {
  const positional: string[] = [];
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === undefined || token === '--') continue;
    if (!token.startsWith('--')) {
      positional.push(token);
      continue;
    }
    const name = token.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      flags[name] = true;
      continue;
    }
    flags[name] = next;
    i += 1;
  }
  return { positional, flags };
}

/** The UTC date, in the form the ledger records. See the file header on why UTC. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Runs the suite and reports whether it is green.
 *
 * Never called from `runSign` itself: a `runSign` that shelled out to `npm test`
 * could not be called from inside `npm test`, which is where every test of it
 * runs.
 */
function suiteIsGreen(): boolean {
  try {
    execFileSync('npm', ['test'], { cwd: engineRoot, stdio: 'inherit' });
    return true;
  } catch {
    return false;
  }
}

function stringFlag(flags: Record<string, string | true>, name: string): string | null {
  const value = flags[name];
  return typeof value === 'string' ? value : null;
}

export function dispatch(
  argv: string[],
  paths: VerifyPaths,
  suiteGreen: () => boolean,
  sheetDefaults?: SheetDefaults,
): CliOutcome {
  const { positional, flags } = parseFlags(argv);
  const [command, packId, requirementId] = positional;

  if (command !== 'sign' && command !== 'revoke' && command !== 'sheet') {
    return {
      exitCode: EXIT_USAGE,
      lines: [command === undefined ? 'No subcommand given.' : `Unknown subcommand: ${command}`, ...USAGE],
    };
  }

  // `sheet` reads and writes nothing anybody signs, so it takes neither a
  // requirementId nor a `--by`. Split before the shared checks below.
  if (command === 'sheet') {
    if (packId === undefined) {
      return { exitCode: EXIT_USAGE, lines: ['A packId is required.', ...USAGE] };
    }
    if (sheetDefaults === undefined) {
      return {
        exitCode: EXIT_USAGE,
        lines: ['No output path or golden-profile path was supplied to the dispatcher.', ...USAGE],
      };
    }
    return runSheet(
      { packId },
      {
        ...paths,
        outPath: stringFlag(flags, 'out') ?? sheetDefaults.outPath,
        goldenProfilesPath: stringFlag(flags, 'golden') ?? sheetDefaults.goldenProfilesPath,
      },
    );
  }

  if (packId === undefined || requirementId === undefined) {
    return { exitCode: EXIT_USAGE, lines: ['A packId and a requirementId are required.', ...USAGE] };
  }

  const by = stringFlag(flags, 'by');
  if (by === null) {
    return { exitCode: EXIT_USAGE, lines: ['--by is required: a signature names the person behind it.', ...USAGE] };
  }
  const on = stringFlag(flags, 'on') ?? today();

  if (command === 'revoke') {
    const revokes = stringFlag(flags, 'revokes');
    const reason = stringFlag(flags, 'reason');
    if (revokes === null || reason === null) {
      return {
        exitCode: EXIT_USAGE,
        lines: ['--revokes and --reason are both required for a revocation.', ...USAGE],
      };
    }
    return runRevoke({ packId, requirementId, revokes, by, reason, on }, paths);
  }

  const kind = stringFlag(flags, 'kind') ?? 'verified';
  if (kind !== 'verified' && kind !== 'ratified') {
    return { exitCode: EXIT_USAGE, lines: [`--kind must be verified or ratified, not ${kind}.`, ...USAGE] };
  }
  const note = stringFlag(flags, 'note');

  return runSign(
    {
      packId,
      requirementId,
      by,
      kind,
      on,
      ...(note === null ? {} : { note }),
      testSuiteGreen: flags['skip-suite'] === true ? true : suiteGreen(),
    },
    paths,
  );
}

/* c8 ignore start — the process edge: argv in, lines out, exit code out. */
if (process.argv[1] !== undefined && process.argv[1].endsWith('verify.ts')) {
  const argv = process.argv.slice(2);
  const { positional } = parseFlags(argv);
  const paths: VerifyPaths = {
    packDir: join(engineRoot, 'knowledge', positional[1] ?? ''),
    corpusDir: join(engineRoot, 'corpus'),
    verificationDir: join(engineRoot, 'verification'),
  };
  const outcome = dispatch(argv, paths, suiteIsGreen, {
    outPath: join(engineRoot, 'review-sheet.html'),
    goldenProfilesPath: join(engineRoot, 'test', 'golden-profiles.test.ts'),
  });
  for (const line of outcome.lines) console.log(line);
  process.exit(outcome.exitCode);
}
/* c8 ignore stop */
