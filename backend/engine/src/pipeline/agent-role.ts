/**
 * Turning a prompt file, a model and a runner into an `AgentRole`.
 *
 * One factory rather than three role classes, because every role does the same
 * four things in the same order and the differences are data: which prompt file,
 * which model, how its input renders, and which schema its output is checked
 * against. Three near-identical classes would give three places for the
 * transcript to be assembled slightly differently, and the transcript is what
 * the machinery suite replays.
 *
 * The order is load-bearing:
 *
 *  1. Assemble the messages — the prompt **file's text**, then the interpolated
 *     inputs. Both go into the transcript; only the file is hashed (`prompts.ts`).
 *  2. Hand them to the injected runner. Nothing here knows whether it replays or
 *     calls a model.
 *  3. Parse the response as JSON. A response that is not JSON is a transport
 *     failure named against the role, not a schema failure.
 *  4. Validate at the seam. A response that is JSON but not this role's shape is
 *     a `RoleOutputError` naming the role, its index and every problem — which
 *     is the difference between "prosecutor[1] returned a `verdict` field it may
 *     not emit" and an invalid `verification-result.json` three stages later.
 *
 * `model` and `promptSha256` are recorded on the execution *and* on the
 * transcript, from the same values used to make the call, because §5.1 makes
 * them `pipelineVersion` inputs and B3 cannot measure a run whose provenance is
 * reconstructed from configuration afterwards.
 */

import {
  RoleTransportError,
  type AgentRole,
  type PinFree,
  type RoleExecution,
  type RoleName,
  type RoleOutputParser,
  type RoleRequest,
} from './roles';
import type { AgentRunner } from './runner';
import type { RolePrompt } from './prompts';
import type { RoleTranscript, TranscriptMessage } from './transcript';

export interface AgentRoleSpec<I, O extends PinFree<O>> {
  name: RoleName;
  /** `0` for reader and adjudicator; the prosecutor's ordinal otherwise. */
  index: number;
  model: string;
  prompt: RolePrompt;
  runner: AgentRunner;
  /** How this run's inputs are written into the message the role receives. */
  renderInput(input: I): string;
  /** The seam. `role-outputs.ts` supplies the zod-backed parsers. */
  parse: RoleOutputParser<O>;
}

export function createAgentRole<I, O extends PinFree<O>>(spec: AgentRoleSpec<I, O>): AgentRole<I, O> {
  const { name, index, model, prompt, runner } = spec;
  return {
    name,
    index,
    model,
    promptSha256: prompt.sha256,
    async run(input: I): Promise<RoleExecution<O>> {
      const messages: TranscriptMessage[] = [
        { from: 'prompt', content: prompt.text },
        { from: 'input', content: spec.renderInput(input) },
      ];
      const request: RoleRequest = {
        role: name,
        index,
        model,
        promptSha256: prompt.sha256,
        messages,
      };

      const response = await runner.run(request);

      let raw: unknown;
      try {
        raw = JSON.parse(response.outputJson);
      } catch (error) {
        throw new RoleTransportError(
          name,
          index,
          `the response is not JSON — ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      const output = spec.parse(raw);

      const transcript: RoleTranscript = {
        role: name,
        index,
        model,
        promptSha256: prompt.sha256,
        messages: [...messages, { from: 'agent', content: response.outputJson }],
        outputJson: response.outputJson,
      };

      return { output, transcript, model, promptSha256: prompt.sha256 };
    },
  };
}
