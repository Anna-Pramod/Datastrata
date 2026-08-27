/**
 * The corpus authority boundary: a document must earn its claim to a source.
 *
 * # What this proves, exactly
 *
 * For every `(document, sourceId)` pair a corpus asserts through
 * `CorpusDocument.serves[]`, that the source has authorised the origin the
 * document **records**.
 *
 * It does **not** prove:
 *
 * - that the bytes were fetched from that URL — a local actor able to edit the
 *   corpus can edit `url`, the bytes and the hashes together, and nothing here
 *   detects that. Artefact authenticity is envelope E2's;
 * - that the artefact is the legally authentic publication — a EUR-Lex
 *   consolidation is an authorised origin for `SRC-001` and is admitted here,
 *   without that admitting anything about which text has legal effect (§7.1);
 * - that any requirement may cite the source. That is
 *   `verifyRequirementCitability`'s question, settled against
 *   `governingAuthorities`, and this module reads no tier at all.
 *
 * The last one is the separation worth restating, because collapsing it is the
 * obvious mistake: **a corpus may legitimately hold documents for sources no
 * requirement cites.** `SRC-004` is exactly that today — served by a committed
 * document, cited by nothing since the S-004 correction. A validator that
 * demanded citability would reject a corpus that is entirely correct.
 *
 * # Why a brand
 *
 * `EntitledClosure.forSources` accepts a structural corpus, deliberately, so a
 * caller holding a corpus by another route can still build an entitlement. That
 * openness is the bypass: a hand-written index satisfies the shape and produces
 * an entitled closure with no authority check anywhere. Requiring a value that
 * can only be produced here gives the invariant by construction rather than by
 * remembering to call something.
 *
 * **The brand is a fence, not the mechanism.** TypeScript is erased at runtime
 * and `as` defeats it; what actually holds is that the only function returning
 * this type validates first, and every composition root goes through it. There
 * is no test-only unsafe constructor — a bypass that exists for tests is one
 * production eventually imitates — so fixtures validate too.
 *
 * Narrowing `forSources` and converting the composition roots is T5.4; this
 * module is the boundary those will consume.
 */

import type { KnowledgePack } from '../types';
import type { SourceRegister } from '../monitoring/types';
import { originAuthorises } from '../monitoring/origin';
import type { CorpusDocument, CorpusIndex } from './types';

/**
 * The read surface an authorised corpus offers.
 *
 * Structurally what `EntitledClosure` consumes, declared here so the corpus
 * layer does not import the pipeline to describe its own output.
 */
export interface CorpusCapability {
  index: CorpusIndex;
  document(docId: string): CorpusDocument;
  normalizedText(docId: string): string;
}

declare const authorisedCorpus: unique symbol;

/**
 * A corpus whose every `(document, source)` claim has been validated.
 *
 * Generic in the input so authorisation **adds** the brand rather than
 * narrowing the value: `authoriseCorpus(loadCorpus(dir), …)` is still a
 * `LoadedCorpus`, `rawText` and all. A boundary that stripped capabilities
 * would push callers back to the raw object to get them again, which is the
 * bypass it exists to close.
 */
export type AuthorisedCorpus = CorpusCapability & { readonly [authorisedCorpus]: true };

/** Why one `(document, source)` pair was refused. */
export type AuthorityFailureReason = 'unknown source' | 'no declaration' | 'no matching authorised origin';

export interface AuthorityFailure {
  docId: string;
  sourceId: string;
  url: string;
  reason: AuthorityFailureReason;
}

/**
 * Every pair that failed, with the deterministic context needed to fix it.
 *
 * The message carries ids and the recorded URL and nothing else: no rationale
 * prose, because prose is not what decided this, and a message quoting it would
 * suggest otherwise.
 */
export class CorpusAuthorityError extends Error {
  constructor(readonly failures: readonly AuthorityFailure[]) {
    super(
      `Corpus authority failed for ${failures.length} document/source pair(s):\n` +
        failures
          .map((f) => ` - ${f.docId} claims ${f.sourceId} with origin ${f.url} — ${f.reason}`)
          .join('\n'),
    );
    this.name = 'CorpusAuthorityError';
  }
}

/**
 * Validate every claim the corpus makes, then brand it.
 *
 * Each `(document, sourceId)` pair is decided **independently**: a document
 * serving two sources must satisfy both, and one passing source never confers
 * authority on the other. Failures accumulate so one load reports every problem
 * rather than the first.
 */
export function authoriseCorpus<T extends CorpusCapability>(
  corpus: T,
  register: SourceRegister,
  pack: KnowledgePack,
): T & AuthorisedCorpus {
  assertCorpusAuthority(corpus.index, register, pack);
  return corpus as T & AuthorisedCorpus;
}

/**
 * The validation itself, over an index alone.
 *
 * Separate from `authoriseCorpus` because the ingest preflight has no corpus
 * *capability* to brand — it holds a candidate index in memory, assembled but
 * not yet written, and there is nothing to read text from. Handing that path a
 * fabricated capability whose `normalizedText` must never be called would be a
 * lie the day authorisation grows to read text.
 *
 * **One validator, one matcher, two entry points.** `authoriseCorpus` is this
 * plus the brand. Nothing else decides authority.
 */
export function assertCorpusAuthority(
  index: CorpusIndex,
  register: SourceRegister,
  pack: KnowledgePack,
): void {
  const known = new Set(pack.sources.map((s) => s.id));
  const declared = new Map(register.authorisedOrigins.map((row) => [row.sourceId, row.origins]));
  const failures: AuthorityFailure[] = [];

  for (const document of index.documents) {
    for (const sourceId of document.serves) {
      const failure = (reason: AuthorityFailureReason) =>
        failures.push({ docId: document.docId, sourceId, url: document.url, reason });

      if (!known.has(sourceId)) {
        failure('unknown source');
        continue;
      }
      const origins = declared.get(sourceId);
      if (origins === undefined || origins.length === 0) {
        // Fail closed. A source with no declaration has authorised nothing, so
        // a document claiming it is claiming a permission that was never given.
        failure('no declaration');
        continue;
      }
      if (!origins.some((origin) => originAuthorises(origin, document.url))) {
        failure('no matching authorised origin');
      }
    }
  }

  if (failures.length > 0) throw new CorpusAuthorityError(failures);
}
