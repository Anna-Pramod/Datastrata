/**
 * The deployable verification-state closure — the one place it is declared.
 *
 * Design §4.1. Listing "corpus, ledger, results" as the files that happen to
 * exist would repeat the mistake that produced §2.1: a set enumerated from what
 * was known at the time, which silently stops being complete. So each member
 * below is named by **what it is for**, and its globs are the current spelling
 * of that purpose. When a path convention moves, the glob moves and the member
 * stays; when a new kind of state becomes load-bearing for the public answer, a
 * new member is added rather than a glob quietly widened.
 *
 * This module is plain `.mjs` rather than TypeScript because `next.config.mjs`
 * is loaded by Next before any TypeScript compilation exists and cannot import
 * the engine's sources. It is therefore the only declaration both the build
 * configuration and the tests can share, which is the entire point: two lists
 * would be two closures, and the narrower one would become the real one.
 *
 * **Declared, and now derived from behaviour.** These five were written from
 * the design's semantics while the public freshness resolver did not yet exist,
 * when only `authored-knowledge` and `version-integrity-registry` were read by
 * the running program. The resolver landed at plan Task 2, and
 * `test/verification-read-coverage.test.ts` now instruments the reads the site
 * actually performs over a repository that holds verification state, and
 * asserts every one of them is matched by a glob below — with the recorded set
 * required to span the members the *resolver* owns, since a run over a
 * repository with nothing signed would record only the loader's own subset and
 * prove nothing about the rest.
 *
 * That test is the fast inner loop, not the evidence. A check run inside the
 * repository cannot prove a file reached the standalone artifact, because the
 * repository masks the answer; `npm run test:standalone` is where that is
 * settled (design §4.2).
 *
 * Globs are relative to the Next app directory (`frontend/web`), which is what
 * `outputFileTracingIncludes` resolves them against; `outputFileTracingRoot` is
 * the repository root, so the traced tree mirrors the repository beneath it.
 */

/**
 * @typedef {object} VerificationRuntimeInput
 * @property {string} member    Stable identifier, used by tests to assert a
 *                              recorded read spans more than the loader's own
 *                              subset (plan Task 2, behaviour 8).
 * @property {string} purpose   What this state is *for* in deriving the public
 *                              answer. The member's definition; the globs are
 *                              merely how it is spelled today.
 * @property {'fatal'|'silent'} onAbsence
 *                              How the runtime behaves when the member does not
 *                              reach the artifact. `fatal` members are caught by
 *                              the liveness half of the deployment gate;
 *                              `silent` members degrade into a wrong answer with
 *                              a 200, and are why design §4.3 needs an agreement
 *                              half as well. `fatal` is observed rather than
 *                              assumed for the version registry (the uncorrected
 *                              standalone artifact failed on it) and for the
 *                              pinned results (an absent result raises
 *                              `IntegrityFailureError` out of the resolver, and
 *                              the route refuses); for the remaining members it
 *                              follows from the design's resolver contract — a
 *                              resolver that cannot complete its check throws
 *                              rather than reporting ignorance. `silent` is the
 *                              ledger alone, and stays a claim about the loader
 *                              rather than about the artifact until Task 3's
 *                              agreement half exists to catch it.
 * @property {string[]} globs
 */

/** @type {readonly VerificationRuntimeInput[]} */
export const VERIFICATION_RUNTIME_INPUTS = Object.freeze([
  {
    member: 'authored-knowledge',
    purpose:
      'The pack itself — manifest, requirements, sources, fact types, catalogues, ' +
      'obligation templates, questionnaire and gap tests. Without it there is no ' +
      'content whose verification status could be in question.',
    onAbsence: 'fatal',
    globs: ['../../backend/engine/knowledge/**/*.json'],
  },
  {
    member: 'version-integrity-registry',
    purpose:
      'The digest recorded against each requirement\'s declared version. ' +
      '`assertRequirementVersions` reads `verification/requirement-versions/<packId>.json` ' +
      'through a computed `join(dir, …)` no static analysis can follow, and treats ' +
      'absence as a `VersionIntegrityError` rather than a skipped check — deliberately, ' +
      'because an integrity check switched off by deleting a file is not an integrity ' +
      'check. Observed, not predicted: the uncorrected standalone artifact failed on ' +
      'exactly this member. See `npm run test:standalone`.',
    onAbsence: 'fatal',
    globs: ['../../backend/engine/verification/requirement-versions/**/*.json'],
  },
  {
    member: 'signature-ledger',
    purpose:
      'The append-only record of what has been signed, and by whom, at ' +
      '`verification/signatures.jsonl`. Every requirement\'s derived status is a ' +
      'projection over it. An absent ledger reads as *empty* rather than failing, so ' +
      'an untraced ledger degrades silently: the deployed site would report every ' +
      'requirement unsigned while the repository holds signatures, and answer 200 ' +
      'while doing it.',
    onAbsence: 'silent',
    globs: ['../../backend/engine/verification/signatures.jsonl'],
  },
  {
    member: 'corpus-state-for-freshness',
    purpose:
      'The document state a signature was taken against, and which freshness is ' +
      'evaluated relative to: the index carrying each document\'s pinned digests and ' +
      'normalizer version, the normalized text those digests are over, and the ' +
      '**retained raw bytes**. The raw bytes are not optional and not an ' +
      'optimisation — `resolveNormalizerChanged` narrows a normalizer version ' +
      'difference from a pack-wide false alarm to a real one by renormalising the ' +
      'retained bytes and comparing. Without them in the artifact the resolver ' +
      'cannot perform that narrowing, and the only ways to proceed are to fail or to ' +
      'report drift that did not happen. **The trace follows the freshness ' +
      'derivation, never the reverse**: freshness is not weakened to make this ' +
      'member smaller.',
    onAbsence: 'fatal',
    globs: [
      '../../backend/engine/corpus/index.json',
      '../../backend/engine/corpus/normalized/**/*',
      '../../backend/engine/corpus/raw/**/*',
    ],
  },
  {
    member: 'pinned-verification-results',
    purpose:
      'The verification result each signature is over, at ' +
      '`verification/<packId>/<requirementId>/verification-result.json`. The ledger ' +
      'entry pins a `resultSha256`; without the result itself there is nothing to ' +
      'hash, so a signature\'s freshness cannot be established from the artifact ' +
      'alone.',
    onAbsence: 'fatal',
    globs: ['../../backend/engine/verification/*/*/verification-result.json'],
  },
]);

/**
 * The flat glob list `outputFileTracingIncludes` wants.
 *
 * A projection of the declaration above, never a second list to keep in step
 * with it. `next.config.mjs` calls this; a test that needs to know *which*
 * member a glob belongs to reads `VERIFICATION_RUNTIME_INPUTS` instead.
 *
 * @returns {string[]}
 */
export function verificationTracingGlobs() {
  return VERIFICATION_RUNTIME_INPUTS.flatMap((input) => input.globs);
}
