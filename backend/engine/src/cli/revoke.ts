/**
 * The revoke CLI — the sanctioned way a human withdraws a signature.
 *
 * Record design §3: *"A ledger whose only supported mutation is one of its two
 * variants invites the other to be produced by text editor, which is how a
 * malformed line reaches an append-only file that nothing can rewrite."* This
 * file exists so that appending a revocation by hand is never the only way to
 * create one.
 *
 * **It reads almost nothing, deliberately.** No pack, no corpus, no closure, no
 * verification result. A revocation carries no verification pins, and that is
 * the point: withdrawal matters most exactly when the corpus is broken, the
 * result file has been deleted, or the encoding has drifted. Requiring a fresh
 * verification-shaped payload would make withdrawing a signature depend on the
 * very thing being withdrawn. So the only input is the ledger itself, and the
 * only checks are the four §3 states — target exists, appears earlier, shares
 * the pack and requirement, and is a signature rather than another revocation —
 * plus the two authority fields the entry itself must carry.
 *
 * **`by` and `reason` are refused here, blank, before the append.** They join
 * the same `problems` list as the §3 states rather than forming a second policy
 * beside it, so one re-run still answers every objection at once. The ledger
 * schema rejects a blank of either on the way back in, which is what catches a
 * line written by hand; this is what stops the sanctioned path from creating
 * one, in a file where the alternative to refusing is a permanent bad entry.
 *
 * **But it does refuse on an unreadable ledger, and that is not a contradiction
 * of the paragraph above.** A tampered `entryId` fails the whole load, so there
 * is no history to append to and no target to resolve `revokes` against. Spec §3
 * guarantees that a revocation needs no recomputable corpus and no intact result
 * file; it never guaranteed that a compromised ledger stays writable. The
 * situation is surfaced as **forensics required**, with its own exit code and a
 * message saying the history itself is in question — distinct from an ordinary
 * refusal, because the response is an investigation rather than a repair.
 *
 * **The four checks run here as well as at load**, and the duplication is
 * wanted. `verifyLedgerIntegrity` enforces them on every subsequent read, which
 * means a bad revocation appended anyway would render the whole ledger
 * unreadable — permanently, in a file nothing may rewrite. Catching it before
 * the write is the difference between a refused command and a repository that
 * needs forensics.
 *
 * **Then the same post-write read as signing**, against the revoked triple:
 * the governing entry is the one just written, `derivedStatus` is `draft`, and
 * `statusReasons` contains `revoked`. Never `derivedStatus === kind` — a
 * revocation has no freshness to assert and must not be measured against a
 * status it never claims.
 */

import { appendFileSync } from 'node:fs';

import { canonicalJson } from '../verification/canonical';
import { carriesAuthority, entryId, type RevocationEntry } from '../verification/ledger';
import { EXIT_REFUSED, type CliOutcome } from './exit-codes';
import {
  ledgerPath,
  outcomeFor,
  readLedgerOrFail,
  verifyAfterWrite,
  type VerifyPaths,
  type WriteHooks,
} from './sign';

export interface RevokeArgs {
  packId: string;
  requirementId: string;
  /** The `entryId` of the signature being withdrawn. */
  revokes: string;
  by: string;
  /** Free text. A withdrawal without a stated reason is a fact nobody can audit. */
  reason: string;
  /** The date of the withdrawal. Supplied rather than read, so the operation is reproducible. */
  on: string;
}

/**
 * Withdraws one signature, or explains why it may not be withdrawn.
 *
 * Returns rather than exits, so the exit-code mapping is a value a test can
 * assert on.
 */
export function runRevoke(
  args: RevokeArgs,
  paths: VerifyPaths,
  hooks: WriteHooks = {},
): CliOutcome {
  let entries;
  try {
    entries = readLedgerOrFail(paths);
  } catch (error) {
    const mapped = outcomeFor(error);
    if (mapped !== null) return mapped;
    throw error;
  }

  // Every problem, not the first: an operator correcting one argument at a time
  // learns the next only after re-running.
  const problems: string[] = [];
  const target = entries.find((entry) => entry.entryId === args.revokes);

  if (target === undefined) {
    problems.push(
      `revokes ${args.revokes}, which names no entry in the ledger; a revocation must identify the historical decision it withdraws`,
    );
  } else if (target.kind === 'revoked') {
    problems.push(
      `revokes ${args.revokes}, which is itself a revocation; un-revoking is expressed by appending a fresh signature, never by revoking a revocation`,
    );
  } else {
    if (target.packId !== args.packId) {
      problems.push(
        `revokes an entry in pack ${target.packId}, but the revocation names pack ${args.packId}`,
      );
    }
    if (target.requirementId !== args.requirementId) {
      problems.push(
        `revokes an entry for requirement ${target.requirementId}, but the revocation names requirement ${args.requirementId}`,
      );
    }
  }

  // The two authority fields, refused here rather than discovered on the next
  // read. The predicate is `carriesAuthority`, the same one the ledger schema
  // applies, imported rather than restated so a blank the CLI lets through and
  // a blank the reader rejects cannot become two different sets.
  if (!carriesAuthority(args.by)) {
    problems.push('carries no signatory; a withdrawal nobody can attribute is not a record of one');
  }

  if (!carriesAuthority(args.reason)) {
    problems.push('carries no reason; a withdrawal nobody can account for is not a record of one');
  }

  if (problems.length > 0) {
    return {
      exitCode: EXIT_REFUSED,
      lines: [
        'REFUSED — the revocation would make the ledger unreadable, so it is not written.',
        ...problems.map((problem) => `  - ${problem}`),
      ],
    };
  }

  const unsigned: Omit<RevocationEntry, 'entryId'> = {
    kind: 'revoked',
    packId: args.packId,
    requirementId: args.requirementId,
    revokes: args.revokes,
    by: args.by,
    on: args.on,
    reason: args.reason,
  };
  const entry: RevocationEntry = { ...unsigned, entryId: entryId(unsigned) };

  appendFileSync(ledgerPath(paths), `${canonicalJson(entry)}\n`, 'utf8');
  const lines = [
    `Withdrew ${args.revokes}.`,
    `Appended ${entry.entryId} to ${ledgerPath(paths)}.`,
  ];

  hooks.onAppended?.();

  try {
    const verified = verifyAfterWrite(paths, args.packId, args.requirementId, {
      entryId: entry.entryId,
      kind: 'revoked',
    });
    return { exitCode: verified.exitCode, lines: [...lines, ...verified.lines] };
  } catch (error) {
    const mapped = outcomeFor(error);
    if (mapped !== null) return { exitCode: mapped.exitCode, lines: [...lines, ...mapped.lines] };
    throw error;
  }
}
