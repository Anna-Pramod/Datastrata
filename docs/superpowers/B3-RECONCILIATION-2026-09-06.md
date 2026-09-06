# B3 draft, reconciled against the repository at `1eda341` + B-ADAPTER

The B3 draft (`plans/2026-08-24-b3-benchmark-and-promotion.md`, user-owned,
untracked, unchanged) was written at base `9ae33e5`. This tracked note says,
section by section, what the repository has since decided or superseded, so
that nothing in the draft is relied on without checking here first. It does
not execute B3.

| Draft section | Status | What supersedes or qualifies it |
|---|---|---|
| §1 current-state reconnaissance | superseded | Identity scheme v3, result schema 1.3.0, transcript 1.1.0, closure renderer 1.1.0; pins carry authenticity, non-operative sections and standing; topology is 14 reachable and 2 gapped in three closures; S-012's closure is not empty. |
| §2 provider and model research | usable as a starting point, must be refreshed | Model ids, limits and pricing were re-read from the official reference on 2026-09-06 for the adapter; refresh again on the day of the first call. Nothing here is a feasibility result. |
| §3 the workload, measured | not a measurement | Character-based token estimates. Feasibility is established only by count-tokens over the real rendered inputs, itself a provider call, and downstream requests carry generated outputs the initial reader input cannot predict. |
| §4 recommended configurations | C1 adopted in part | Homogeneous `claude-opus-5` across roles is the configuration. C2 and C3 are not decided. |
| §5.1 `anthropic-messages@1` | implemented, with departures | Non-streaming at a 16 000-token output ceiling rather than streaming; no prompt caching; structured output derived from the local schemas. See `backend/engine/src/pipeline/anthropic-messages.ts`. |
| §5.2 `openai-responses@1` | not started | Depends on D4, not approved. |
| §5.3 role schemas structured-output compatible | confirmed | The converter refuses anything outside the provider's subset; all three role schemas convert. |
| §5.4 canned-response suite | delivered in substance | `live-transport.test.ts`, `live-wiring.test.ts`, `anthropic-messages.test.ts`, and the adapter-path synthetic recording. |
| §6–§10 benchmark taxonomy, gold truth, metrics, gates, identity | open | Not started. Nothing in the repository asserts a benchmark. |
| §11 promotion record and evidence | direction accepted, contents undefined | The record is still `{pipelineVersion, by, on}`. Promotion needs: a benchmark over a defined case set with gold truth under the exact identity to be promoted; zero-tolerance counts at zero; replay reproducibility; the offline suite green; a human reading of the first case's dossier. One successful live run establishes that the adapter works, not that the pipeline is fit to promote. |
| §12 cost model | estimate only | Not a spending authorisation and not a feasibility result. |
| §13 staged execution | open | No stage has run. |
| §14 first live execution, S-002 | recommendation retained | S-002 remains the recommended first case; its two documents carry the five declared operative ranges and its locator sits in one. Not authorised. Other cases need a coverage check of their intended quotes against declared ranges before any new declaration. |
| §15–§16 implementation and mutation plan | partly overtaken | The adapter, wiring and canned suite are in; the benchmark tasks are not. |
| §17 risks | still open | Unchanged. |
| §18 decisions | D1 settled; D2–D5 open | D2 commercial and data terms are a live-use prerequisite, not an obstacle to offline synthetic testing. D3 caching: not implemented in the first adapter; adding it moves the adapter version. D4 challenger: not approved. D5 spend: not authorised. |

## Assumptions in the draft that the repository now contradicts

- Every category-B closure being empty: false; S-012 has a large closure with `SRC-007` as its gap.
- Three prosecutors: now seven, one per lens.
- The default configuration selecting no adapter: now `anthropic-messages@1`.
- "Retire the synthetic fixture when a genuine recording exists": not the policy. Recordings are retained; a genuine one is filed under its own identity.
- Annexes and lists as ineligible support: settled the other way under B-EVID-SPAN — eligible under authored, justified declarations.

## What must be returned before any provider call

The exact model and configuration; the data sent (the prompt files and the
rendered inputs, which contain corpus text); the applicable commercial and
data terms; the context-feasibility method, which is count-tokens over the
real rendered inputs for each role and cannot be settled from the reader input
alone because later requests carry generated outputs; and enforceable limits
per role invocation (`max_tokens` 16 000, a ten-minute timeout that is an
enforced local limit and not a latency measurement, at most three HTTP
attempts), per run (nine role invocations — one reader, seven prosecutors, one
adjudicator — which is up to twenty-seven HTTP attempts, and the runner counts
every attempt it makes) and in money.
Count-tokens is itself a provider call and remains separately unauthorised.
