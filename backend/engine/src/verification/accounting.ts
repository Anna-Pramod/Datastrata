/**
 * Field accounting — the guard that closes the class rather than the instance.
 *
 * B1b-i shipped a renderer, a feature checker and a grammar contract that all
 * agreed about every variant they knew, while `in_catalogue.missReason` slipped
 * past all three: a field nobody had classified, so nobody noticed it decided
 * nothing and was verified by no one. Exhaustiveness over *variants* was not
 * enough, because the thing that escaped was not a variant.
 *
 * So the question this file asks is not "is this field used?" — a field can be
 * read in five places and still be a hole — but **what kind of authority does
 * this field exercise?** Every path in the record and the ledger must carry at
 * least one of six roles, and a field cannot come into existence without
 * someone answering that question for it.
 *
 * **The path set comes from the runtime zod schemas, never from a TypeScript
 * interface.** That is the whole reason the guard can be complete: TypeScript
 * is gone by the time anything runs and cannot be walked, so a guard written
 * against interfaces would be a second hand-maintained list — which is the
 * artefact whose drift caused the original failure. zod exists at runtime, and
 * a schema is the same object the parser uses, so a field cannot be in the
 * contract and out of the walk.
 *
 * **It fails in both directions, and the second direction is the important
 * one.** A path a schema emits with no classification is the obvious half. A
 * classified path no schema emits is the half that hides a removal: a stale row
 * is a lie about the shape, and a guard checking only the first direction
 * reports "all accounted for" over a table describing fields that are gone.
 *
 * **The walk fails closed.** An unrecognised node kind throws, naming the kind
 * and the path. It is never treated as a leaf, because that is precisely how
 * this guard would reopen the hole it exists to close: wrap a nested object in
 * `.refine()` for some perfectly reasonable cross-field rule, and a lenient
 * walker emits the composite as one row, sees it classified, and reports clean
 * while every field beneath it goes unaccounted. `result.ts` and `ledger.ts`
 * both carry a note forbidding refinements for this reason; this is the check
 * that makes the note enforceable rather than aspirational.
 *
 * **Containers are paths, and a container's role never covers its
 * descendants.** Whether `openQuestions[]` is non-empty is what decides
 * signability, and a leaf-only model cannot express collection cardinality — so
 * an array emits `<path>[]` and a record emits `<path>{}`, each a row in its
 * own right, and then their contents are emitted beneath it. But the container
 * being classified says nothing about what is inside it. Otherwise "the
 * container is accounted for" becomes the same excuse "the op has a handler"
 * was in B1b-i.
 *
 * A plain object, by contrast, emits no row of its own — only the keys it
 * qualifies. There is nothing to classify about `result.reading`: its presence
 * is fixed by the schema, so unlike a collection it carries no fact a role
 * could describe. Every field beneath it is emitted and must be classified
 * individually.
 *
 * **Keys are schema-qualified.** `result.requirementVersion` and
 * `ledger.signing.requirementVersion` are distinct rows carrying different
 * roles, and a bare `requirementVersion` would let a role appropriate to one
 * artefact silently govern the other.
 *
 * Pure — no filesystem, no network, no clock.
 */

import { z } from 'zod';
import { revocationEntrySchema, signingEntrySchema } from './ledger';
import { promotionRecordSchema } from './promotions';
import { verificationResultSchema } from './result';

/**
 * The six roles, with the meanings spec §6.1 gives them:
 *
 *  - `authority`  — determines routing, governing state, or status
 *  - `signability` — the candidate must satisfy this before signing
 *  - `freshness`  — participates in post-signing validity and reason derivation
 *  - `integrity`  — malformed, tampered or missing state is a hard failure
 *  - `display`    — shown to a human; decides nothing
 *  - `audit`      — retained for the record; decides nothing
 *
 * **`freshness`, not `staleness`.** Taking part in the derivation is not the
 * same as invalidating. `corpus[].sha256Raw` takes part and yields
 * `source_reissued`, which is advisory only. A role defined as "invalidates"
 * would misdescribe it — and misdescription in this table is how the last hole
 * opened. Whether a reason blocks is `staleness.ts`'s business; this
 * classification says only that the field takes part.
 */
