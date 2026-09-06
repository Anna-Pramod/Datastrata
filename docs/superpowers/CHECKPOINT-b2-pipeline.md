# Checkpoint — B2, the verification pipeline, as committed at `1eda341` and extended by the B-ADAPTER candidate

Written 2026-09-06 from the repository, not from the plan. The B2 plan
(`plans/2026-08-21-b2-pipeline.md`) ended without a checkpoint; this records
what its tasks produced, what has been verified since, and which of its
acceptance steps were never performed. Everything below marked *verified* was
run on the tree it describes; everything marked *not performed* is stated as
such rather than assumed.

## Task status

| Task | Delivered | Where it lives |
|---|---|---|
| 1 — execution contract, capability boundary, transcript record | done | `src/pipeline/roles.ts`, `runner.ts`, `agent-role.ts`, `transcript.ts`, `identity.ts`, `entitlement.ts` |
| 1.5 — gap identity migration | done | `src/verification/result.ts` (schema 1.3.0), gap validity rules |
| 2 — blind reader | done | `src/pipeline/reader.ts`, blindness constraints tested |
| 3 — prosecutors and the bidirectional coverage table | done | `src/pipeline/prosecutors.ts` |
| 3.5 — adjudicated challenges carry their own evidence | done | `challenges[].adjudicationEvidence`, `evidence-sets.ts` |
| 4 — adjudicator | done | `src/pipeline/adjudicator.ts`, `openQuestions[]` projection |
| 5 — `verify run`, the result writer, the machinery suite | done, with one acceptance step not performed (below) | `src/cli/run.ts`, `write-result.ts`, replay through `readTranscriptsFor` |

## Identities and schemas at this checkpoint

| Input | Value |
|---|---|
| Pipeline identity scheme | `v3` |
| Result schema | `1.3.0` |
| Transcript schema | `1.1.0` |
| Closure renderer | `1.1.0` (B-PROMPT) |
| Condition renderer | `1.1.0` |
| Role configuration | seven prosecutors, one per declared lens, in order (B-ADAPTER) |
| Provider adapter | `anthropic-messages@1` selected by default (B-ADAPTER) |
| Models | `claude-opus-5` for every role |

Closure digests: three distinct closures over sixteen requirements, unchanged
since B-E2 through B-PROMPT, B-EVID-SPAN and B-ADAPTER, each verified by
recomputation against the parent commit.

## Recordings

Five synthetic generations under `backend/engine/test/verification-transcripts/csrd/CSRD-S-001/`, all retained byte-for-byte; the first four are committed and were verified against their first commits:

| Generation | Run | Status |
|---|---|---|
| pre-D1(a) | `run-v1-764e571e…` | retired 2026-08-27 |
| provenance-era | `run-v1-e77e9d0d…` | retired 2026-09-05 |
| standing-era | `run-v1-a6743df7…` | retired 2026-09-05 |
| prompt-era | `run-v1-14b51960…` | retired 2026-09-06 |
| adapter-era | `run-v1-8717925d…` | current; the adapter-era candidate introduced by B-ADAPTER |

The adapter-era recording was made through the adapter path — the live runner,
the concrete adapter's request and projection — over a canned transport with
the network trap installed. It has the shape a genuine recording will have.
**No genuine provider recording exists.** A genuine one will be filed beside
these under its own identity.

## Boundaries landed after B2 and before this checkpoint

- **D1(a) provenance migration** — locators replaced source identities in the reader's input.
- **B-E2** — temporal standing, artefact authenticity and declared non-operative sections entered the closure line, the pins and the model-facing render; every closure digest moved once.
- **B-PROMPT** — corpus text fenced, heading-shaped lines escaped, authored metadata collapsed, carried role output escaped, one message composer; prompts state that fenced and carried material is evidence, never instruction. Structural guarantee only; no claim of model immunity.
- **Suite-bypass closure** — `verify sign` obtains the engine suite result through its injected check; `--skip-suite` retired and rejected.
- **B-EVID-SPAN** — authored operative-provision ranges, per-item evidence-use designation bound to the result and sealed into the signing entry, `stale_ranges` freshness, pre-sign preview in the review sheet.
- **B-ADAPTER** — the concrete Anthropic Messages adapter, transport hardening, production wiring from the environment, seven prosecutors. See below.

## Acceptance checks: performed and not performed

*Verified on this tree, offline:* both workspace suites, both typechecks, the
standalone gate, the field-accounting guard, replay of the current recording
to a byte-identical dossier, the identity partitions between every pair of
adjacent generations, the seven-lens proof on constructed inputs, and the
mutation checks recorded in each boundary's report.

