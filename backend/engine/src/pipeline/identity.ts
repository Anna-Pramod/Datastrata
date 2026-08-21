/**
 * `pipelineVersion` — derived, never passed in.
 *
 * §5.1 calls this an artifact rather than a label, and the distinction is the
 * whole of this file. A `pipelineVersion` somebody types is a string that can
 * be reused after the thing it named has changed; "pipeline v7 was approved"
 * then resolves to a name rather than to evidence. A derived one cannot be
 * reused that way: change any prompt file, any model identifier, the prosecutor
 * count, the lens set or its order, the result schema version or the closure
 * policy, and the identity moves — which means the promotion record that
 * approved the old one no longer matches, and `verify sign` refuses with
 * `unpromoted_pipeline`.
 *
 * **There is no parameter for the version and no override.** A builder that
 * accepted one would let a caller hand back the identity of a pipeline it is
 * not, and every guarantee downstream rests on that not being possible.
 *
 * **B2 writes no promotion record, ever.** Every identity this produces is
 * unpromoted by construction, so every dossier B2 produces is unsignable by
 * construction rather than unsigned by restraint. Promotion artifacts and the
 * metrics that justify them are B3's.
 *
 * **The digest covers order where order is meaning.** `canonicalJson` sorts
 * object keys and preserves array order, so a re-ordered lens list is a
 * different pipeline and a re-ordered JSON encoding of the same configuration
 * is not — exactly the split `canonical.ts` was built for. It is reused rather
 * than reimplemented: a second canonical serialiser differing by one character
 * is a second answer to "is this the pipeline that was approved".
 *
 * Pure — no filesystem, no clock. `prompts.ts` reads the files; this hashes
 * what it is handed.
 */

import type { ClosurePolicy } from '../corpus/closure';
import { canonicalJson } from '../verification/canonical';
import { sha256Hex } from '../corpus/hash';
import { verificationResultSchema } from '../verification/result';
import type { RoleName } from './roles';
import type { RoleConfig } from './config';

/**
 * The result schema version, read off the schema rather than restated.
 *
 * `result.ts` holds it as a `z.literal`, and that literal is what rejects a
 * result written against a future shape. Copying the string here would create a
 * second declaration that a schema bump could leave behind — and §5.1 puts
 * `resultSchemaVersion` inside `pipelineVersion` precisely so that two
 * structurally different factories cannot claim one schema identity.
 */
export const RESULT_SCHEMA_VERSION: string =
  verificationResultSchema.shape.resultSchemaVersion.value;

/**
 * The scheme by which the digest below is taken.
 *
 * Carried in the identity string so that a future change to *what* is hashed is
 * visible in the value rather than silently producing a different number for
 * the same pipeline.
 */
export const PIPELINE_IDENTITY_SCHEME = 'v1';

/** Everything §5.1 says the identity pins, and nothing else. */
export interface PipelineIdentityInput {
  /** Per-role SHA-256 of the prompt **file**. See `prompts.ts`. */
  promptSha256: Readonly<Record<RoleName, string>>;
  /** Exact model identifier per role. */
  models: Readonly<Record<RoleName, string>>;
  /** Prosecutor count, lens set and ordering. */
  roleConfig: Pick<RoleConfig, 'prosecutorCount' | 'lenses' | 'order'>;
  resultSchemaVersion: string;
  /** The traversal policy the entitled closure was computed under. */
  closurePolicy: ClosurePolicy;
}

/**
 * The exact structure that is hashed.
 *
 * Written out field by field rather than spreading the input, so that adding a
 * field to `PipelineIdentityInput` without deciding whether it belongs in the
 * identity is a compile-time question rather than a silent change of every
 * identity in the repository.
 */
function identityPayload(input: PipelineIdentityInput): unknown {
  return {
    scheme: PIPELINE_IDENTITY_SCHEME,
    prompts: {
      reader: input.promptSha256.reader,
      prosecutor: input.promptSha256.prosecutor,
      adjudicator: input.promptSha256.adjudicator,
    },
    models: {
      reader: input.models.reader,
      prosecutor: input.models.prosecutor,
      adjudicator: input.models.adjudicator,
    },
    roleConfig: {
      prosecutorCount: input.roleConfig.prosecutorCount,
      lenses: [...input.roleConfig.lenses],
      order: [...input.roleConfig.order],
    },
    resultSchemaVersion: input.resultSchemaVersion,
    closurePolicy: {
      referenceDepth: input.closurePolicy.referenceDepth,
      structuralKinds: [...input.closurePolicy.structuralKinds],
      referenceKinds: [...input.closurePolicy.referenceKinds],
    },
  };
}

/**
 * The identity, as it appears in a result and in a signature.
 *
 * `pipeline-v1-<64 hex>`. Prefixed rather than bare so a reader of
 * `signatures.jsonl` can tell what the string is, and so `isPromoted`'s exact
 * string equality (never a prefix test) has something legible to compare.
 */
export function buildPipelineIdentity(input: PipelineIdentityInput): string {
  return `pipeline-${PIPELINE_IDENTITY_SCHEME}-${sha256Hex(canonicalJson(identityPayload(input)))}`;
}
