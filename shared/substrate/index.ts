export { SUBSTRATE_NAME, SUBSTRATE_VERSION } from "./version";
export { canonicalJson, contentHash, legacyGenomeHash, sha256Hex } from "./hash";
export {
  DIRECTIVE_MODULES,
  GENOME_MODULE_KEYS,
  MODULE_TITLES,
  ROLE_MODULES,
  ROLE_TITLES,
  isGenomeModules,
} from "./genome";
export type { GenomeModuleKey, GenomeModules, PromptRole } from "./genome";
export {
  COMPILER_VERSION,
  compileGenomePrompts,
  compiledPromptsHash,
} from "./compile";
export type { CompiledGenomePrompts, CompiledPromptArtifact } from "./compile";
export {
  artifactContentHash,
  compileStrategyArtifact,
  evaluateSeating,
  findRegistryConflicts,
  mintEvaluationRecord,
  mintStrategyArtifact,
  validateArtifactSource,
  validateEvaluationRecordSource,
  verifyEvaluationRecord,
  verifyStrategyArtifact,
} from "./artifact";
export type {
  ArtifactMethod,
  ArtifactProvenance,
  CompiledStrategyArtifact,
  EvaluationProtocol,
  EvaluationRecord,
  EvaluationRecordSource,
  HeldOutTests,
  SeatingDecision,
  SeatingPolicy,
  StrategyArtifact,
  StrategyArtifactSource,
} from "./artifact";
export {
  DEEPSEEK_V4_FLASH_CANONICAL,
  DEEPSEEK_V4_FLASH_PROVENANCE_CANARY,
  KNOWN_ALIAS_MUTATIONS,
  aliasEpochFor,
  validateModelRef,
} from "./modelRef";
export type { AliasMutation, ModelRef, ResolvedModel } from "./modelRef";
export { assertRoleLegal } from "./observation";
export type {
  ChatChannel,
  ChatLine,
  CodeTriple,
  DecryptoObservation,
  ObservationRole,
  ResolvedRoundView,
  ResolvedSideView,
  TeamChatVisibility,
  TeamTokens,
} from "./observation";
export {
  HERPETARIUM_CLUE_RULES,
  TABLE_BOT_CLUE_RULES,
  TABLE_CLUE_RULES,
  validateClue,
  validateClueSubmission,
  validateCodeGuess,
} from "./actions";
export type {
  ClueContext,
  ClueRuleOptions,
  ClueSubmission,
  CodeGuess,
  DecryptoAction,
  DeliberationMessage,
} from "./actions";
export { TRACE_VERSION, validateTraceEnvelope } from "./trace";
export type {
  ResearchExportStamp,
  TraceApp,
  TraceEnvelope,
  TraceOutcome,
  TraceTaskKind,
} from "./trace";
export {
  BASELINE_GAME_CLUES,
  BASELINE_GAME_ID,
  BASELINE_GAME_ROUND,
  BASELINE_INVERSION_PROBE,
  BASELINE_KEYWORDS,
  EXPECTED_HASHES,
  INTERMEDIATE_HOPS_SOURCE,
  SENSORY_ANCHOR_SOURCE,
} from "./fixtures";
export type { BaselineClueRecord, InversionProbeClueResult } from "./fixtures";
export { runConformance } from "./conformance";
export type { ConformanceCheck, ConformanceReport } from "./conformance";
