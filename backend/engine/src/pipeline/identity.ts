/**
 * `pipelineVersion` — derived, never passed in.
 *
 * §5.1 calls this an artifact rather than a label, and the distinction is the
 * whole of this file. A `pipelineVersion` somebody types is a string that can
 * be reused after the thing it named has changed; "pipeline v7 was approved"
 * then resolves to a name rather than to evidence. A derived one cannot be
 * reused that way: change any prompt file, any model identifier, the prosecutor
 * count, the lens set or its order, the result schema version, the closure
 * policy, the provider adapter's semantic identity or, where an adapter
 * declares one, the invocation it makes, and the identity moves —
 * which means the promotion record that approved the old one no longer matches,
 * and `verify sign` refuses with `unpromoted_pipeline`.
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
import type { InvocationIdentity, ProviderAdapterIdentity } from './provider-adapter';

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
 * Carried in the identity string so that a change to *what* is hashed is visible
 * in the value rather than silently producing a different number for the same
 * pipeline.
 *
 * `v2` adds the provider adapter's semantic identity. Every identity moves, and
 * that is the point rather than a cost: a `v1` identity was derived without any
 * statement about how a provider's response envelope is read, so it cannot
 * describe a run that reads one. A promotion record for a `v1` identity does not
 * match a `v2` pipeline, which is the behaviour that stops evidence gathered
 * before this distinction existed from carrying across it.
 *
 * `v3` adds two things to what is hashed: the closure policy's behavioural
 * `expansion` rule, because traversal that consults standing is a different
 * pipeline from one that does not, and `closureRendererVersion`, because the
 * model-facing closure text gained a grammar and a version of its own. Both are
 * changes to *what* is hashed, which is exactly the event this constant exists
 * to make visible.
 */
export const PIPELINE_IDENTITY_SCHEME = 'v3';

/** Everything §5.1 says the identity pins, and nothing else. */
export interface PipelineIdentityInput {
  /** Per-role SHA-256 of the prompt **file**. See `prompts.ts`. */
  promptSha256: Readonly<Record<RoleName, string>>;
  /** Exact model identifier per role. */
  models: Readonly<Record<RoleName, string>>;
  /** Prosecutor count, lens set and ordering. */
  roleConfig: Pick<RoleConfig, 'prosecutorCount' | 'lenses' | 'order'>;
  resultSchemaVersion: string;
  /**
   * The grammar the roles' closure text was rendered under. Supplied by the
   * orchestrator from `CLOSURE_RENDERER_VERSION`, exactly as
   * `resultSchemaVersion` is supplied from its schema — never authored by a
   * caller of the pipeline.
   */
  closureRendererVersion: string;
  /** The traversal policy the entitled closure was computed under, `expansion` included. */
  closurePolicy: ClosurePolicy;
  /**
   * Which provider semantics the run is defined over (`provider-adapter.ts`).
   *
   * Here rather than in provenance because a projection decides what the model's
   * answer was: one envelope, two defensible readings, two different
   * `outputJson` strings, potentially two different dossiers. A provenance-only
   * field would let B3 promote one reading while a later run executed the other
   * under the same identity.
   *
   * The declared identity only — never the adapter's code, its endpoint or its
   * credential. `ProviderEndpointConfig` records why routing is not semantics.
   */
  providerAdapter: ProviderAdapterIdentity;
  /**
   * The invocation the adapter declares, where its identity does not imply it
   * (`InvocationIdentity`): effort, output ceiling and pinned executable, and
   * the launch controls and the permission mode where it declares them.
   *
   * Absent for every adapter that declares none, and then absent from the
   * payload as well, so the identities derived without it — the HTTP route's,
   * the one the committed S-001 recording is bound to, `claude-code-cli@1`'s —
   * are unchanged by its existence.
   */
  invocation?: InvocationIdentity;
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
    closureRendererVersion: input.closureRendererVersion,
    // Both fields, written out. Hashing only `id` would make a version bump —
    // the one signal an author has that semantics moved — invisible.
    providerAdapter: {
      id: input.providerAdapter.id,
      version: input.providerAdapter.version,
    },
    closurePolicy: {
      referenceDepth: input.closurePolicy.referenceDepth,
      structuralKinds: [...input.closurePolicy.structuralKinds],
      referenceKinds: [...input.closurePolicy.referenceKinds],
      // Behavioural, not a label: `computeClosure` reads it, so a policy that
      // hashes as standing-aware is one that traverses standing-aware.
      expansion: input.closurePolicy.expansion,
    },
    // Field by field, for the reason `providerAdapter` is: an extra key on the
    // declared object must not reach the digest. And only when declared.
    // Absent is no key at all — never `null`, never `{}` — because either of
    // those is a new payload for every identity derived without an
    // invocation, and would move the HTTP identity and the S-001 recording's
    // binding with it. `canonicalJson` would drop an `undefined` value by
    // itself; the key is left out here rather than relying on that, so the
    // absence is this function's decision and not a side effect of the
    // serialiser.
    ...(input.invocation === undefined
      ? {}
      : {
          invocation: {
            effort: input.invocation.effort,
            maxOutputTokens: input.invocation.maxOutputTokens,
            executable: {
              version: input.invocation.executable.version,
              sha256: input.invocation.executable.sha256,
            },
            // The launch controls, only when declared, for the reason the
            // invocation itself is: absent is no key at all, never `null` or
            // `{}`, so every identity derived over an invocation without
            // controls (the present-invocation golden among them) is
            // unchanged. When declared, every entry is hashed — the map is
            // the declaration — copied into a new object whose keys
            // `canonicalJson` orders, so two orders of one map are one
            // pipeline.
            ...(input.invocation.controls === undefined
              ? {}
              : { controls: Object.fromEntries(Object.entries(input.invocation.controls)) }),
            // The permission mode, only when declared, for the same reason:
            // absent is no key at all, so every identity derived over an
            // invocation without one (`@2`'s among them) is unchanged.
            ...(input.invocation.permissionMode === undefined ? {} : { permissionMode: input.invocation.permissionMode }),
          },
        }),
  };
}

/**
 * The identity, as it appears in a result and in a signature.
 *
 * `pipeline-<scheme>-<64 hex>`, currently `pipeline-v3-…`. Prefixed rather than
 * bare so a reader of
 * `signatures.jsonl` can tell what the string is, and so `isPromoted`'s exact
 * string equality (never a prefix test) has something legible to compare.
 */
export function buildPipelineIdentity(input: PipelineIdentityInput): string {
  return `pipeline-${PIPELINE_IDENTITY_SCHEME}-${sha256Hex(canonicalJson(identityPayload(input)))}`;
}