export type FieldRole = 'authority' | 'signability' | 'freshness' | 'integrity' | 'display' | 'audit';

/** Every accounting discrepancy found in one pass, never only the first. */
export class FieldAccountingError extends Error {
  problems: string[];

  constructor(problems: string[]) {
    super(`Field accounting is incomplete:\n  ${problems.join('\n  ')}`);
    this.name = 'FieldAccountingError';
    this.problems = problems;
  }
}

/** Terminal node kinds: a value, with nothing beneath it to descend into. */
const TERMINALS: ReadonlySet<string> = new Set([
  z.ZodFirstPartyTypeKind.ZodString,
  z.ZodFirstPartyTypeKind.ZodNumber,
  z.ZodFirstPartyTypeKind.ZodBoolean,
  z.ZodFirstPartyTypeKind.ZodLiteral,
  z.ZodFirstPartyTypeKind.ZodEnum,
]);

/** Wrapper kinds: they qualify a value's presence, not its position. */
const WRAPPERS: ReadonlySet<string> = new Set([
  z.ZodFirstPartyTypeKind.ZodOptional,
  z.ZodFirstPartyTypeKind.ZodNullable,
  z.ZodFirstPartyTypeKind.ZodDefault,
]);

/** Union kinds: several shapes at one position, so every option is walked. */
const UNIONS: ReadonlySet<string> = new Set([
  z.ZodFirstPartyTypeKind.ZodUnion,
  z.ZodFirstPartyTypeKind.ZodDiscriminatedUnion,
]);

/**
 * One node's contribution, accumulated into `out`.
 *
 * The switch is closed by construction: anything not named here throws rather
 * than falling through to a leaf. Note that a discriminated union's
 * discriminator is not always a `ZodLiteral` — `signingEntrySchema.kind` is a
 * `ZodEnum` of two values while `revocationEntrySchema.kind` is a literal — so
 * the terminal set covers both and nothing here reads the discriminator
 * specially.
 */
function walk(node: z.ZodTypeAny, path: string, out: Set<string>): void {
  const def = node._def as { typeName?: unknown; innerType?: unknown; options?: unknown };
  const typeName = typeof def.typeName === 'string' ? def.typeName : '<unknown>';

  if (typeName === z.ZodFirstPartyTypeKind.ZodObject) {
    const shape = (node as z.ZodObject<z.ZodRawShape>)._def.shape();
    for (const [key, child] of Object.entries(shape)) {
      walk(child as z.ZodTypeAny, path === '' ? key : `${path}.${key}`, out);
    }
    return;
  }

  if (typeName === z.ZodFirstPartyTypeKind.ZodArray) {
    // The `[]` form *is* the container path — there is deliberately no bare
    // `openQuestions` row beside `openQuestions[]`. Descendants hang off the
    // `[]` form, so an element's key reads `challenges[].verdict`.
    const container = `${path}[]`;
    out.add(container);
    walk((node as z.ZodArray<z.ZodTypeAny>)._def.type, container, out);
    return;
  }

  if (typeName === z.ZodFirstPartyTypeKind.ZodRecord) {
    const container = `${path}{}`;
    out.add(container);
    walk((node as z.ZodRecord<z.ZodTypeAny, z.ZodTypeAny>)._def.valueType, container, out);
    return;
  }

  if (WRAPPERS.has(typeName)) {
    walk(def.innerType as z.ZodTypeAny, path, out);
    return;
  }

  if (UNIONS.has(typeName)) {
    // `_def.options` is an array for both union kinds. Every option is walked
    // and the results unioned, so a path carried by one variant alone still
    // appears — a revocation-only field is as accountable as a shared one.
    for (const option of def.options as z.ZodTypeAny[]) walk(option, path, out);
    return;
  }

  if (TERMINALS.has(typeName)) {
    // An array of scalars lands here at its own `[]` path, which is already in
    // `out`; the set absorbs it. That is the right answer rather than a
    // coincidence — a scalar element has no key of its own, so the container
    // path is the only path it has.
    out.add(path);
    return;
  }

  throw new FieldAccountingError([
    `${path === '' ? '<root>' : path}: unrecognised zod node kind ${typeName}; the walker refuses rather than guessing, because treating an unfamiliar node as a leaf would classify a whole composite as one field and hide every field beneath it`,
  ]);
}

