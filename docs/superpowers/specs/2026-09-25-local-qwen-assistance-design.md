# Local Qwen assistance: design

- **Date:** 2026-09-25
- **Status:** design only. No Qwen or Ollama code exists or is added by the
  Opus 5.5 migration plan.
- **Scope:** outside the first S-002 baseline. Taking Qwen on needs its own
  plan and its own approvals.
- **Relates to:**
  - `plans/2026-09-22-b-cli-adapter.md` (D-7: Qwen was out of scope there);
  - `plans/2026-09-25-opus55-subscription-migration.md` (D-10);
  - `specs/2026-09-25-trust-measurement-and-evaluation-design.md`.

## 1. What Qwen may be used for, and what it may never do

**Permitted: bounded, non-authoritative assistance.**

- **Extraction.** Candidate locators, defined terms, cross-reference and
  amendment-chain candidates, dates and thresholds pulled out of a pinned
  closure. Each candidate carries its source span.
- **Indexing.** Section and article maps of pinned documents, to help a
  reviewer or a later retrieval design find text.
- **Additional objections.** Extra challenge candidates, raised through the
  same lenses, for a human reviewer to consider beside the Claude
  prosecutors' output.

**Prohibited, by design and in the record's vocabulary.**

- **Suppressing source material.** A Qwen output never removes, filters or
  down-ranks closure text that an authoritative role would otherwise see.
  Where Qwen indexes, the full closure is still what the authoritative roles
  receive.
- **Satisfying an authoritative role.** Qwen output is never recorded as a
  reader, prosecutor or adjudicator execution. It cannot fill a missing role,
  replace a failed or unavailable Claude launch, or be relabelled as one. A
  run whose Claude verification failed is a failed run, whatever Qwen
  produced.
- **Establishing correctness by agreement.** Qwen agreeing with Claude, or
  two Qwen passes agreeing with each other, is never evidence of correctness.
  Only the held-out evaluation and signed review are.
- **Leaving the machine.** Execution is local only. There is no cloud model,
  no remote host and no fallback to a hosted provider.

## 2. The installation, as inspected on 2026-09-24/25

The inspection was read-only: no model was launched, no `ollama` command was
run, and no server port was contacted. The parent re-verified the manifest
digests, blob sizes, app version and memory figure; the other figures are the
investigator's.

- **Runtime.** Ollama.app is 0.34.2. `/usr/local/bin/ollama` is a symlink to
  the app's binary.
  - The app updates itself: it moved from 0.34.0 to 0.34.2 on 2026-09-22, and
    0.34.3 and 0.34.4 are already downloaded.
  - The prompt renderers (`qwen3.8`, `qwen3.5`) are compiled into the binary.
    A runtime update can therefore change prompt formatting with every model
    digest unchanged.
- **Cloud is enabled.** The server log shows "Ollama cloud disabled: false",
  and `OLLAMA_REMOTES` includes ollama.com. A ChatGPT/Codex integration was
  configured on 2026-09-24. While a model is loaded, `llama-server` listens on
  loopback with CORS `*`.
- **Models.** There are two tags, both architecture `qwen35`: 27.3B parameters
  with a hybrid attention (16 full-attention layers, 48 linear-attention
  layers), a 262,144-token native context, and 4 KV heads.

  | Tag | Quantisation | Model blob | Manifest sha256 |
  |---|---|---|---|
  | `qwen3.8:27b-q8_0` ("Qwen3.8 27B 0814") | Q8_0 | 29,047,084,384 B, `sha256:2bb22714…bdbf` | `8f5fb6b71ea00052cbe8545738c55ce61112c4e571cb60ca4dad00b131766039` |
  | `qwen3.6:27b` | Q4_K_M | 16,837,919,680 B, `sha256:415aad60…` | `9d5803d493a991af27b9441c098aa56f2ed7bbd260877f075ec09b575c049bc3` |

  Every blob is present at its manifest size.
- **Provenance.** Both look like official library pulls (`registry.ollama.ai/library`),
  but that was not verified against ollama.com. Neither was whether "Qwen3.8
  27B 0814" is a genuine upstream release.
- **Machine.** Apple M5 Pro (Mac17,9), 48 GiB, with about 37.4 GiB usable by
  the GPU.
  - KV cache: 65,536 bytes per token (measured from a load log).
  - Q8_0 fits at a 32,768-token context: about 30.6 GiB, with the recorded
    load using 28.4 GiB of GPU memory. It does not fit at full context (about
    44.6 GiB).
  - Recorded decode speed: about 9.6 tokens per second.

## 3. Selection and pins

**Selected:** `qwen3.8:27b-q8_0`. It is the newer model and the
higher-precision quantisation, and it is the only one with a recorded load on
this machine. `qwen3.6:27b` is the fallback option only where speed or longer
context matters more, and it would get its own pins.

A Qwen invocation's identity is the whole local configuration, pinned the way
`claude-code-cli` pins its executable:

- `ollama` binary sha256 and the app version;
- the `llama-server` binary sha256;
- manifest sha256 `8f5fb6b7…6039`;
- model `sha256:2bb22714…bdbf`;
- projector `sha256:ac3714bf…448e`;
- params `sha256:448d2943…b111`;
- config `sha256:04800723…b2a6`;
- the renderer and parser names;
- the explicit request options: `num_ctx` 32768, f16 KV, `num_parallel` 1,
  `think` and `num_predict` explicit, temperature 0 and a fixed seed
  (overriding the blob's temperature 1 / top_k 20 / top_p 0.95).

Moving any of these moves the identity. Every pin is verified by hashing
local files, never by asking the server.

## 4. Preconditions before any Qwen execution

1. **Auto-update off,** and the runtime pinned by hash, with the pending 0.34.3
   and 0.34.4 updates not applied, or re-pinned deliberately.
2. **Cloud off** for the serve process (`OLLAMA_NO_CLOUD=1`). Refuse any model
   name with a `:cloud` or `-cloud` suffix, and any non-loopback host, before
   a request is built.
3. **The Codex/ChatGPT integration** configured on 2026-09-24 is reviewed by the
   user, so that no other client shares the server during an execution.
4. **Explicit options** on every request: `num_ctx`, KV type, `think`,
   `num_predict`, temperature and seed. There are also explicit time budgets:
   at about 9.6 tokens per second, 4,000 thinking tokens take roughly
   7 minutes.
5. **Its own execution record**, filed beside, never inside, an authoritative
   execution:
   - the full pin set;
   - the request options;
   - the input spans;
   - the outputs;
   - the label "non-authoritative assistance".

## 5. How assistance meets the pipeline, later

- **Extraction and indexing** outputs go to a reviewer, or to a later retrieval
  design that is itself held to the efficiency rule (trust spec §3.4). They
  never go into an authoritative role's closure as a substitute for text.
- **Additional objections** are shown to the reviewer as a separate list,
  labelled with their origin. They never enter the prosecutor table or
  `openQuestions`, and they never block or unblock signing.
- **Evaluation.** Qwen's contribution is measured on the held-out set as its
  own arm, for example: did its objections add true positives the Claude
  prosecutors missed, and at what false-positive cost. It is never folded into
  the authoritative arm's score.

## 6. Out of scope here

- Any Qwen code.
- Any Ollama configuration change.
- Any model pull or update.
- Any inference.
- Changing the first S-002 baseline, which is reader → seven prosecutors →
  adjudicator on Claude only.
