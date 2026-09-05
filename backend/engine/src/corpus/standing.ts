/**
 * Temporal standing, projected per `(document, served source)`.
 *
 * The knowledge pack owns an instrument's temporal standing — whether it is in
 * force, adopted but not yet effective, proposed or superseded — because the
 * pack already determines with it (`packFlags`, and the requirement that
 * branches on them). The corpus owns what an artefact *is* — its authenticity
 * and which of its sections are non-operative — because those are properties
 * of the artefact. Neither fact is copied onto the other's store, and a role is
 * shown a projection assembled at entitlement from both.
 *
 * This module is the one place that assembles that projection. `closure.ts`
 * stays pure over `CorpusIndex` and is handed the map this builds; a second
 * derivation elsewhere would be a second answer to "what standing did this
 * closure carry", and the two would diverge exactly when it mattered.
 *
 * **Absence is absence.** A source the pack does not classify — official
 * guidance, a hub, a tracker — yields `null` here, never a default. A closure
 * member served by such a source is refused at construction
 * (`MissingStandingError`), because showing a document to a model without
 * saying whether its law is in force is the failure standing exists to end.
 * Nothing infers a standing from `versionLabel`, from authenticity or from the
 * free-text `statusNote`.
 */

import type { KnowledgePack, TemporalStanding } from '../types';
import type { ArtefactAuthenticity, CorpusIndex } from './types';

/** One served source's standing as the pack declares it, or `null` if it does not. */
export interface SourceStanding {
  readonly sourceId: string;
  readonly temporalStanding: TemporalStanding | null;
}

/**
 * Per document, one entry per `serves[]` id, sorted by `sourceId`.
 *
 * A list rather than a reduction: a multi-source artefact must not silently
 * lose one source's standing, and the multi-source case is exactly where a
 * reader needs to know *which* source is not yet effective.
 */
export type StandingMap = ReadonlyMap<string, readonly SourceStanding[]>;

/**
 * What a role is shown beside a document: the artefact's own two facts and the
 * pack's standing for every source it serves. Only ever built for a closure
 * member, after `MissingStandingError` has had its chance, so no standing here
 * is `null`.
 */
export interface DocumentStanding {
  readonly artefactAuthenticity: ArtefactAuthenticity;
  readonly nonOperativeSections: readonly string[];
  readonly sources: readonly { readonly sourceId: string; readonly temporalStanding: TemporalStanding }[];
}

/**
 * The map `computeClosure` is handed: every document in the index, every
 * source it serves, the pack's standing or `null`.
 *
 * Built over the whole index rather than over a closure, because traversal has
 * to ask about a neighbour *before* deciding whether it joins the closure.
 * Refusal is still per closure member — see `computeClosure`.
 */
export function standingMapFor(
  index: CorpusIndex,
  pack: Pick<KnowledgePack, 'sources'>,
): StandingMap {
  const declared = new Map<string, TemporalStanding | null>();
  for (const source of pack.sources) declared.set(source.id, source.temporalStanding ?? null);
  const map = new Map<string, readonly SourceStanding[]>();
  for (const document of index.documents) {
    const entries = [...document.serves]
      .sort()
      .map((sourceId) => ({ sourceId, temporalStanding: declared.get(sourceId) ?? null }));
    map.set(document.docId, entries);
  }
  return map;
}

/**
 * The non-null standing of one closure member, or a refusal.
 *
 * `computeClosure` has already refused every member that would carry a null,
 * so for a closure member this narrows a fact it established; for any other
 * document it is the same fail-closed rule applied once more.
 */
export function pinnedStandingFor(
  standing: StandingMap,
  docId: string,
): { sourceId: string; temporalStanding: TemporalStanding }[] {
  const sources = standing.get(docId);
  if (sources === undefined) throw new MissingStandingError([{ docId, sourceId: '(document not in standing map)' }]);
  const missing = sources.filter((s) => s.temporalStanding === null).map((s) => ({ docId, sourceId: s.sourceId }));
  if (missing.length > 0) throw new MissingStandingError(missing);
  return sources.map((s) => ({ sourceId: s.sourceId, temporalStanding: s.temporalStanding as TemporalStanding }));
}

/**
 * A closure member served by a source whose standing the pack does not state.
 *
 * Every pair is reported, never only the first, and the message names the
 * source: the remedy is to declare `temporalStanding` on that source in the
 * pack — or to leave the document out of the corpus — never to default it.
 */
export class MissingStandingError extends Error {
  constructor(readonly failures: readonly { docId: string; sourceId: string }[]) {
    super(
      `Refusing to close over documents whose served sources carry no temporal standing:\n${failures
        .map((f) => `  - ${f.docId} is served by ${f.sourceId}, for which the pack declares no temporalStanding`)
        .join('\n')}`,
    );
    this.name = 'MissingStandingError';
  }
}
