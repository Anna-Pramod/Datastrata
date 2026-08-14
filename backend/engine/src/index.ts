export * from './types';
export { assess, bestResult } from './engine/evaluate';
export { evaluateCondition, cmpRange, EngineContentError } from './condition/evaluate';
export { FactResolver } from './engine/facts';
export { loadPack, verifyIntegrity, PackIntegrityError } from './knowledge/loader';
export { rankNextQuestions } from './engine/nextQuestion';
export { summarise } from './engine/summary';
export { loadSourceRegister, parseSourceRegister, verifyRegisterIntegrity, verifyCitationCoverage, RegisterIntegrityError, TIER_POLICY } from './monitoring/register';
export type { RegisterSource, SourceRegister, SourceTier, SourceCadence, TierPolicy } from './monitoring/types';
