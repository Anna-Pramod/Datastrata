export * from './types';
export { assess, bestResult } from './engine/evaluate';
export type { AssessOptions, MinStatus } from './engine/evaluate';
export { evaluateCondition, cmpRange, EngineContentError } from './condition/evaluate';
export { FactResolver } from './engine/facts';
export { loadPack, loadPackContext, verifyIntegrity, refuseAuthoredDerivedFields, PackIntegrityError } from './knowledge/loader';
export { sourceIdsOf } from './knowledge/provenance';
export { rankNextQuestions } from './engine/nextQuestion';
export { summarise } from './engine/summary';
export { loadSourceRegister, parseSourceRegister, verifyRegisterIntegrity, verifyRequirementCitability, governingAuthorityFor, isCitableSource, sourceCitability, NoGoverningAuthorityError, RegisterIntegrityError, TIER_POLICY } from './monitoring/register';
export type { RegisterSource, SourceRegister, SourceTier, SourceCadence, TierPolicy } from './monitoring/types';
export { loadCorpus, CorpusDocumentNotFoundError } from './corpus/store';
export { parseCorpusIndex, verifyCorpusIntegrity, verifyCorpusServesCoverage, CorpusIntegrityError } from './corpus/schema';
export { EntitledClosure, ClosureCitabilityError, type ClosureCitabilityFailure } from './pipeline/entitlement';
export { authoriseCorpus, assertCorpusAuthority, CorpusAuthorityError, type AuthorisedCorpus, type CorpusCapability } from './corpus/authority';
export { computeClosure, docsForSources, CLOSURE_POLICY_V0, CLOSURE_POLICY_V1, STRUCTURAL_EDGE_KINDS, ClosureEntryNotFoundError } from './corpus/closure';
export { standingMapFor, pinnedStandingFor, MissingStandingError } from './corpus/standing';
export type { DocumentStanding, SourceStanding, StandingMap } from './corpus/standing';
export { CLOSURE_RENDERER_VERSION, renderEntitledClosure } from './pipeline/entitlement';
export { checkEvidenceSet } from './corpus/evidence';
export { normalize, normalizeWhitespace, extractText, selectContent, NORMALIZER_VERSION, CONTENT_SELECTOR_PATTERN } from './corpus/normalize';
export { sha256Hex } from './corpus/hash';
export type { LoadedCorpus } from './corpus/store';
export type { Closure, ClosurePolicy, ExpansionRule } from './corpus/closure';
export type { AbsenceEvidence, AmendmentChainEvidence, CrossReferenceEvidence, EvidenceCheckResult, EvidenceItem, QuoteEvidence } from './corpus/evidence';
export type { ArtefactAuthenticity, CorpusDocument, CorpusEdge, CorpusIndex, EdgeKind, EdgeProvenance, EdgeProvenanceType } from './corpus/types';

// ---------------------------------------------------------------------------
// The freshness seam
//
// What a caller needs to answer "does this signature still hold?" over
// verification state it owns. Exported because the public site is now such a
// caller, and the alternative was a second freshness algorithm living in the
// web application: one that agrees with the signing path today and diverges the
// first time a hash producer, a normalizer or a corpus path moves — with the
// site and the review sheet then disagreeing about the same signature.
//
// `resolvedStaleness` is the operation itself and lives beside the sign CLI,
// which is the layer entitled to open the raw store. It is re-exported rather
// than reimplemented: detection stays in `deriveStaleness`, resolution in
// `resolveNormalizerChanged`, and there is exactly one composition of the two.
// ---------------------------------------------------------------------------
export { currentStateOf } from './verification/current-state';
export type { CurrentCorpusSource, CurrentStateInput } from './verification/current-state';
export { deriveStaleness, resolveNormalizerChanged, blocks, BLOCKING } from './verification/staleness';
export type { CurrentState, CurrentCorpusDocument, StalenessReason } from './verification/staleness';
export { renormalisedHashes, resolvedStaleness } from './cli/sign';
export { IntegrityFailureError, RefusalError } from './verification/sign';
export { verificationResultSchema } from './verification/result';
export type { VerificationResult } from './verification/result';
export { deriveStatus, toStatusInput } from './verification/status';
export type { CheckedFreshness, FreshnessAssessment, RequirementStatus } from './verification/status';
export type { LedgerEntry, RevocationEntry, SigningEntry } from './verification/ledger';
export type { RenderContext } from './verification/render';
export type { FreshnessResolver, FreshnessResolverInput, LoadPackOptions } from './knowledge/loader';