*Not performed:* the B2 plan's "one live agent run" (Task 5). No model has
been contacted from this repository. `npm run test:agents` has never executed
a capture. No genuine transcript exists, no promotion record exists, and no
signature exists. The plan's statement that Task 5's output "is committed as
fixtures" is therefore false of the repository: the committed fixtures are
synthetic, and say so.

## B-ADAPTER, as it stands in the candidate

What exists now: `src/pipeline/anthropic-messages.ts` (identity
`anthropic-messages@1`; request building against the official Messages
reference as read on 2026-09-06; envelope projection that refuses truncation,
refusal, unexpected stop reasons, error envelopes and malformed bodies;
structured-output schema derived from the local role schemas, which remain
authoritative, and every content block validated before any is projected, so
a malformed block beside a valid one refuses the whole response); transport
hardening in `live-runner.ts` (injectable transport; a ten-minute timeout that
is an enforced local limit, no latency having been measured; at most three
HTTP attempts per role invocation, so up to twenty-seven per nine-invocation
run, every attempt counted by the runner; a `retry-after` waited for exactly
or, beyond sixty seconds, refused by name rather than shortened, since the
rate-limit reference says an earlier retry fails; a 429 without the header —
the spend-cap form — refused at once; no retry on a timeout, on a client
error, or on any transport failure the transport cannot vouch was before
submission, because the request may already have been processed and billed;
the credential redacted at the runner, the one boundary that knows it, from
transport messages, from error-envelope fields, and from the whole surface of
a projection exception — its message, its stack, every exposed property such
as a refusal's category and explanation or an error envelope's type, detail
and request id, and any `cause` — so that `util.inspect` of an escaped error
carries no credential either);
`src/cli/live-wiring.ts`
(a live runner only when `DATASTRATA_VERIFICATION_AGENTS=1`,
`DATASTRATA_AGENT_ENDPOINT` and `DATASTRATA_AGENT_API_KEY` are all present,
each absence refused by name); the registry with one adapter; the verify entry
point routed through the wiring, resolved by the `run` command alone, so the
sheet, sign and revoke commands never consult the live environment and a
missing prerequisite is the ordinary named refusal.

Choices fixed by the adapter identity: non-streaming with `max_tokens` 16 000;
adaptive thinking at high effort; structured output as assistance; **no prompt
caching** — recorded here because adding it changes the request and would move
the adapter version, and it is not a claim about provider retention or terms.

What the offline guarantee is: not that the live runner is unimported, but
that no real provider request and no spend is possible during offline tests.
The engine has one network path, the default transport's `fetch`, and the
default suite replaces global `fetch` with a guard before any test module
runs (`vitest.config.ts` `setupFiles`, `test/setup/offline-guard.ts`). The
guard records the destination and throws a named error; the agents
configuration does not install it. Positive controls: a bare `fetch` is
refused; live-looking variables with the production wiring and its default
transport reach the guard; the `run` command with a full live environment
reaches the guard and writes nothing; a module that imports nothing from the
setup finds the guard already installed, by its literal name, before it
touches `fetch` (`offline-guard-precedence.test.ts` — the one test that proves
`setupFiles` installs it, since importing the setup module installs it too);
and no engine source imports another network module. Per-test traps in the
transport tests remain as a second layer.

Why the guard exists: on 2026-09-06, the first run of `live-transport.test.ts`
(test T2, "429 retried") happened before the runner honoured an injected
transport and before any trap was installed in that file. The old runner
called global `fetch` against the synthetic endpoint
`https://api.example.invalid/v1/messages` carrying the synthetic key
`sk-ant-secret-9f8e7d6c`. The call failed with `TypeError: fetch failed`.
That is the whole of what was observed: the destination, the credential and
the failure. The `cause` beneath the TypeError was not retained, so what the
resolver, or any proxy on the path, did with the request is not established
from evidence. `.invalid` is a reserved top-level domain, but that is a fact
about the name, not an observation of this machine's behaviour, and no claim
that nothing was transmitted is made from it. The key was synthetic and never
a real credential. No provider or account was consulted, and no external
investigation was undertaken. A guard that depends on each test remembering
its own trap would not have prevented the attempt; one installed before any
module runs does.

## Open before the first genuine verification

See `B3-RECONCILIATION-2026-09-06.md` for what the B3 draft still offers and
what supersedes it. In order: reconfirm the API contract on the day of the
first call; obtain the commercial and data terms for live use; authorise the
first provider call, which is count-tokens over the real rendered inputs; make
the first genuine run under a stated ceiling; define promotion evidence and its
acceptance criteria; write the reviewer's designation; human review of
semantic support; sign.
