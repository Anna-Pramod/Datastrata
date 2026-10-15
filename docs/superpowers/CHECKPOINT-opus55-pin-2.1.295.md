# Checkpoint — `claude-code-cli@2` re-pinned to a preserved copy of Claude Code 2.1.295, on `8b25dc8`

Written 2026-10-15 from the working tree of the candidate worktree
`/Users/vivin/Documents/DataStrata/b1b-opus55-candidate` (branch
`feature/opus55-subscription-migration`, HEAD `8b25dc8`), by the subagent that
made the change, after the parent had located, verified, copied and
statically rechecked the bundle. Every log named here is in the review
directory `/Users/vivin/Documents/DataStrata/pilot-evidence/2026-10-15-opus55-pin-replacement/`
(R below): the parent's are `parent-*`, this change's are `pin-impl-*`.
*Parent-verified* means run or read by the parent, as its log in R records;
*checked here* means run by this change's author, with the log named.
Nothing is committed: the user runs every `git add` and `git commit`. The
work was offline: no Claude Code or `ollama` binary was run, and there was
no authentication, inference, probe, rehearsal, S-002 run, promotion or
signing.

**What this is.** A pin replacement. `CLAUDE_CODE_CLI_V2_PROFILE.pin` moves
from the desktop-managed 2.1.280, absent from the desktop-managed directory
(attributed to the updater's pruning, which D-4 predicted), to a preserved,
read-only copy of the desktop-managed 2.1.295 bundle, kept outside the
updater's directory. The adapter's declared invocation and the
`@2` identity move with it, as D-3 requires. **What it is not.** No
acceptance rule, allowlist, classification or launch control changes. Every
difference the static recheck found is recorded here and none is acted on.
`@1` and the HTTP adapter are untouched.

## Why the pin moved

- On 2026-10-14T21:45Z the migration checkpoint found the pinned 2.1.280
  absent. The desktop app's `claude-code` directory held only
  `2.1.295/9d6405864fdc/` (`CHECKPOINT-opus55-migration.md`, §The pin
  today), so every `@2` execution would have been refused at the pin check.
- The user decided to pin a preserved copy of an already-installed official
  bundle, outside the updater's directory (that checkpoint's open decision
  1; reported by the parent, from the user's instruction of 2026-10-15). No
  download and no installer run was needed.

## The bundle and its copy (parent-verified; nothing executed)

- **Inventory** (`parent-bundle-inventory.20261015T072250Z.log`). On
  2026-10-15 the desktop app's `claude-code` directory held only
  `2.1.295/9d6405864fdc/`: `claude.app` and a 64-byte `.verified` marker. The
  standalone versions directory held only 2.1.226 (the `@1` pin, which
  `~/.local/bin/claude` links to). No other install was found among the
  desktop app bundle, npm and Homebrew globals, so no other installed build
  at or above 2.1.280 exists. The shell's `grep` and `find` wrappers name
  the desktop's 2.1.295 executable.
- **Provenance** (`parent-bundle-provenance.20261015T072308Z.log`).
  - `Info.plist`: `CFBundleIdentifier` `com.anthropic.claude-code`, version
    2.1.295, `LSMinimumSystemVersion` 13.0.
  - `.verified` holds
    `9d6405864fdc2c957d81adb0fcd0b42f568b4ccc1ab741ba9e5bed581a4f75eb`. Its
    first 12 characters name the directory; it is not the executable's hash.
  - The executable is a Mach-O 64-bit arm64 file of 239,695,888 bytes, with
    sha256 `494870c9763b5ea370b6165e7e04af589a7b2472bf0de18ffb25477f8230bdf6`.
  - It is signed "Developer ID Application: Anthropic PBC (Q6L2SF6YDW)"
    (TeamIdentifier Q6L2SF6YDW) at 8 Oct 2026 22:30:22 IST, codesign's
    local display (17:00:22Z, matching the file's local mtime in the same
    log), with its notarization ticket stapled. `codesign --verify --deep
    --strict` says "valid on disk" and "satisfies its Designated
    Requirement". That check was local, with no online flag.
- **Load commands** (`parent-bundle-loadcommands.20261015T072401Z.log`). A
  thin arm64 Mach-O that loads only system libraries under `/usr/lib`.
- **The build's embedded constants** (read statically; nothing ran):
  VERSION 2.1.295, which its init builder writes as `claude_code_version`;
  BUILD_TIME 2026-10-08T16:50:59Z; GIT_SHA
  `07e8f67ea3282bf154a9e05673a0942b1b173cef` (static recheck summary, item 7,
  as corrected by `parent-static-recheck-addendum-b.20261015T084920Z.log`:
  BUILD_TIME and GIT_SHA are constants embedded in the build, not fields of
  the init event).
- **The copy** (`parent-bundle-copy.20261015T072420Z.log`). The whole version
  directory was copied with ditto (the parent's command; the log records its
  exit status) to
  `~/.local/share/datastrata/claude-code/2.1.295/`, a destination that did
  not exist before, so nothing was overwritten. All five files are
  hash-identical to the source. Entry lists, types, modes and sizes are
  identical, and there are no symlinks. The copy's signature verifies
  locally.
- **Preserved** (`parent-bundle-preserve.20261015T072434Z.log`). The copy
  was made read-only with `chmod -R a-w`, and a write into it is refused. A
  manifest, `~/.local/share/datastrata/claude-code/2.1.295.sha256`, was
  written beside it, and the copy checks against it (all five files OK).

## Still `@2`: the execution history (parent-verified, `parent-execution-history.20261015T072222Z.log`)

`@2` code exists only in commit `8b25dc8` (`git log --all -S
CLAUDE_CODE_CLI_V2_ADAPTER`), and only the candidate worktree has its branch
checked out. The candidate's execution root, `backend/engine/test/live-executions`,
does not exist. No `execution.json` under `pilot-evidence` names
`claude-code-cli@2`, and no launch record there names 2.1.280, 2.1.295 or
`claude-opus-5-5`. So no `@2` execution has occurred, and D-4's rule ("it can
still be `@2` if no `@2` execution exists yet") keeps the adapter version at
`2`.

## The static recheck of 2.1.295 (parent-verified, `parent-static-recheck-summary.20261015T073247Z.log`)

The parent read the preserved copy's bytes with Python and executed nothing.
The four scans are `parent-static-scan.20261015T072615Z.log` (with its
`.json`), `-b.20261015T072741Z`, `-c.20261015T072917Z` and
`-d.20261015T072959Z`. "Confirmed" means stated by the build's own code,
schema or help text. It does not mean observed at runtime.

**Confirmed: the ten facts the recheck covered (summary items 1-10), still
stated by 2.1.295.** These are the facts it rechecked, not every fact
recorded for 2.1.280: one, below, was not rechecked.

1. The catalog has a `claude-opus-5-5` row with the effort capabilities,
   and its thinking cannot be disabled. The selector's default effort for it
   is "medium", so `--effort high` is still needed.
2. The row's output limit is 128000 (default and upper), and
   `CLAUDE_CODE_MAX_OUTPUT_TOKENS` is read against it, so 64,000 lies within
   it.
3. The context window is 1e6, with the `[1m]` alias. The
   `long_context_credits_required` text about the 200K boundary is there,
   and so is a 200K credits clamp.
4. `StructuredOutput` is the tool name, `--json-schema` takes a JSON object,
   and the result carries `structured_output`.
5. The refusal-fallback gate is unchanged. `switchModelsOnFlag` is read with
   default true, which `@2`'s `--settings` turns off. The model-fallback
   tripwire error is there, as are `model_substitution_disabled` and
   `no_allowed_fallback`.
6. Fast mode is gated on first-party and not `CLAUDE_CODE_DISABLE_FAST_MODE`.
   `autoContinueAtUsageLimit` defaults to on, so `@2`'s off switch is still
   needed. The `rate_limit_info` enums are as recorded, and every API-error
   kind 2.1.280 was recorded with is present.
7. The init event carries `claude_code_version`, the build's VERSION
   "2.1.295". The result fields are as recorded, with `fast_mode_state` taking
   only on, cooldown or off. Every system subtype `@2` reads or classifies,
   and 2.1.280's seven new ones, are named.
8. `auth status --json` still reports 2.1.280's three added keys.
9. Every `@2` argv flag and each of the eleven control variables is named.
10. The embedded catalog (version 1840) was issued 2026-10-08T05:28:34Z and
    expires 2026-10-15T05:28:34Z, so it had already expired at the recheck.
    The served catalog has an environment off switch,
    `CLAUDE_CODE_MODEL_CATALOG` (-> "env_off"). Whether
    `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` turns the served catalog off
    is inferred, not confirmed.

**Addendum** (`parent-static-recheck-addendum.20261015T082621Z.log`). The
parent checked it against the scan logs after this change's author asked
about the `apiError` field. It finds both spellings of the API-error fields
statically confirmed for 2.1.295: `apiError` and `apiErrorParams` in its
internal message constructor, and `api_error` and `api_error_params` in its
SDK schema text. Which one a `-p` `stream-json` run serialises stays a
runtime unknown; `@2` reads the kind from `error`, `apiError` and
`api_error`.

**Second addendum** (`parent-static-recheck-addendum-b.20261015T084920Z.log`),
prompted by the documentation fact-check and checked by the parent against
the scan logs:

- `apiRefusalCategory` and `apiRefusalExplanation` occur in 2.1.295's bytes
  (84 and 24 times). That is presence only: the scans show neither where a
  `-p` `stream-json` run places them nor on which events, so their placement
  stays a runtime unknown, as for 2.1.280.
- **Not rechecked:** 2.1.280's recorded fact that `--json-schema` becomes an
  unforced `StructuredOutput` tool (`toolChoice` undefined; a forced tool
  demoted to auto when thinking is on). The proximity scans found no
  `StructuredOutput` beside `toolChoice` or `tool_choice`, and item 4 above
  confirms only the tool name and the result's `structured_output`. With D5,
  how 2.1.295 asks for structured output stays a runtime unknown.
- Item 7's BUILD_TIME and GIT_SHA are constants embedded in the build, not
  fields of the init event, and nothing was run to report them.

**Differences from 2.1.280's record, and what `@2`'s unchanged rules do with each.**

| | Difference | Under the unchanged rules |
|---|---|---|
| D1 | `auth status --json` can add `allowedProviders` | the gate's allowlist refuses an unknown key, so the gate blocks (fails closed) |
| D2 | `rate_limit_info` gains fields, among them `limitScope` (renamed from `overageScope`) and `overageEnabled` | unknown top-level keys are allowed, so none blocks; `overageEnabled` is read by no rule, and 5b's `overageScope` observation would stay empty |
| D3 | more API-error kinds, among them `usage_limit_reached` | none is classified, and an unknown kind falls through to `CliExitError` or `CliResultError` (refused); `usage_limit_reached` files no exhausted usage stop and no reset-pending hold unless a `rate_limit_event` in the same stream reports `rejected` |
| D4 | three controls with no 2.1.280 record: `CLAUDE_CODE_DISABLE_STRUCTURED_OUTPUTS`, `CLAUDE_CODE_DISABLE_REFUSAL_RETRY`, `CLAUDE_CODE_DISABLE_1M_CONTEXT` | none is among `@2`'s eleven; each would be a construction hardening |
| D5 | a native structured-output path (`structured-outputs-2025-12-15`) | if `-p --json-schema` on `claude-opus-5-5` takes it, the stream may carry no `StructuredOutput` call, and every `@2` launch is refused at D-8 step 8 (fails closed) |
| D6 | many more system subtypes are named | `@2` refuses any it does not read (fails closed) |
| D7 | the embedded catalog has expired | see item 10 |

**Runtime unknowns.** The plan's Task 6 list is unchanged and now applies to
2.1.295:

- rate-limit event emission per launch;
- `fast_mode_state` under `DISABLE_FAST_MODE`;
- exact model strings, `[1m]` and auxiliary `modelUsage` keys;
- whether effort is applied;
- thinking-display shapes;
- how the tripwire and refusals surface;
- whether the `--settings` keys are honoured in `-p` mode;
- whether `--setting-sources ''` excludes `~/.claude`;
- managed settings;
- the catalog source past `expires_at`;
- structured-output retraction;
- `api_retry` under retries 0;
- whether `analyticsDisabled` follows `DISABLE_TELEMETRY`;
- `seven_day_overage_included` and an absent `overageStatus`.

The recheck adds these for 2.1.295:

- D5: tool or native structured output;
- whether `allowedProviders`, `overageEnabled` or `usage_limit_reached`
  appear;
- which subtypes appear;
- whether a refusal retry happens under `CLAUDE_CODE_MAX_RETRIES=0`.

The addenda add these:

- which API-error spelling a `-p` `stream-json` run serialises (`apiError`
  or `api_error`; the first addendum);
- where the `apiRefusalCategory` and `apiRefusalExplanation` names appear,
  and on which events (the second addendum);
- how 2.1.295 asks for structured output, since 2.1.280's
  unforced-`StructuredOutput` fact was not rechecked (the second addendum).

## The new literals

- **Pin** (`src/pipeline/claude-code-cli.ts`, `CLAUDE_CODE_CLI_V2_PROFILE.pin`)
  - path `~/.local/share/datastrata/claude-code/2.1.295/9d6405864fdc/claude.app/Contents/MacOS/claude`
  - version `2.1.295`
  - sha256 `494870c9763b5ea370b6165e7e04af589a7b2472bf0de18ffb25477f8230bdf6`
  - sizeBytes `239695888`
- **Invocation** (read from the profile by `invocationOf`, unedited):
  `{ effort: 'high', maxOutputTokens: 64000, executable: { version: '2.1.295', sha256: '494870c9763b5ea370b6165e7e04af589a7b2472bf0de18ffb25477f8230bdf6' } }`.
- **`@2` identity** (`SUBSCRIPTION_ROLE_CONFIG`):
  `pipeline-v3-68c4d29bd770f9e7bc78f24cb2da97892a9da8f7c0bcabb499dff5301806a19a`.
  It replaces `pipeline-v3-e0570a08…f690`. It was taken from the builder by
  a placeholder run (checked here,
  `pin-impl-placeholder-identity.20261015T075940Z.log`). It is reproduced
  without the builder by `test/pipeline-identity.test.ts`'s hand-written
  canonical JSON hashed with `node:crypto`, which takes the invocation
  literal as its input, so its code needed no edit. Its positive controls
  are unchanged. Tooth T5 shows the old invocation gives back exactly the
  old identity.

## What did not move

- `@1`: `PINNED_CLI` (2.1.226, `013a1cf1…`, 279,661,952 bytes) and
  `claude-opus-5`.
- The identities:
  - HTTP `pipeline-v3-06789a36…`;
  - `@1` `pipeline-v3-fd3ed34d…`;
  - `GOLDEN_IDENTITY` `pipeline-v3-1d566c99…`;
  - the present-invocation golden `pipeline-v3-002ec70e…`.
- The `@2` profile apart from its pin: models, effort, ceiling, the eleven
  controls, settings, both timeouts and the gate rules.
- Every acceptance rule. `git diff` of `src/` changes only the four pin
  lines; every other changed line is a comment.
- `src/pipeline/provider-adapter.ts` (`43d82d2a…`), mutated only for
  round 2's tooth R2-d and restored by hash.

## Decisions taken in this change (for review)

1. **The present-invocation golden stays.**
   - `GOLDEN_IDENTITY_WITH_INVOCATION` (`test/provider-adapter.test.ts`) is
     taken over `goldenInput()`, which is test-local: `test-provider@1`,
     placeholder prompt hashes and models.
   - It is the encoding golden of plan Task 3. It claims that one fixed input
     hashes to one digest, not which executable `@2` pins. C1-v2, C5 and
     'over claude-code-cli@2, the @2 invocation' make that claim.
   - Its input was `INVOCATION_V2`, which states the current pin and so had
     to move. The golden's cases now read `GOLDEN_INVOCATION`, a test-local
     literal of the values the golden was taken over (2.1.280, `862db5f3…`).
   - The golden's value, its derivation and its "moves when" variants are
     unchanged, and the case title now names `GOLDEN_INVOCATION`.
   - This keeps a golden that is "reviewed as a golden" from being
     re-derived. It also stops it moving with future pins.
2. **The harness's filed statements moved.** `SUBSCRIPTION_V2_UNOBSERVED`
   (`test/live-capture.ts`), filed on every `@2` summary, said "which
   2.1.280 honours statically" and gave 2.1.280's catalog expiry. It now
   states 2.1.295's, both from the static recheck (items 2 and 10):
   "2.1.295 honours statically" and "expires at 2026-10-15T05:28:34Z". The
   test literal `V2_UNOBSERVED` moved with it.
3. **Comments.**
   - In `src/pipeline/claude-code-cli.ts`, the comments that describe the
     pinned executable now name 2.1.295 and what it is.
   - Each statement of what the pinned build does says either that the
     static recheck confirmed it for 2.1.295 (citing the summary log, or for
     the `apiError` field its addendum) or that it was read from 2.1.280's
     strings only. The `apiRefusalCategory` and `apiRefusalExplanation`
     comments (the source's and V-P6's) cite the second addendum: both names
     occur in 2.1.295's bytes, and their placement is a runtime unknown.
   - The module comment's account of the recheck says "the ten facts it
     rechecked (summary items 1-10)" and records that 2.1.280's
     unforced-`StructuredOutput` fact was not rechecked (second addendum).
   - Where the pin is declared, the comment cites D-4's rule for keeping
     version `2` (no `@2` execution exists yet,
     `parent-execution-history.20261015T072222Z.log`), so it agrees with the
     two comments saying that moving the pin moves the adapter's version. It
     calls 2.1.295 the only installed build at or above 2.1.280 on
     2026-10-15, and 2.1.280 absent from the desktop-managed directory
     (attributed to the updater's pruning, which D-4 predicted).
   - Probe questions about 2.1.280 are now about the pinned build, and
     history stays history.
   - The same was done in the test files this change edits.
   - `test/included-usage.ts`: its two probe questions (lines 198 and 218)
     now ask about the pinned build, a comment-only edit the parent
     authorised in round 2. Its line 65 reports what 2.1.280 says about the
     200K boundary, history the recheck confirmed for 2.1.295 (item 3), and
     is unedited. `test/claude-code-cli-transport.test.ts`
     states no pin and was not edited; its 2.1.280 mentions are history.
4. **Test-local inputs left at 2.1.280.** None of these states the pin:
   - the observation cases P5, P6 and P6b in `test/live-capture.test.ts`,
     which are never projected;
   - the malformed-invocation inputs in `test/provider-adapter.test.ts`
     (`SHORT_SHA`, `UPPER_SHA`, `NON_HEX_SHA`, the versions written beside
     them, `' 2.1.280'`, `'2.1 .280'` and `withExecutable('2.1.280')`), whose
     verdicts depend only on the malformed field;
   - the `@1` characterisation's "new in 2.1.280" subtypes.
5. **Titles.**
   - V2-X1 drops ", spaces kept", because no pin path has a space now; H3
     carries that claim.
   - H1 no longer claims "its spaces kept verbatim": no H1 pin has a space
     now. It keeps a space in the home (`/Users/some one`) and names H3 as
     the case holding a space in the pin. Its assertions are unchanged.
   - V-A0 and the probe-transform `describe` now name 2.1.295.
   - The v2 builder's comment calls its output "a synthetic stream in
     2.1.295's recorded shape", not a good 2.1.295 stream: nothing from
     2.1.295 has been observed.

## New cases

- **(a) V-C-former-pin** (`test/claude-code-cli-v2.test.ts`). A `@2` stream
  reporting `claude_code_version` "2.1.280" is refused as
  `CliLaunchContextError` with `claude_code_version "2.1.280" (must be
  "2.1.295", the pin's) (init at line 1)`. Its control, the same stream set
  to "2.1.295", projects to the payload.
- **(b) H3** (`test/claude-code-cli.test.ts`). `~/Library/Application
  Support/x/claude` resolves under `/Users/someone`, with and without a
  trailing slash, with the space kept. The 2.1.280 path was the only pin
  with a space.
- **(c) Three V-C rows** (round 2, `test/claude-code-cli-v2.test.ts`, beside
  V-C-former-pin). The move removed the only test version above the pin:
  before it, the 2.1.281 row (pin + 1) killed a mutant refusing only
  versions that sort below the pin, and now every `@2`-projected test
  version (2.1.226, 2.1.280, 2.1.281) sorts below 2.1.295. Each row is
  refused as `CliLaunchContextError` with its exact message:
  - a newer build, `claude_code_version "2.1.296" (must be "2.1.295", the
    pin's) (init at line 1)`;
  - the field absent, `claude_code_version undefined (must be "2.1.295", the
    pin's) (init at line 1)`;
  - a version the pin is a prefix of, `claude_code_version "2.1.2950" (must
    be "2.1.295", the pin's) (init at line 1)`.
- **(d) A newer-version invocation mismatch** (round 2,
  `test/provider-adapter.test.ts`, 'refuses a live capability declaring a
  newer executable version (2.1.296 against the configured 2.1.295), naming
  only executable.version'). Both existing version rows (2.1.275, 2.1.281)
  declare an actual version older than the configured one. This one
  declares 2.1.296, written as a literal, and asserts what its neighbours
  do: `InvocationMismatchError`, `fields` exactly `['executable.version']`,
  configured and actual, the fragment `executable.version configured
  "2.1.295", actual "2.1.296"`, nothing asked, nothing bound, no network.
  No existing assertion changed.

## Counts and teeth (checked here)

**Round 2's finish, the counts this checkpoint relies on.** They ran on the
final tree: every changed code and test file at the sha256 in the table
below, `claude-code-cli.ts` at `e1dc50eb…` and the unchanged
`provider-adapter.ts` at `43d82d2a…`. Only this checkpoint changed after
them, to cite them. `pin-impl-r2-status.20261015T114654Z.log` records
every changed file's sha256 and line count against round 2's starting
copies, and `git status`.

- Targeted set, 31 paths: 31 files / 1699 tests passed
  (`pin-impl-r2-finish-targeted.20261015T114232Z.log`). The round-1 finish
  was 31 / 1695; the four more are round 2's three V-C rows (c) and its
  provider-adapter row (d). The baseline at `8b25dc8` was 31 / 1693
  (`parent-pin-baseline-targeted.20261015T073312Z.log`); the six more are
  the two new cases of round 1 and the four of round 2.
- Engine `tsc --noEmit`: 0 (`pin-impl-r2-finish-engine-tsc.20261015T114412Z.log`).
- Root typecheck: 0 (`pin-impl-r2-finish-root-typecheck.20261015T114420Z.log`).
- csrd: 7, in the same six files, and no `sleep 600` process
  (`pin-impl-r2-finish-csrd.20261015T114430Z.log`).

The parent's round-2 logs:

- Its final runs, on the same tree (every changed code and test file at
  the sha256 in the table below): targeted set, 31 files / 1699 tests
  passed (`parent-pin-r2-final-targeted.20261015T115029Z.log`); engine
  `tsc --noEmit` 0 (`parent-pin-r2-final-engine-tsc.20261015T115154Z.log`);
  root typecheck 0
  (`parent-pin-r2-final-root-typecheck.20261015T115156Z.log`); csrd 7
  (`parent-pin-r2-final-csrd.20261015T115159Z.log`); and its status log,
  every changed file's sha256 and the `src` diff against `8b25dc8` showing
  only the four pin lines as code
  (`parent-pin-r2-status.20261015T115220Z.log`).
- Its round-2 teeth, written from the code, summarised in
  `parent-pin-r2-teeth-final-summary.20261015T115022Z.log`: P11 to P14 on
  round 2's new tests, and P01 to P10 re-run on the final tree, all red on
  their named cases. P11, the `<` mutant, red on the three new V-C rows, as
  the parent predicted; P12 and P13 each on one row alone; P14, the
  invocation-ordering mutant at `provider-adapter.ts:264`, on the new
  provider-adapter row alone, the 2.1.275 and 2.1.281 rows green. Every
  first failure was read, and every file was restored and confirmed by
  hash.

Superseded counts, kept as history: round 1's finish, 31 / 1695, ran on a
tree whose `claude-code-cli.ts` was `aa25039c…`
(`pin-impl-finish-targeted.20261015T081339Z.log`, with engine tsc
`pin-impl-finish-engine-tsc.20261015T081512Z.log`, root typecheck
`pin-impl-finish-root-typecheck.20261015T081514Z.log` and csrd
`pin-impl-finish-csrd.20261015T081516Z.log`).

Each tooth followed the same procedure:

1. The file was copied into the implementer's scratch first.
2. It was mutated exactly once, and the mutation was confirmed by diff and a
   construct count.
3. The named files were run.
4. The file was restored from the copy and the restore confirmed by sha256.

T8 and T9 are beyond the brief's seven.

| Tooth | Mutation | Red | First failure | Log |
|---|---|---|---|---|
| T1 | pin sha256, last digit 6→7 | C1-v2, C5, provider-adapter 'over claude-code-cli@2, the @2 invocation' and two live-runner cases, pipeline-identity's `SUBSCRIPTION_ROLE_CONFIG` and `subscriptionRoleConfigFor` cases (7 of 349) | C1-v2: `"sha256"` expected `…f8230bdf6`, received `…f8230bdf7` | `pin-impl-teeth-T1-sha-digit.20261015T080600Z.log` |
| T2 | pin version back to 2.1.280 | C1-v2, C5, V-C-former-pin and every `@2` acceptance case in the v2 file and in live-capture (167 of 698) | V-A0: `CliLaunchContextError: … claude_code_version "2.1.295" (must be "2.1.280", the pin's) (init at line 1)` | `pin-impl-teeth-T2-version-old.20261015T080619Z.log` |
| T3 | pin path back to the old desktop path | C1-v2, V2-X1, V2-D2, both V2-D3 (5 of 343); H1, H3, C5, V2-E1 green | C1-v2: `"path"` expected the new path, received `~/Library/Application Support/Claude/claude-code/2.1.280/…` | `pin-impl-teeth-T3-path-old.20261015T080758Z.log` |
| T4 | sizeBytes 239695888→239695889 | C1-v2, V2-E1, V2-X1, V2-D2 (4 of 343); C5 green | C1-v2: `"sizeBytes"` expected 239695888, received 239695889 | `pin-impl-teeth-T4-size.20261015T080937Z.log` |
| T5 | `invocationOf` states 2.1.280 / `862db5f3…` | C5, provider-adapter's three `@2` invocation cases, pipeline-identity's `SUBSCRIPTION_ROLE_CONFIG` and `subscriptionRoleConfigFor` cases (6 of 349); C1-v2 and the literal-configuration identity case green | C5: executable expected 2.1.295 / `494870c9…`, received 2.1.280 / `862db5f3…`; the identity received is `pipeline-v3-e0570a08…f690` | `pin-impl-teeth-T5-invocation-old.20261015T081109Z.log` |
| T6 | the version check also accepts 2.1.280 | V-C-former-pin only (1 of 355) | `expected a CliLaunchContextError: expected undefined to be 'CliLaunchContextError'` | `pin-impl-teeth-T6-accept-former.20261015T081130Z.log` |
| T7 | the hand-written derivation writes the executable version as "2.1.280" | the hand-written case only (1 of 41); its HTTP and `@1` controls green | expected `pipeline-v3-68c4d29b…a19a`, received `pipeline-v3-c4ea1ac2…2a5c` | `pin-impl-teeth-T7-handwritten-field.20261015T081138Z.log` |
| T8 | `resolvePinPath` drops spaces from the pin part | H3 only (1 of 205) | expected `…/Library/Application Support/x/claude`, received `…/Library/ApplicationSupport/x/claude` | `pin-impl-teeth-T8-space-dropped.20261015T081147Z.log` |
| T9 | the harness's `outputCeiling` names 2.1.280 | V2-E1 only (1 of 138) | the unobserved block: `outputCeiling` expected "2.1.295 honours", received "2.1.280 honours" | `pin-impl-teeth-T9-harness-ceiling-old.20261015T081153Z.log` |

Round 2's teeth followed the same procedure through one script per tooth
(the pre-teeth hash checked, the copy taken, one replacement refused unless
the old construct occurred exactly once, the landed diff shown, the test
file run in full, the copy restored and its hash confirmed, all in one
log). Each replaced one condition in a single edit. R2-a to R2-c are at the
`@2` version check in `claude-code-cli.ts` (restored to `e1dc50eb…`) and
ran over `test/claude-code-cli-v2.test.ts`, 358 cases; R2-d is in the
invocation comparison, `src/pipeline/provider-adapter.ts:264`, outside the
change and mutated for this tooth only (restored to `43d82d2a…`), and ran
over `test/provider-adapter.test.ts`, 104 cases.

| Tooth | Mutation | Red | First failure | Log |
|---|---|---|---|---|
| R2-a | `String(e['claude_code_version']) < pin` (refuse only versions sorting below the pin) | V-C 2.1.296, V-C absent, V-C 2.1.2950 (3 of 358); 2.1.226, 2.1.281, V-C-former-pin (2.1.280) and V-F1-refused green | `expected a CliLaunchContextError: expected undefined to be 'CliLaunchContextError'` (V-C 2.1.296) | `pin-impl-r2-teeth-a-lt.20261015T113758Z.log` |
| R2-b | `e['claude_code_version'] !== undefined && e['claude_code_version'] !== pin` (refuse only stated versions) | V-C absent only (1 of 358) | the same message, on V-C absent | `pin-impl-r2-teeth-b-undef.20261015T113819Z.log` |
| R2-c | `!String(e['claude_code_version']).startsWith(pin)` (refuse only versions not starting with the pin) | V-C 2.1.2950 only (1 of 358) | the same message, on V-C 2.1.2950 | `pin-impl-r2-teeth-c-prefix.20261015T113828Z.log` |
| R2-d | `actual.executable.version < configured.executable.version` (name the version only when the actual one is older) | the new newer-version row (d) only (1 of 104); the 2.1.275 and 2.1.281 rows green | `expected undefined to be an instance of InvocationMismatchError` | `pin-impl-r2-teeth-d-order.20261015T113837Z.log` |

The round's list expected R2-a to red the 2.1.296 row alone. It does not,
and the prediction, recorded in the log before the run, said so. `String(undefined)`
is "undefined", and "u" sorts after "2"; "2.1.2950" sorts after "2.1.295",
its prefix. So the `<` mutant accepts all three rows, and the 2.1.296 row
is not the only case that kills it. The rows were not altered. R2-b and
R2-c each red one row alone.

The parent re-runs every teeth check. Its round-2 logs are named with its
final runs, above. For round 1 its results are recorded in its
summary log, `parent-pin-teeth-final-summary.20261015T082621Z.log`. That log
records ten teeth the parent wrote from the code, all red on the named cases
for the intended reason and all restored by hash; P08 is a control (`@1`'s
pin version 2.1.226 → 2.1.227 reds C1 and C6), showing that `@1` is still
pinned by its own unchanged literals; and the batch tool crashed while
parsing P09's output (a tooling fault, not a tooth result) after P09 had run
and restored, the batch summary `parent-pin-teeth-summary.20261015T082403Z.log`
carries P01 to P08, and P10 was then run directly through `teeth.py`.

## Remaining blockers

Reviewing and committing this change comes first: it precedes plan §4
step 1. Blocker 5 blocks plan §4 step 3, not every live step.

1. **The expired embedded catalog** (D7, item 10). What the build does past
   `expires_at` is a runtime unknown.
2. **D5, structured output.** If the native path is taken, every `@2` launch
   is refused at D-8 step 8.
3. **The D-6 preconditions** (migration checkpoint, §The D-6 preconditions).
   None is confirmed.
4. **The probe.** Plan §4 step 1 is not authorised, and every strict rule
   and runtime unknown above waits on it.
5. **The data terms.** These are the migration checkpoint's open decision
   20. They block plan §4 step 3.

## Open decisions for the user

1. **D2.** Whether to add a fail-closed rule that refuses `overageEnabled`
   true.
2. **D3.** Whether to classify `usage_limit_reached` as exhaustion, filing a
   usage stop and the reset-pending hold.
3. **D4.** Whether to add any of the three controls as a twelfth or later
   launch control:
   - `CLAUDE_CODE_DISABLE_STRUCTURED_OUTPUTS`, also D5's construction
     mitigation;
   - `CLAUDE_CODE_DISABLE_REFUSAL_RETRY`;
   - `CLAUDE_CODE_DISABLE_1M_CONTEXT`.
4. **A newer build.** Whether to replace the pin again before a probe if a
   newer build is installed meanwhile.

The migration checkpoint's other open decisions stand. Its decision 1 (the
pin) is now taken (reported by the parent, from the user's instruction of
2026-10-15). The grounds of its decision 2 (the 64,000 ceiling and the 200K
boundary) are confirmed statically on 2.1.295, though not at runtime. Its
decision 13 says the first `@2` execution attempted would file a
pin-mismatch error carrying the pin path under the inherited HOME (§The pin
today, consequence 1). That no longer holds while the preserved copy is
intact: the pin check then passes, and no pin-mismatch error is filed. It
would hold again if the copy changed or went missing. The decision's other
redaction questions stand.

## Suggestion not adopted

- A V2-E1 cross-check that the filed `unobserved.outputCeiling` names
  `requested.pin.version`. It would catch a stale filing on a future
  re-pin, but no single-file mutation shows it failing alone, so round 2
  records it here for the user rather than adding it.

## Changed files (sha256 after the change)

| File | sha256 |
|---|---|
| `backend/engine/src/pipeline/claude-code-cli.ts` | `e1dc50ebee5a26b6ac5df2daef31a5c9d36944fc7808a36a898d21283b8af83c` |
| `backend/engine/test/claude-code-cli.test.ts` | `932b4c0e72170653f6f2d48736b515e408c61eddd5c0ece5558f47a3968d8674` |
| `backend/engine/test/claude-code-cli-v2.test.ts` | `2b4d05e011573962027d13658687d093a03674fe2c427abacd0abf2218fd3152` |
| `backend/engine/test/included-usage.test.ts` | `7529331dcd479b985e16d8eb3b3ca2a926efb13352019bc74bf6087c2e3e6755` |
| `backend/engine/test/included-usage.ts` (two comments, round 2) | `4f392145e8789b0f5971b4874df069213b96ab3d20bfecbcf78440214a678faa` |
| `backend/engine/test/live-capture.test.ts` | `25d8f4832d886b2096123ab703bb27c577ade8866f07d28e0e4f8bedcb9742ae` |
| `backend/engine/test/live-capture.ts` | `1cce0552e97cde9f1fed4e57ef716189ad94c556d22df815cdd4b0448a6b1337` |
| `backend/engine/test/pipeline-identity.test.ts` | `68c9cae95f139251565672d6b802be70a1e8ad6ac99851824bceb05b153fd429` |
| `backend/engine/test/provider-adapter.test.ts` | `734953c0536a86d59641ae5e88340d9d169242c2989681e9de14a031ead28f13` |
| `docs/superpowers/CHECKPOINT-opus55-migration.md` (one pointer line) | `22dacb6a307908e8fc7cfeab92f9bb877b63f918d144fdc97818f7bd14ec89b8` |

This file is new.

Round 1's teeth (T1 to T9) and the parent's first teeth ran on
`claude-code-cli.ts` at `aa25039c…`. Every change to it since is a comment:
round 1 cited the addendum on the API-error fields
(`pin-impl-r1-engine-tsc.20261015T082906Z.log` shows that diff and the
typecheck, 0), giving `76ac97dc…`; round 2 changed the comments of its
items 3, 4, 5 and 11, giving `e1dc50eb…`, on which R2-a to R2-c ran.
