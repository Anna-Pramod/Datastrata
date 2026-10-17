# `claude-code-cli` fixtures

Two stream captures from the synthetic subscription probe of 2026-09-22, used
by `test/claude-code-cli.test.ts` to prove the adapter's projection against
what the pinned CLI (`2.1.226`) actually emitted rather than against a
remembered shape. A third file, a normalised derivative of the 2026-10-17
probe's stream from `2.1.295`, is described in its own section below.

## What these files are, and are not

Both files are **DERIVED sanitised evidence**: the probe harness parsed the
CLI's `stream-json` stdout, redacted metadata (`session_id`, `uuid`, `cwd`)
and re-serialised each event. They are **not** untouched raw recordings, and
nothing in them is byte-authoritative except the `partial_json` deltas, which
the harness preserved verbatim and whose concatenation is the probe's
`model-output.structured.bin` (35 bytes, SHA-256
`ee0644e93174110fd74f29d0a06be362d46181bac5ae998e26abbe5fec27b09c`).

The probe sent a synthetic prompt and a two-field schema. **Neither file
contains any corpus text**, any requirement, any role prompt or any
verification input. They are byte copies (`cp`) of the sources below; the
sources are preserved unmodified.

| Fixture | Origin | Bytes | SHA-256 |
|---|---|---|---|
| `probe-accepted.stream.jsonl` | `/Users/vivin/Documents/DataStrata/pilot-evidence/run-live-20260922T062542Z-11315-a5ea08/stream.sanitised.derived.jsonl` | 6558 | `ce7a3dbae663e63b1468ef73ed4b7d3b5eb08d850a9610c3226e29e0e3f4f0e2` |
| `probe-auth-failed.stream.jsonl` | `/Users/vivin/Documents/DataStrata/pilot-evidence/run-live-20260922T061733Z-7085-e9f8f3/stream.sanitised.derived.jsonl` | 2405 | `83ab6da2d55ff9bcec07b6578a80c950a71da3b576b185b42573b95abf70334c` |

## What each one shows

- **`probe-accepted`** — verdict *accepted*, reviewer-verified. Exit 0, one
  model message, one `StructuredOutput` tool call at index 0 delivered in
  seven `input_json_delta` events (the first empty), `stop_reason:
  "tool_use"`, one `rate_limit_event` (`status: "allowed"`,
  `isUsingOverage: false`), one `result` with `subtype: "success"`,
  `is_error: false` and `structured_output` present.
- **`probe-auth-failed`** — verdict *rejected*. The CLI's OAuth session had
  expired: exit 1, no stream events, one assistant message with model
  `<synthetic>` carrying the authentication error as text, and a `result`
  whose `subtype` is `"success"` but whose `is_error` is `true`, with no
  `structured_output` and an empty `modelUsage`. It is the case that shows
  `subtype` alone is not a success signal.

## Reading them in a test

The stream is the CLI's stdout only. The adapter's `projectResponse` takes a
`CliEnvelope` (`{ exitCode, signal, stdout, stderrBytes }`), so the test wraps
each stream in an envelope it constructs. The probe's actual exit codes were
0 (accepted) and 1 (auth-failed); the test states which it uses in each case.

## `probe-2.1.295-permission-auto.derived.stream.jsonl` (2026-10-17)

The role stream of the one synthetic `claude-code-cli@2` probe, run against the
pinned `2.1.295`. `@2` refused it because the init event reported
`permissionMode "auto"`. It is used by `test/claude-code-cli-v2.test.ts` to
hold `@2` and `@3` to that refusal on the bytes the pinned build produced.

**DERIVED and NORMALISED from sanitised evidence; not a recording; the
original is preserved, unmodified, at the origin.**

- The origin is the harness's **sanitised** stream: `session_id`, `uuid` and
  `cwd` already `[REDACTED]`, each line re-serialised.
- This file is that stream with the values below replaced, each as a whole
  JSON value, by fixed fixture values.
- The derivation proved, line by line, that nothing else differs: the same 16
  lines, the same keys in the same order, and every differing value one listed
  below.
- No tool for the derivation is in this repository. The derivation, its proof
  and its equivalence check are in
  `/Users/vivin/Documents/DataStrata/pilot-evidence/2026-10-17-opus55-cli-v3-permission-mode/fixture/`.

| | Path | Bytes | SHA-256 |
|---|---|---|---|
| Origin | `/Users/vivin/Documents/DataStrata/pilot-evidence/subscription-executions/synthetic-probe/opus55-minimal-shape/20261017T153205Z-1c89aa/streams/role-reader[0]-launch2.sanitised.jsonl` | 7782 | `a3a7a577e45a5b31edd5dc5d7f7afa7c1bf5f6e51bdc5c2626746491031cf195` |
| This file | `probe-2.1.295-permission-auto.derived.stream.jsonl` | 7574 | `08223ed4ddb27824e94fac6f19842c014f86296ea1276d809bf5cc0835d4f0da` |

**Normalised** (incidental identifiers and account-usage values). Each original
value maps to one fixture value wherever it occurs:

| What | Where | Fixture value |
|---|---|---|
| the message ID | `message.id`; every `api_message_id` (12 occurrences) | `msg_fixture_0001` |
| the request ID | the assistant item's `request_id` | `req_fixture_0001` |
| the tool-use ID | the block's `id`, the restatement's `id`, the tool result's `tool_use_id`, `tool_result_meta[0].id` | `toolu_fixture_0001` |
| the CLI's socket path | the init's `messaging_socket_path` | `/tmp/cc-socks/0.sock` |
| the five-hour reset | `rate_limit_info.resetsAt`, `unifiedWindows.five_hour.resetsAt` | `1800000000` |
| the seven-day reset | `unifiedWindows.seven_day.resetsAt` | `1800272400` (the original gap and order kept) |
| each utilisation | `unifiedWindows.*.utilization` | `0.25` |

**Retained unchanged**, because the refusal or a downstream check reads it, or
because it is the recorded shape:

- every line and its order, every key and its order;
- the init's checked fields, `permissionMode "auto"` included, and its
  `plugins`, `agents` and `capabilities`;
- every model name;
- the `partial_json` deltas, byte for byte;
- the restatement, `structured_output`, and the tool result's text and
  permission decision;
- every stop reason, `subtype`, `is_error`, `terminal_reason`, `num_turns`,
  `api_error_status`, fast-mode field and `speed`;
- the token counts and `modelUsage`;
- the rate-limit event's `status`, `rateLimitType`, `overageStatus`,
  `overageDisabledReason` and `isUsingOverage`;
- the `[REDACTED]` values;
- the timing fields and `total_cost_usd`. These are neither identifiers nor
  account usage.

**Equivalence.** Through the committed `@2` projection, this file and the
original give the same outcome, error class and message, after the map. The
same holds for the copies with only `permissionMode` changed, and with that
change and one further change each:

- `terminal_reason` changed: `CliResultError`;
- `isUsingOverage` removed: `CliUsageUnobservedError`;
- `structured_output` changed: `CliOutputConflictError`.

Two deliberately broken derivations failed the check:

- a tool-use ID left unnormalised;
- a utilisation of 1.5.

**What it shows:**

- `@2`'s and `@3`'s projections refuse this stream for its init alone, with
  the run's exact message.
- With only `permissionMode` changed in a test, the projection's later checks
  run on the pinned build's real stream shape and accept it.

**What it cannot show:**

- that `2.1.295` emits `"default"` when `--permission-mode default` is
  requested;
- that the flag works live;
- anything about billing.