/**
 * Every accountable path in `schema`, sorted and deduplicated.
 *
 * `prefix` qualifies the paths by schema so that two artefacts carrying a field
 * of the same name get distinct rows. Passing none yields bare paths, which is
 * what the fixture tests use.
 */
export function accountablePaths(schema: z.ZodTypeAny, prefix = ''): string[] {
  const out = new Set<string>();
  walk(schema, prefix, out);
  return [...out].sort();
}

/**
 * The schemas the guard holds to account, and the names their paths carry.
 *
 * The two ledger variants are walked **separately** rather than through
 * `ledgerEntrySchema`, because a union walk merges the variants into one path
 * set and `ledger.signing.entryId` and `ledger.revocation.entryId` are
 * different rows: one names what an entry pinned, the other names what a
 * withdrawal identifies. Walking the union would collapse them and let a role
 * chosen for one govern the other — the same mistake as a bare
 * `requirementVersion`, one level up. `ledgerEntrySchema` is deliberately absent
 * here rather than forgotten: the tests assert that walking it yields exactly
 * the union of the two variants' paths, so the discriminated-union traversal
 * stays covered without the union's merged names ever becoming classifiable
 * rows.
 */
export const RECORD_SCHEMAS: Record<string, z.ZodTypeAny> = {
  result: verificationResultSchema,
  'ledger.signing': signingEntrySchema,
  'ledger.revocation': revocationEntrySchema,
  promotion: promotionRecordSchema,
};

/**
 * What authority each field exercises. Schema-qualified, path-level, and
 * complete — `assertFieldAccounting` fails until it is.
 *
 * The ledger rows and six of the result rows are given verbatim by the plan and
 * by spec §6.2. The rest are reasoned from §6.1's definitions and from record
 * design §4.1, whose consequence for the result side is worth stating here
 * because it decides most of these rows:
 *
 * **Nested result fields do not each carry `freshness`.** A signature pins
 * `resultSha256`, so *any* post-signing edit anywhere inside the record moves
 * that one hash and surfaces as `stale_result`. One invalidation mechanism
 * covers the whole record, and marking every nested field `freshness` as well
 * would claim a second, independent derivation that does not exist — the table
 * would then describe a mechanism nobody implemented, which is exactly the
 * class of error §6 exists to prevent. `result.resultSchemaVersion` is
 * `integrity` for the same reason: it decides whether the record can be read at
 * all, not whether it has gone stale.
 *
 * The ledger side is the opposite: its hash fields are compared one by one
 * against the world by `deriveStaleness`, so each genuinely participates and
 * each is `freshness`.
 */
