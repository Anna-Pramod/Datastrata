/**
 * The exit codes the verification CLIs speak, in one place because they are a
 * contract with whoever scripts them.
 *
 * A caller automating `verify` has to be able to tell **"you may not sign this
 * yet"** from **"this repository is damaged"** without parsing prose. Those are
 * different situations with different responses — the first is repaired by
 * fixing the dossier, the second by an investigation — and a CLI that returns
 * `1` for both forces the script to guess, or worse, to retry.
 *
 * So four codes, each naming a distinct condition:
 *
 * | Code | Meaning |
 * |---|---|
 * | `0`  | the operation succeeded and was verified after the write |
 * | `1`  | refused: a precondition of signing is not met yet |
 * | `2`  | integrity failure: signed or pinned state is missing, contradicted, or was overtaken |
 * | `3`  | forensics required: the ledger itself cannot be read, so its history is in question |
 *
 * `64` sits deliberately outside that set. It is sysexits' `EX_USAGE`, and it
 * exists so that "you typed the command wrong" can never be mistaken for "you
 * may not sign this yet": a wrong requirement id is a fact about the invocation,
 * not about the repository, and folding it into `1` would let a typo read as a
 * refusal that a script might then try to work around.
 *
 * These are constants rather than an enum so the numbers themselves are the
 * interface — the shell sees a number, and a `const enum` would hide which one.
 */

/** The operation succeeded, and the post-write verification agreed. */
export const EXIT_OK = 0;

/**
 * Refused. Every reason is printed, never the first: a signer fixing one
 * problem at a time learns the next only after re-running, which costs a full
 * cycle per defect. Refusal is the feature.
 */
export const EXIT_REFUSED = 1;

/**
 * Integrity failure — factory §4.4's separate category, kept separate here.
 *
 * A pinned result that has vanished, a document a signature pins but the corpus
 * no longer holds, a requirement whose content moved without a version bump, or
 * a post-write check finding that some *other* entry became governing. In an
 * append-only, git-tracked repository none of these happens through ordinary
 * drift, so filing them beside "not ready yet" would understate them.
 */
export const EXIT_INTEGRITY_FAILURE = 2;

/**
 * Forensics required — the ledger cannot be read at all.
 *
 * A tampered `entryId`, a blank line, a revocation naming no earlier entry: any
 * of these fails the whole load, because an append-only file nothing may
 * rewrite must not be partially readable. Nothing can be appended to a history
 * that cannot be read, `revoke` included. That is correct rather than a gap:
 * record design §3 guarantees a revocation carries no *verification pins*, so
 * withdrawal does not depend on a recomputable corpus or an intact result file
 * — it is not a guarantee that a compromised ledger stays writable.
 */
export const EXIT_FORENSICS_REQUIRED = 3;

/**
 * The invocation itself was wrong: an unknown subcommand, a missing argument, a
 * requirement the pack does not carry. Outside the four above, on purpose.
 * `64` is `EX_USAGE` from sysexits(3).
 */
export const EXIT_USAGE = 64;

/**
 * What a CLI entry point returns: a code for the shell and the lines a person
 * reads.
 *
 * The lines are returned rather than printed so the operation is testable as a
 * value. Printing them and calling `process.exit` is the outermost layer's job,
 * and keeping that layer to one line is what stops the exit-code mapping from
 * only being exercisable by spawning a process.
 */
export interface CliOutcome {
  exitCode: number;
  lines: string[];
}
