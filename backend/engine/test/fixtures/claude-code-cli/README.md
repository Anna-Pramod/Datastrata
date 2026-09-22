# `claude-code-cli` fixtures

Two stream captures from the synthetic subscription probe of 2026-09-22, used
by `test/claude-code-cli.test.ts` to prove the adapter's projection against
what the pinned CLI (`2.1.226`) actually emitted rather than against a
remembered shape.

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