export const FIELD_ROLES: Record<string, FieldRole[]> = {
  // ── ledger, signing variant ────────────────────────────────────────────
  // Verbatim from the plan.
  'ledger.signing.kind': ['authority'],
  'ledger.signing.packId': ['authority'],
  'ledger.signing.requirementId': ['authority'],
  'ledger.signing.entryId': ['integrity', 'audit'],
  'ledger.signing.requirementVersion': ['integrity', 'audit'],
  'ledger.signing.requirementSha256': ['integrity', 'audit'],
  'ledger.signing.requirementInputSha256': ['freshness', 'audit'],
  'ledger.signing.conditionSha256': ['freshness', 'audit'],
  'ledger.signing.renderedConditionSha256': ['freshness', 'audit'],
  'ledger.signing.rendererVersion': ['audit'],
  'ledger.signing.corpusClosureSha256': ['freshness', 'audit'],
  'ledger.signing.corpus[]': ['freshness', 'audit'],
  'ledger.signing.corpus[].docId': ['integrity', 'audit'],
  'ledger.signing.corpus[].sha256Normalized': ['freshness', 'audit'],
  'ledger.signing.corpus[].sha256Raw': ['freshness', 'audit'],
  'ledger.signing.corpus[].normalizerVersion': ['freshness', 'audit'],
  'ledger.signing.resultSha256': ['freshness', 'integrity', 'audit'],
  'ledger.signing.pipelineVersion': ['signability', 'audit'],
  'ledger.signing.packVersion': ['integrity', 'audit'],
  'ledger.signing.corpus[].versionLabel': ['display', 'audit'],
  'ledger.signing.by': ['display', 'audit'],
  'ledger.signing.on': ['display', 'audit'],
  'ledger.signing.note': ['audit'],

  // ── ledger, revocation variant ─────────────────────────────────────────
  // Verbatim from the plan.
  'ledger.revocation.kind': ['authority'],
  'ledger.revocation.packId': ['authority'],
  'ledger.revocation.requirementId': ['authority'],
  'ledger.revocation.revokes': ['authority', 'integrity'],
  'ledger.revocation.entryId': ['integrity', 'audit'],
  'ledger.revocation.by': ['display', 'audit'],
  'ledger.revocation.on': ['display', 'audit'],
  'ledger.revocation.reason': ['display', 'audit'],

  // ── result, verbatim rows ──────────────────────────────────────────────
  'result.openQuestions[]': ['signability', 'display'],
  'result.challenges[].verdict': ['signability', 'display'],
  'result.challenges[].evidence[]': ['signability', 'audit'],
  'result.gaps[]': ['signability'],
  'result.pipelineVersion': ['signability', 'audit'],
  'result.resultSchemaVersion': ['integrity', 'audit'],

  // ── promotion ledger ───────────────────────────────────────────────────
  // `promotions.jsonl` entered the system carrying three fields no schema map
  // walked, so none had a role — the exact class §6 exists to close, reproduced
  // by the change that added the schema. Classified here rather than left for
  // B3, because a field is unverified from the moment it exists, not from the
  // moment it gains metrics beside it.
  //
  // `signability` because signing refuses a `pipelineVersion` with no promotion
  // record: this string is the whole of what `isPromoted` matches, so it decides
  // whether a candidate may be signed at all. Not `authority` — it selects no
  // route and decides no status; the signature's own `kind` does that. `audit`
  // because it names which pinned set of prompts, models and role configuration
  // was approved, which is what a later reader re-derives the promotion from.
  'promotion.pipelineVersion': ['signability', 'audit'],
  // Who approved the pipeline. The gate asks only whether a record exists, never
  // who wrote it, so this decides nothing — it is the accountable name a
  // reviewer reads. Identical to `ledger.signing.by` because it is the same kind
  // of claim: a person standing behind a decision.
  'promotion.by': ['display', 'audit'],
  // When it was approved. Deliberately `display + audit` and never `authority`,
  // for the same reason the ledger's `on` is: nothing here orders by it,
  // compares it, or parses it into a date, and this row is what stops a later
  // reader deciding that the most recent promotion should win. Promotion is a
  // set-membership question, not a recency one.
  'promotion.on': ['display', 'audit'],

  // ── result, identity and pins ──────────────────────────────────────────
  // `packId`/`requirementId` route the record to the requirement it is a
  // record *of*: the sign gate matches them against the candidate and the
  // ledger entry, so they determine what this record has authority over.
  'result.packId': ['authority'],
  'result.requirementId': ['authority'],
  // The revision this reading was made against. `integrity` because a record
  // whose version does not match the requirement being signed is a hard
  // failure, not drift; `audit` because it is what makes the record
  // interpretable later.
  'result.requirementVersion': ['integrity', 'audit'],
  // Which renderer produced the English the reading was checked against.
  // Deliberately *not* `freshness`: `stale_render` derives from the output
  // hash, never from the version, so a renderer bump that leaves this rule's
  // English unchanged must not invalidate anything. `CurrentState` carries no
  // `rendererVersion` for the same reason.
  'result.rendererVersion': ['audit'],
  // The three encoding pins the record copies from the candidate. On the
  // ledger side these are compared against the world and carry `freshness`;
  // here they are the values the signing entry is built *from*, so their job
  // is to be recorded faithfully and to match the candidate at sign time —
  // `signability` and `audit`. Freshness of the record itself runs through
  // `resultSha256`, per §4.1.
  'result.requirementInputSha256': ['signability', 'audit'],
  'result.conditionSha256': ['signability', 'audit'],
  'result.renderedConditionSha256': ['signability', 'audit'],
  'result.corpusClosureSha256': ['signability', 'audit'],

  // ── result, corpus pins ────────────────────────────────────────────────
  // The container decides what the reasoning is allowed to rest on: every
  // quote must name a pin here, so an empty or wrong pin set is refused before
  // signing. `audit` because the pins are what a later reader re-derives from.
  'result.corpus[]': ['signability', 'audit'],
  // `integrity` for the same reason as `ledger.signing.corpus[].docId`: a
  // repeated docId pins one document at two texts, and
  // `assertResultConsistency` treats that as a hard failure rather than a
  // judgement call.
  'result.corpus[].docId': ['integrity', 'audit'],
  // Checked against every quote's `sha256Normalized` before signing, so the
  // record rests on the text it froze. Not `freshness` — nothing in
  // `deriveStaleness` reads the *result's* copy of a pin; it reads the
  // ledger entry's.
  'result.corpus[].sha256Normalized': ['signability', 'audit'],
  // Carried so the signing entry can pin it and `source_reissued` can later be
  // derived. Nothing in the record itself checks it, so it is `audit` here and
  // `freshness` where it is actually compared.
  'result.corpus[].sha256Raw': ['audit'],
  'result.corpus[].normalizerVersion': ['audit'],
  // The human-readable edition of a document. Decides nothing, exactly as on
  // the ledger side.
  'result.corpus[].versionLabel': ['display', 'audit'],

  // ── result, the reading ────────────────────────────────────────────────
  // A record with no reading has nothing for coverage to be about, and every
  // element needs evidence — the sign gate reads this container's contents.
  'result.reading.elements[]': ['signability', 'audit'],
  // Ids are what coverage cells resolve against, and `assertResultConsistency`
  // makes a duplicate or dangling id a hard failure. That is `integrity`, not
  // `display`: nothing shows the id to a person to decide anything.
  'result.reading.elements[].id': ['integrity', 'audit'],
  // The proposition itself: the thing a human reads on the review sheet, and
  // the thing the record exists to preserve. It decides nothing mechanically.
  'result.reading.elements[].statement': ['display', 'audit'],
  // The text behind a proposition. `signability` because `.min(1)` and the
  // absence-sole rule are both sign-gate conditions; `audit` thereafter, per
  // §4.1 — the identical classification the verbatim table gives
  // `result.challenges[].evidence[]`.
  'result.reading.elements[].evidence[]': ['signability', 'audit'],

  // ── result, coverage ───────────────────────────────────────────────────
  // Whether the reading and the encoding were walked against each other at
  // all. An empty coverage table is a record that never did the comparison.
  'result.coverage.cells[]': ['signability', 'audit'],
  // Which way the cell was walked. It is `audit` rather than `signability`
  // because no gate branches on it — a cell is adverse or not regardless of
  // direction — and `display` because the review sheet groups by it.
  'result.coverage.cells[].direction': ['display', 'audit'],
  // A reference that must resolve to a reading element; a stated id naming
  // nothing is a coverage claim about a proposition the reading never made,
  // and `assertResultConsistency` rejects it outright.
  'result.coverage.cells[].readingElementId': ['integrity', 'audit'],
  // Where in the condition the cell landed. Human-facing and audited; nothing
  // resolves it against the condition tree at this layer.
  'result.coverage.cells[].conditionPath': ['display', 'audit'],
  // The verdict the sign gate reads: an adverse cell must name an adjudicating
  // challenge, and the review sheet shows it. Matched to the verbatim
  // classification of `result.challenges[].verdict`, which is the same kind of
  // field one layer over.
  'result.coverage.cells[].verdict': ['signability', 'display'],
  // The link that stops an `UNMAPPED` cell being signed with the adjudicator's
  // judgement bypassed. It must resolve to a real challenge, and a `MAPPED`
  // cell carrying one is rejected — both hard failures, hence `integrity`
  // alongside `signability`.
  'result.coverage.cells[].challengeId': ['signability', 'integrity'],

  // ── result, challenges ─────────────────────────────────────────────────
  // The container: whether the record was challenged at all, and what the
  // adverse cells resolve into.
  'result.challenges[]': ['signability', 'audit'],
  // As with reading element ids: uniqueness and resolution are hard failures.
  'result.challenges[].id': ['integrity', 'audit'],
  // Which adversarial lens produced the challenge. Shown to a reviewer,
  // retained for the record, decides nothing.
  'result.challenges[].lens': ['display', 'audit'],
  'result.challenges[].statement': ['display', 'audit'],
  // A reached verdict must state what was reached, and a blank one is rejected
  // — that is a sign-gate condition. It is also the sentence a human reads to
  // decide whether to sign, so `display` too.
  'result.challenges[].resolution': ['signability', 'display'],
  // The adjudicator's own evidence, classified identically to the prosecutor's
  // `result.challenges[].evidence[]` rather than more weakly: `.min(1)` and the
  // absence-sole rule are sign-gate conditions on this array exactly as on that
  // one (`signability`), and it is re-derivable against the pinned corpus
  // afterwards (`audit`). Matching that row is the point — a reader must not be
  // able to conclude the newer array is the weaker one, when the reason it
  // exists is that §3.3 binds an adjudicated verdict to evidence just as §2.2
  // binds a raised challenge.
  //
  // Deliberately not `display`. What a reviewer reads to decide is
  // `resolution`; this array is what that sentence can be checked against, and
  // marking it `display` would claim a second authority nothing exercises.
  'result.challenges[].adjudicationEvidence[]': ['signability', 'audit'],

  // ── result, open questions ─────────────────────────────────────────────
  // Deliberately no `blocking` flag exists to classify: *any* outstanding open
  // question blocks, and the container's emptiness is the whole rule.
  'result.openQuestions[].id': ['integrity', 'audit'],
  'result.openQuestions[].statement': ['display', 'audit'],

  // ── result, gaps ───────────────────────────────────────────────────────
  // The sign CLI must refuse an unresolved gap, and it branches on the kind,
  // so the kind is `signability`; the identity and the prose are what a person
  // reads to resolve it.
  //
  // `docId` and `sourceId` are the two halves of one question — *what* is
  // missing — and carry the same roles because they exercise the same
  // authority: whether `gaps[]` is empty is what refuses a signature, and
  // neither identity changes that answer. `assertResultConsistency` checks each
  // against the register it belongs to, but that is well-formedness of the
  // record rather than a second authority: the check decides whether the record
  // can be read at all, and it is `result.gaps[]` that decides signability.
  // Classified as one pair so that a reader cannot conclude the newer field is
  // the weaker one.
  'result.gaps[].kind': ['signability', 'display'],
  'result.gaps[].docId': ['display', 'audit'],
  'result.gaps[].sourceId': ['display', 'audit'],
  'result.gaps[].detail': ['display', 'audit'],

  // ── result, narrative ──────────────────────────────────────────────────
  // Optional prose for the reviewer. Nothing may branch on it — that is the
  // point of `gaps[]` being structural — so it is `display` and `audit` only.
  'result.narrative': ['display', 'audit'],

  // ── result, evidence items ─────────────────────────────────────────────
  // Every path below is emitted through both `reading.elements[].evidence[]`
  // and `challenges[].evidence[]`, from the one authoritative
  // `evidenceItemSchema` in `src/corpus/evidence.ts`. The roles are identical
  // in both places because the field is the same field: the anti-hallucination
  // control runs before signing (`signability`), the values are re-derivable
  // against the corpus afterwards (`audit`), and a quote that cannot be
  // located or whose hash contradicts its pin is a hard failure
  // (`integrity`) rather than something a human weighs.
  //
  // `kind` selects which of the four evidence shapes applies, and the
  // absence-sole rule branches on it — a set of nothing but `absence` items is
  // refused. That is routing plus a gate condition.
  'result.reading.elements[].evidence[].kind': ['authority', 'signability'],
  'result.challenges[].evidence[].kind': ['authority', 'signability'],
  'result.challenges[].adjudicationEvidence[].kind': ['authority', 'signability'],
  // A quote's document and hash must name a pin this record carries and agree
  // with it; `checkEvidenceSet` additionally re-finds the text on disk.
  'result.reading.elements[].evidence[].docId': ['signability', 'integrity'],
  'result.challenges[].evidence[].docId': ['signability', 'integrity'],
  'result.challenges[].adjudicationEvidence[].docId': ['signability', 'integrity'],
  'result.reading.elements[].evidence[].sha256Normalized': ['signability', 'integrity'],
  'result.challenges[].evidence[].sha256Normalized': ['signability', 'integrity'],
  'result.challenges[].adjudicationEvidence[].sha256Normalized': ['signability', 'integrity'],
  // The quoted words. Checked as a literal substring of the named document
  // before signing, and shown to the reviewer as the thing the conclusion
  // rests on.
  'result.reading.elements[].evidence[].text': ['signability', 'display'],
  'result.challenges[].evidence[].text': ['signability', 'display'],
  'result.challenges[].adjudicationEvidence[].text': ['signability', 'display'],
  // An amendment chain: the hops must chain, and each hop's edge must exist in
  // the corpus, so both the container and the edge id are gate conditions.
  'result.reading.elements[].evidence[].hops[]': ['signability', 'audit'],
  'result.challenges[].evidence[].hops[]': ['signability', 'audit'],
  'result.challenges[].adjudicationEvidence[].hops[]': ['signability', 'audit'],
  'result.reading.elements[].evidence[].hops[].edgeId': ['signability', 'integrity'],
  'result.challenges[].evidence[].hops[].edgeId': ['signability', 'integrity'],
  'result.challenges[].adjudicationEvidence[].hops[].edgeId': ['signability', 'integrity'],
  'result.reading.elements[].evidence[].hops[].quote.kind': ['authority', 'signability'],
  'result.challenges[].evidence[].hops[].quote.kind': ['authority', 'signability'],
  'result.challenges[].adjudicationEvidence[].hops[].quote.kind': ['authority', 'signability'],
  'result.reading.elements[].evidence[].hops[].quote.docId': ['signability', 'integrity'],
  'result.challenges[].evidence[].hops[].quote.docId': ['signability', 'integrity'],
  'result.challenges[].adjudicationEvidence[].hops[].quote.docId': ['signability', 'integrity'],
  'result.reading.elements[].evidence[].hops[].quote.sha256Normalized': [
    'signability',
    'integrity',
  ],
  'result.challenges[].evidence[].hops[].quote.sha256Normalized': ['signability', 'integrity'],
  'result.challenges[].adjudicationEvidence[].hops[].quote.sha256Normalized': [
    'signability',
    'integrity',
  ],
  'result.reading.elements[].evidence[].hops[].quote.text': ['signability', 'display'],
  'result.challenges[].evidence[].hops[].quote.text': ['signability', 'display'],
  'result.challenges[].adjudicationEvidence[].hops[].quote.text': ['signability', 'display'],
  // A cross-reference: the edge must exist and both ends must quote real text.
  'result.reading.elements[].evidence[].edgeId': ['signability', 'integrity'],
  'result.challenges[].evidence[].edgeId': ['signability', 'integrity'],
  'result.challenges[].adjudicationEvidence[].edgeId': ['signability', 'integrity'],
  'result.reading.elements[].evidence[].from.kind': ['authority', 'signability'],
  'result.challenges[].evidence[].from.kind': ['authority', 'signability'],
  'result.challenges[].adjudicationEvidence[].from.kind': ['authority', 'signability'],
  'result.reading.elements[].evidence[].from.docId': ['signability', 'integrity'],
  'result.challenges[].evidence[].from.docId': ['signability', 'integrity'],
  'result.challenges[].adjudicationEvidence[].from.docId': ['signability', 'integrity'],
  'result.reading.elements[].evidence[].from.sha256Normalized': ['signability', 'integrity'],
  'result.challenges[].evidence[].from.sha256Normalized': ['signability', 'integrity'],
  'result.challenges[].adjudicationEvidence[].from.sha256Normalized': ['signability', 'integrity'],
  'result.reading.elements[].evidence[].from.text': ['signability', 'display'],
  'result.challenges[].evidence[].from.text': ['signability', 'display'],
  'result.challenges[].adjudicationEvidence[].from.text': ['signability', 'display'],
  'result.reading.elements[].evidence[].to.kind': ['authority', 'signability'],
  'result.challenges[].evidence[].to.kind': ['authority', 'signability'],
  'result.challenges[].adjudicationEvidence[].to.kind': ['authority', 'signability'],
  'result.reading.elements[].evidence[].to.docId': ['signability', 'integrity'],
  'result.challenges[].evidence[].to.docId': ['signability', 'integrity'],
  'result.challenges[].adjudicationEvidence[].to.docId': ['signability', 'integrity'],
  'result.reading.elements[].evidence[].to.sha256Normalized': ['signability', 'integrity'],
  'result.challenges[].evidence[].to.sha256Normalized': ['signability', 'integrity'],
  'result.challenges[].adjudicationEvidence[].to.sha256Normalized': ['signability', 'integrity'],
  'result.reading.elements[].evidence[].to.text': ['signability', 'display'],
  'result.challenges[].evidence[].to.text': ['signability', 'display'],
  'result.challenges[].adjudicationEvidence[].to.text': ['signability', 'display'],
  // An absence claim: the documents searched must be pinned by this record,
  // and the term is re-searched mechanically before signing.
  'result.reading.elements[].evidence[].docIds[]': ['signability', 'integrity'],
  'result.challenges[].evidence[].docIds[]': ['signability', 'integrity'],
  'result.challenges[].adjudicationEvidence[].docIds[]': ['signability', 'integrity'],
  'result.reading.elements[].evidence[].term': ['signability', 'display'],
  'result.challenges[].evidence[].term': ['signability', 'display'],
  'result.challenges[].adjudicationEvidence[].term': ['signability', 'display'],
};

/**
 * Holds the schemas to account, in both directions.
 *
 * A path with no role is unverified by construction — nobody has said what
 * authority it exercises, so nobody has checked that whatever exercises it
 * agrees. A role with no path is a stale row describing a field that has been
 * removed or renamed, which is worse than useless: it makes the table look
 * complete while the shape underneath it has moved.
 *
 * An empty role list counts as no classification. Writing `[]` would otherwise
 * be a way to silence the guard without answering its question.
 */
export function assertFieldAccounting(
  schemas: Record<string, z.ZodTypeAny>,
  roles: Record<string, FieldRole[]> = FIELD_ROLES,
): void {
  const problems: string[] = [];
  const emitted = new Map<string, string>();

  for (const [name, schema] of Object.entries(schemas)) {
    for (const path of accountablePaths(schema, name)) {
      if (!emitted.has(path)) emitted.set(path, name);
    }
  }

  for (const [path, name] of emitted) {
    const assigned = roles[path];
    if (assigned === undefined || assigned.length === 0) {
      problems.push(
        `${path}: emitted by ${name || 'the schema'} but carries no field role; a field that nobody has said exercises any authority is a field nobody has checked`,
      );
    }
  }

  for (const path of Object.keys(roles)) {
    if (!emitted.has(path)) {
      problems.push(
        `${path}: classified as ${(roles[path] ?? []).join(' + ') || 'nothing'} but no schema emits it; a stale classification is a lie about the shape that hides a removal`,
      );
    }
  }

  if (problems.length > 0) throw new FieldAccountingError(problems.sort());
}
