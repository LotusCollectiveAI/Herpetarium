/**
 * Fixed, provider-backed candidate-policy A/B experiment.
 *
 * Importing this module is side-effect free. The CLI accepts exactly one
 * positional argument: a brand-new output directory outside the repository.
 * It never creates or migrates a database. The operator must provision a new,
 * empty local PostgreSQL database with
 * `npm run experiment:candidate-policy-ab-db-prepare` (a guarded wrapper
 * around `npm run db:push`, schema sync rather than migration-journal replay),
 * reach it through an allowlisted Unix socket, and set DATABASE_URL before
 * execution.
 */
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
} from "node:fs/promises";
import {
  basename,
  dirname,
  relative,
  resolve,
  sep,
} from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import type {
  HeadlessMatchConfig,
  PrivateProviderResponseReceipt,
} from "@shared/schema";
import { getConfigForModel } from "@shared/modelRegistry";
import {
  CIPHER_ENCRYPT_CANDIDATE_POLICY_ARTIFACT,
  DEEPSEEK_V4_FLASH_CANONICAL,
  HERPETARIUM_CLUE_RULES,
  INTERMEDIATE_HOPS_SOURCE,
  contentHash,
  compileStrategyArtifact,
  mintStrategyArtifact,
  sha256Hex,
} from "@shared/substrate";
import { parseHeadlessMatchConfig } from "../server/headlessConfigSchema";
import {
  createSeededRng,
  generateSecretCode,
} from "../server/game";
import { getPromptStrategy } from "../server/promptStrategies";
import { verifyPrivateProviderReceipt } from "../server/privateProviderReceipt";
import { getRandomKeywords } from "../server/wordPacks";

export const CANDIDATE_POLICY_AB_EXPERIMENT_VERSION =
  "candidate-policy-column-ledger-ab@0.1.0";
export const CANDIDATE_POLICY_AB_PREREGISTRATION_VERSION =
  "candidate-policy-column-ledger-preregistration@0.1.0";
export const CANDIDATE_POLICY_AB_MATCH_ARTIFACT_VERSION =
  "candidate-policy-column-ledger-match@0.1.0";
export const CANDIDATE_POLICY_AB_REPORT_VERSION =
  "candidate-policy-column-ledger-report@0.1.0";

export const EXACT_MODEL = "deepseek/deepseek-v4-flash-0731";
export const EXACT_UPSTREAM_SLUG = "deepinfra";
export const EXACT_UPSTREAM_DISPLAY = "DeepInfra";
export const PAIR_CONCURRENCY = 2;
export const PHYSICAL_ATTEMPTS_PER_CALL = 1;
export const CALLS_PER_MATCH_ROUND = 6;
export const EXACT_COMPLETION_TOKEN_LIMIT = 65_536;
export const DISPOSABLE_DATABASE_PREFIX = "herp_decrypto_ab_";
export const FIXED_ABLATIONS = [
  "no_scratch_notes",
  "no_opponent_transcript",
] as const;

const execFileAsync = promisify(execFile);
const REPOSITORY_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
);
const COLUMN_LEDGER_MARKER = "YOUR PUBLIC COLUMN LEDGER";
const SCRATCH_NOTES_MARKER = "STRATEGIC NOTES FROM PREVIOUS GAMES";
const ALL_SEEDS = Object.freeze(
  Array.from(
    { length: 12 },
    (_, index) =>
      `decrypto-ledger-ab-v0.1-seed-${String(index + 1).padStart(2, "0")}`,
  ),
);

export type CandidatePolicyAbScheduleId =
  | "mechanism-canary"
  | "pilot"
  | "full";

/**
 * `carrier_exercised_behavior_excluded` is not "no treatment". The mechanism
 * canary seats the identical mirrored arms and dispatches the exact candidate
 * policy and authority wrapper on treatment cluegiver calls, because proving
 * that carrier is the point of the canary. What is excluded is the *behavioral
 * reading* of the resulting outcomes, not the treatment itself.
 */
export type CandidatePolicyAbTreatmentPackage =
  | "candidate_policy_authority_carrier_exercised_behavior_excluded"
  | "full_candidate_policy_authority_plus_treatment_only_ledger_and_rejection"
  | "minimal_ledger_plus_rejection_only";

export type CandidatePolicyAbProtocolUse =
  | "mechanism_telemetry_only"
  | "within_herpetarium_descriptive_unreleasable_protocol_mismatch";

/**
 * The primary estimand window is fixed at rounds 2-4 and is not derived from
 * `roundsPerMatch`. Any behavior-bearing schedule must therefore run exactly
 * four rounds, or the declared window would silently stop covering the match.
 */
export const PRIMARY_ROUND_WINDOW = Object.freeze({
  firstRound: 2,
  lastRound: 4,
  label: "2-4" as const,
});

export interface CandidatePolicyAbSchedule {
  id: CandidatePolicyAbScheduleId;
  seeds: readonly string[];
  roundsPerMatch: 2 | 4;
  behaviorIncluded: boolean;
  treatmentPackage: CandidatePolicyAbTreatmentPackage;
  treatmentPackageMeaning: string;
  protocolUse: CandidatePolicyAbProtocolUse;
  plannedSeedBlocks: number;
  plannedMatches: number;
  plannedProviderCalls: number;
  purpose: string;
  inferenceQualification: string;
}

function schedule(input: {
  id: CandidatePolicyAbScheduleId;
  seeds: readonly string[];
  roundsPerMatch: 2 | 4;
  behaviorIncluded: boolean;
  treatmentPackage: CandidatePolicyAbTreatmentPackage;
  treatmentPackageMeaning: string;
  protocolUse: CandidatePolicyAbProtocolUse;
  purpose: string;
  inferenceQualification: string;
}): CandidatePolicyAbSchedule {
  const plannedSeedBlocks = input.seeds.length;
  const plannedMatches = plannedSeedBlocks * 2;
  const plannedProviderCalls =
    plannedMatches * input.roundsPerMatch * CALLS_PER_MATCH_ROUND;
  const value = Object.freeze({
    ...input,
    plannedSeedBlocks,
    plannedMatches,
    plannedProviderCalls,
  });
  assertPrimaryRoundWindowMatchesSchedule(value);
  return value;
}

/**
 * Fails loudly if `roundsPerMatch` ever drifts away from the fixed rounds 2-4
 * primary window on a behavior-bearing schedule, instead of quietly reporting a
 * window that no longer spans the match.
 */
export function assertPrimaryRoundWindowMatchesSchedule(
  scheduleValue: CandidatePolicyAbSchedule,
): void {
  if (PRIMARY_ROUND_WINDOW.label !== "2-4") {
    throw new Error("primary round window label drifted from rounds 2-4");
  }
  if (!scheduleValue.behaviorIncluded) return;
  if (
    PRIMARY_ROUND_WINDOW.firstRound !== 2 ||
    PRIMARY_ROUND_WINDOW.lastRound !== scheduleValue.roundsPerMatch
  ) {
    throw new Error(
      `schedule ${scheduleValue.id} runs ${scheduleValue.roundsPerMatch} rounds per match but the fixed primary window is rounds ${PRIMARY_ROUND_WINDOW.firstRound}-${PRIMARY_ROUND_WINDOW.lastRound}`,
    );
  }
}

/**
 * Fixed enumerations. The pilot is the first two full-design seed blocks; the
 * descriptive full schedule is all twelve. The two-round mechanism canary is
 * operational evidence only and is never pooled with behavioral results.
 */
export const CANDIDATE_POLICY_AB_SCHEDULES: Readonly<
  Record<CandidatePolicyAbScheduleId, CandidatePolicyAbSchedule>
> = Object.freeze({
  "mechanism-canary": schedule({
    id: "mechanism-canary",
    seeds: Object.freeze([ALL_SEEDS[0]!]),
    roundsPerMatch: 2,
    behaviorIncluded: false,
    treatmentPackage:
      "candidate_policy_authority_carrier_exercised_behavior_excluded",
    treatmentPackageMeaning:
      "The mirrored arms and the exact candidate-policy plus authority-wrapper carrier on treatment cluegiver calls are fully exercised and paid for; only the behavioral reading of the resulting outcomes is excluded. This is not an untreated or sham run. Its two rounds also do not reach the fixed rounds 2-4 primary window.",
    protocolUse: "mechanism_telemetry_only",
    purpose:
      "Prove the exact route, response durability, mirrored seating, bundled treatment carrier, and telemetry mechanism before behavioral spending.",
    inferenceQualification:
      "Mechanism canary: the candidate-policy carrier is exercised, but every outcome is excluded from behavioral analysis. No efficacy, no dose, and no cross-application transfer inference.",
  }),
  pilot: schedule({
    id: "pilot",
    seeds: Object.freeze(ALL_SEEDS.slice(0, 2)),
    roundsPerMatch: 4,
    behaviorIncluded: true,
    treatmentPackage:
      "full_candidate_policy_authority_plus_treatment_only_ledger_and_rejection",
    treatmentPackageMeaning:
      "Full bundled package: the candidate policy and authority wrapper on every treatment cluegiver call, plus the treatment-only column ledger and operative public-association rejection instruction from round 2 onward. Behavior is read only over the fixed rounds 2-4 window.",
    protocolUse:
      "within_herpetarium_descriptive_unreleasable_protocol_mismatch",
    purpose:
      "Inspect operational invariants and descriptive behavior for the first two preregistered four-round seed blocks of the full bundled Herpetarium treatment.",
    inferenceQualification:
      "Operational pilot of the full Herpetarium candidate-policy/authority plus treatment-only operative-ledger package. It is not powered, not a release boundary, and not evidence of a marginal or transferable Table effect.",
  }),
  full: schedule({
    id: "full",
    seeds: ALL_SEEDS,
    roundsPerMatch: 4,
    behaviorIncluded: true,
    treatmentPackage:
      "full_candidate_policy_authority_plus_treatment_only_ledger_and_rejection",
    treatmentPackageMeaning:
      "Full bundled package: the candidate policy and authority wrapper on every treatment cluegiver call, plus the treatment-only column ledger and operative public-association rejection instruction from round 2 onward. Behavior is read only over the fixed rounds 2-4 window.",
    protocolUse:
      "within_herpetarium_descriptive_unreleasable_protocol_mismatch",
    purpose:
      "Descriptive paired evidence for the full Herpetarium candidate-policy/authority plus treatment-only operative-ledger package under fixed execution.",
    inferenceQualification:
      "Twelve paired seed blocks with repeated within-game rounds. This is descriptive, clustered evidence—not a powered confirmatory test, even though it yields 24 team-games per arm. It cannot transfer to The Table until exact arm assignment and full instruction parity are independently proven.",
  }),
});

const SOURCE_PATHS = [
  "docs/SUBSTRATE_SPEC_V0.md",
  "docs/evidence/cross-round-v03-repeat-20260802.md",
  "drizzle.config.ts",
  "scripts/run-candidate-policy-ab-experiment.ts",
  "scripts/run-candidate-policy-ab-mechanism-canary.ts",
  "scripts/run-candidate-policy-ab-pilot.ts",
  "scripts/prepare-candidate-policy-ab-database.ts",
  "server/ai.ts",
  "server/abortableTimeout.ts",
  "server/db.ts",
  "server/enrichedStrategy.ts",
  "server/game.ts",
  "server/headlessConfigSchema.ts",
  "server/headlessLineage.ts",
  "server/headlessPromptAuthority.ts",
  "server/headlessRunner.ts",
  "server/headlessValidationPolicy.ts",
  "server/kLevelStrategy.ts",
  "server/log.ts",
  "server/modelHealth.ts",
  "server/botPersonas.ts",
  "server/privateProviderReceipt.ts",
  "server/promptStrategies.ts",
  "server/providerAttemptTelemetry.ts",
  "server/storage.ts",
  "server/wordPacks.ts",
  "shared/models/user.ts",
  "shared/modelRegistry.ts",
  "shared/schema.ts",
  "shared/substrate/actions.ts",
  "shared/substrate/artifact.ts",
  "shared/substrate/candidatePolicy.ts",
  "shared/substrate/compile.ts",
  "shared/substrate/conformance.ts",
  "shared/substrate/crossRoundInversion.ts",
  "shared/substrate/fixtures.ts",
  "shared/substrate/genome.ts",
  "shared/substrate/hash.ts",
  "shared/substrate/index.ts",
  "shared/substrate/inversion.ts",
  "shared/substrate/modelRef.ts",
  "shared/substrate/observation.ts",
  "shared/substrate/trace.ts",
  "shared/substrate/version.ts",
  "migrations/0012_telemetry_action_attribution.sql",
  "migrations/meta/0012_snapshot.json",
  "migrations/meta/_journal.json",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
] as const;

/**
 * Packages whose installed bytes, not just their declared ranges, decide what
 * this experiment actually executes: the Postgres driver and ORM that produce
 * the durable telemetry, the schema validators, the SDK modules loaded by
 * `server/ai.ts`, and the TypeScript loader/compiler pair that resolves the
 * `@shared/*` alias at runtime. `package-lock.json` records what should be
 * installed; this records what is.
 */
const LINEAGE_DEPENDENCIES = [
  "@anthropic-ai/sdk",
  "@google/genai",
  "drizzle-orm",
  "drizzle-zod",
  "openai",
  "pg",
  "tsx",
  "typescript",
  "zod",
] as const;

export interface CandidatePolicyAbImportResolution {
  tsconfigPath: "tsconfig.json";
  tsconfigSha256: string;
  runtimeLoader: "tsx";
  moduleResolution: string;
  baseUrl: string;
  strict: boolean;
  pathAliases: Array<{
    specifier: string;
    declaredTargets: string[];
    resolvedRoots: string[];
    allResolvedRootsInsideRepository: boolean;
  }>;
  importResolutionHash: string;
}

export interface CandidatePolicyAbInstalledDependencies {
  packages: Array<{
    name: string;
    declaredRange: string;
    installedVersion: string;
    installedManifestPath: string;
    installedManifestSha256: string;
  }>;
  installedDependencyHash: string;
}

export interface CandidatePolicyAbSourceLineage {
  repositoryRoot: string;
  capturedAt: string;
  gitCommitSha: string;
  gitTreeSha: string;
  gitCommitObjectType: "commit";
  gitDirty: false;
  files: Array<{
    path: string;
    sha256: string;
    committedSha256: string;
    matchesCommittedBytes: true;
  }>;
  // Committed bytes alone do not fix what executes: the `@shared/*` alias map
  // and the installed package bytes are equally load-bearing, and neither is
  // covered by the git tree.
  importResolution: CandidatePolicyAbImportResolution;
  installedDependencies: CandidatePolicyAbInstalledDependencies;
  sourceSetHash: string;
  runtimeIdentity: {
    nodeVersion: string;
    v8Version: string;
    platform: NodeJS.Platform;
    architecture: string;
    execPath: string;
  };
  runtimeIdentityHash: string;
}

export interface CandidatePolicyAbDatabaseLineage {
  databaseName: string;
  socketDirectory: string;
  transport: "local_unix_socket";
  initialApplicationRows: 0;
  requiredTables: string[];
  requiredTelemetryColumns: string[];
  provisioningContract: {
    command: "npm run experiment:candidate-policy-ab-db-prepare";
    schemaSyncCommand: "npm run db:push";
    mode: "schema_sync_not_migration_replay";
    migrationJournalAcceptedForProvisioning: false;
  };
  schemaHash: string;
  databaseLineageHash: string;
}

export interface SeedInputManifest {
  seed: string;
  keywords: {
    amber: [string, string, string, string];
    blue: [string, string, string, string];
  };
  codes: Array<{
    round: number;
    amber: [number, number, number];
    blue: [number, number, number];
  }>;
}

export interface MatchJob {
  ordinal: number;
  blockOrdinal: number;
  seed: string;
  mirror: "treatment-amber" | "treatment-blue";
  treatmentTeam: "amber" | "blue";
  controlTeam: "amber" | "blue";
  roleSwapGroupId: string;
  artifactFile: string;
  config: HeadlessMatchConfig;
}

interface PreregisteredPromptProof {
  seed: string;
  team: "amber" | "blue";
  systemPromptSha256: string;
  baseline: {
    fullPrompt: string;
    fullPromptSha256: string;
    charCount: number;
    containsCandidatePolicy: false;
    containsColumnLedger: false;
  };
  treatment: {
    fullPrompt: string;
    fullPromptSha256: string;
    charCount: number;
    containsCandidatePolicy: true;
    containsColumnLedger: false;
  };
}

export interface CandidatePolicyAbPreregistration {
  preregistrationVersion: typeof CANDIDATE_POLICY_AB_PREREGISTRATION_VERSION;
  experimentVersion: typeof CANDIDATE_POLICY_AB_EXPERIMENT_VERSION;
  registeredAt: string;
  status: "registered_before_provider_dispatch";
  schedule: CandidatePolicyAbSchedule;
  fixedExecution: {
    teamSize: 2;
    pairConcurrency: 2;
    sequentialSeedBlocks: true;
    retries: 0;
    fallbacks: 0;
    replacementMatches: 0;
    failedMatchesRetained: true;
    stopAfterFailedPair: true;
    postMatchReflection: false;
    seatAssignment: {
      cluegiver: "alternates_seat_1_seat_2_by_round";
      ownGuesser: "non_cluegiver_teammate";
      interceptor: "seat_1_fixed_every_round";
      mirroredMeaning:
        "treatment_color_swap_only_not_actor_role_rotation";
    };
    scratchNotes: "disabled";
    opponentTranscript: "structurally_absent_in_2v2_and_ablated";
    ablations: readonly [
      "no_scratch_notes",
      "no_opponent_transcript",
    ];
    clueLegalityPreflight: {
      validator: "shared.validateClueSubmission@substrate";
      ruleSet: "HERPETARIUM_CLUE_RULES";
      ruleOptions: typeof HERPETARIUM_CLUE_RULES;
      enforcedConstraints: string[];
      keywordRuleThreshold: {
        normalizationRule: string;
        minimumNormalizedKeywordCharacters: 4;
        shorterKeywordsEnforceOnly: string;
        stemComparison: string;
      };
      strictFailureDisposition:
        "persist_response_reject_action_invalidate_match_no_regeneration";
      nonStrictCompatibilityDisposition:
        "persist_response_apply_unchanged_taint_match_no_regeneration";
      nonStrictTaintedMatchDisposition: {
        durableRecord: string;
        matchQualityStatus: "tainted";
        taintReason: "action_validation_failure";
        legacyMetricsEffect: string;
        legacyMetricsFilter: string;
        consequence: string;
        appliesToThisExperiment: false;
      };
      randomCluesAblation: {
        scheduledInThisExperiment: false;
        poolSize: 10;
        samplesWithReplacement: true;
        duplicateOnlyInvalidTripleProbability: 0.28;
        fourRoundRepeatLegality: "impossible_12_draws_from_10_words";
      };
      genericFallbackClues: {
        enabledInStrictExperiment: false;
        poolSize: 10;
        samplesWithReplacement: true;
        duplicateOnlyInvalidTripleProbability: 0.28;
      };
      qualification: string;
    };
  };
  route: {
    provider: "openrouter";
    model: typeof EXACT_MODEL;
    upstreamSlug: typeof EXACT_UPSTREAM_SLUG;
    upstreamDisplay: typeof EXACT_UPSTREAM_DISPLAY;
    reasoningEffort: "xhigh";
    wireReasoningEffort: "max";
    timeoutMs: number;
    maxCompletionTokens: typeof EXACT_COMPLETION_TOKEN_LIMIT;
    allowFallbacks: false;
    requireParameters: true;
    dataCollection: "deny";
    clientPhysicalRequestsPerCall: 1;
    privateReasoningReceipt: {
      requestedForEveryStrictDurableCall: true;
      requestShape: "reasoning_effort_max_exclude_false";
      storage:
        "operator_private_provider_attempt_exact_success_body";
      exactBodyLineage: "sha256_and_utf8_bytes";
      reasoningDisposition:
        "returned_fields_bound_within_exact_body_or_explicit_absence_with_token_count";
      exactBytesMaterializedIn: readonly [
        "disposable_database_provider_attempt_row",
        "per_match_private_artifact_mode_0600",
      ];
      aggregateReportExposure: false;
      gameplayExposure: false;
      trackedEvidenceExposure: false;
    };
    routerProof:
      "attempt_1_one_selected_deepinfra_zero_or_one_successful_deepinfra_detailed_attempt";
  };
  treatmentContrast: {
    experimentalUnit: "paired_seed_block";
    measuredPackage:
      "full_candidate_policy_authority_plus_treatment_only_ledger_and_rejection";
    minimalMechanismNotEstimated:
      "minimal_ledger_plus_rejection_only";
    baseline: string;
    treatment: string;
    identicalCarrier: string;
    roundOneDifference: string;
    laterRoundDifference: string;
    downstreamDivergence: string;
    interpretationBoundary: string;
    tableTransferBoundary: {
      status:
        "forbidden_known_arm_assignment_and_instruction_mismatch";
      herpetariumAssignment:
        "ledger_and_operative_rejection_instruction_treatment_only";
      currentTableAssignment:
        "ledger_all_encryptors_without_operative_rejection_instruction";
      requiredBeforeTransfer:
        "byte_identical_full_prompts_and_identical_arm_assignment_per_role_and_round";
      forbiddenInterpretations: readonly [
        "table_marginal_effect",
        "table_upper_bound",
        "table_lower_bound",
        "table_seating_license",
      ];
    };
    compiledArtifact: {
      id: string;
      contentHash: string;
      compiledPromptsHash: string;
      genomeHash: string;
      compilerVersion: string;
      substrateVersion: string;
    };
    candidatePolicy: {
      id: string;
      contentHash: string;
      instruction: string;
      appliesToRoles: readonly ["cluegiver"];
    };
    baselineCarrierHash: string;
    treatmentCarrierHash: string;
  };
  runtimeProtocolParity: {
    status: "known_mismatch_unreleasable";
    currentRunner: "herpetarium_headless_legacy";
    requiredTarget: "table-competitive-v1";
    tableBotBuildLicenseEligible: false;
    canaryPurpose: "mechanism_telemetry_only";
    knownMismatches: readonly [
      "herpetarium_allows_round_1_interception",
      "herpetarium_resolves_own_guesses_before_interceptions",
      "herpetarium_active_cluegiver_can_intercept_in_2v2",
      "configured_team_size_round_limit_and_token_limits_are_not_table_competitive_defaults",
      "herpetarium_3v3_can_expose_opponent_decode_chatter",
    ];
    releaseRequirement:
      "table-competitive-v1 runner plus golden transition_role_visibility_and_rules_parity";
  };
  seedInputs: SeedInputManifest[];
  roundOnePromptProofs: PreregisteredPromptProof[];
  jobs: MatchJob[];
  estimands: {
    primaryRounds: "2-4";
    primaryRoundWindow: {
      firstRound: number;
      lastRound: number;
      equalsScheduledRoundsPerMatch: boolean;
      assertion: string;
    };
    roundOne: "secondary_policy_authority_only";
    outcomes: string[];
    aliasedNonEstimands: string[];
    operations: string[];
    clueLevel: string[];
    missingDataRule: string;
    aggregationRule: string;
    inferenceQualification: string;
  };
  databaseLineage: CandidatePolicyAbDatabaseLineage;
  sourceLineage: CandidatePolicyAbSourceLineage;
  preregistrationContentHash: string;
}

export interface CapturedMatchData {
  match: Record<string, unknown> | null;
  rounds: Array<Record<string, unknown>>;
  aiCallLogs: Array<Record<string, unknown>>;
  providerAttempts: Array<Record<string, unknown>>;
  teamChatter: Array<Record<string, unknown>>;
}

export interface SanitizedExperimentError {
  name: string;
  message: string;
  code: string | null;
  matchId: number | null;
  providerMetadata: Record<string, unknown> | null;
}

export interface CandidatePolicyAbMatchArtifact {
  artifactVersion: typeof CANDIDATE_POLICY_AB_MATCH_ARTIFACT_VERSION;
  experimentVersion: typeof CANDIDATE_POLICY_AB_EXPERIMENT_VERSION;
  preregistrationContentHash: string;
  settledAt: string;
  job: MatchJob;
  armByTeam: {
    amber: "baseline" | "treatment";
    blue: "baseline" | "treatment";
  };
  status: "success" | "failure";
  matchId: number | null;
  executionResult: Record<string, unknown> | null;
  error: SanitizedExperimentError | null;
  capture: CapturedMatchData | null;
  integrity: {
    valid: boolean;
    issues: string[];
  };
  artifactContentHash: string;
}

/**
 * The aggregate-report view of a private paid-call receipt. Every lineage,
 * route, and accounting field survives; the exact response bytes and any
 * reasoning text bound inside them do not. The authoritative copies stay in the
 * disposable database row and the 0600 per-match artifact named by
 * `privateArtifact.relativePath`.
 */
export interface AggregateProviderReceiptProjection {
  version: PrivateProviderResponseReceipt["version"];
  storageClass: PrivateProviderResponseReceipt["storageClass"];
  source: PrivateProviderResponseReceipt["source"];
  exactBytesLocation: "provider_attempts_row_and_per_match_private_artifact_only";
  responseBody: {
    storage: PrivateProviderResponseReceipt["responseBody"]["storage"];
    textPresentInAuthoritativeCopies: boolean;
    textIncludedInThisAggregate: false;
    sha256: string | null;
    utf8Bytes: number | null;
  };
  reasoning: PrivateProviderResponseReceipt["reasoning"];
  exactResponseBodyStored: boolean;
  hiddenReasoningStored: boolean;
  receiptContentSha256: string;
}

export interface AggregateCapturedMatchData {
  match: Record<string, unknown> | null;
  rounds: Array<Record<string, unknown>>;
  aiCallLogs: Array<Record<string, unknown>>;
  providerAttempts: Array<Record<string, unknown>>;
  teamChatter: Array<Record<string, unknown>>;
}

export interface CandidatePolicyAbAggregateMatchEntry {
  artifactVersion: typeof CANDIDATE_POLICY_AB_MATCH_ARTIFACT_VERSION;
  experimentVersion: typeof CANDIDATE_POLICY_AB_EXPERIMENT_VERSION;
  aggregateProjection: "exact_provider_response_bodies_removed";
  preregistrationContentHash: string;
  settledAt: string;
  job: MatchJob;
  armByTeam: {
    amber: "baseline" | "treatment";
    blue: "baseline" | "treatment";
  };
  status: "success" | "failure";
  matchId: number | null;
  executionResult: Record<string, unknown> | null;
  error: SanitizedExperimentError | null;
  capture: AggregateCapturedMatchData | null;
  integrity: {
    valid: boolean;
    issues: string[];
  };
  /**
   * Stable pointer to the authoritative artifact. `artifactContentHash` is that
   * file's own self-hash, not a hash of this projection, and is deliberately
   * nested so it cannot be mistaken for one.
   */
  privateArtifact: {
    relativePath: string;
    mode: "0600";
    artifactContentHash: string;
    holdsExactProviderResponseBodies: boolean;
  };
}

interface BehavioralWindowSummary {
  roundScope: "2-4" | "1";
  interpretation: "primary" | "wrapper_only_diagnostic";
  teamGames: number;
  teamRounds: number;
  teammateDecodesCorrect: number;
  miscommunications: number;
  vulnerableInterceptions: number;
  // Accounting counts only. In a two-arm match this arm's interceptions made
  // are, by construction, the other arm's vulnerable rounds re-counted from the
  // other side. They are never an independent behavioral estimand.
  interceptionsMade: number;
  decodeAccuracy: number | null;
  vulnerabilityRate: number | null;
  interceptionsMadeAccountingRate: number | null;
}

interface BehavioralRateSet {
  decodeAccuracy: number | null;
  miscommunicationRate: number | null;
  vulnerabilityRate: number | null;
  /**
   * Literally the opposite arm's `vulnerabilityRate`, carried here so a reader
   * of one arm can see it without joining rows. It is assigned by alias, never
   * recomputed from this arm's `interceptionsMade`, so it can never drift into
   * looking like a fourth independent outcome.
   */
  opponentArmVulnerabilityRateAlias: number | null;
}

interface ReciprocalAliasIdentity {
  claim: "arm_interceptions_made_equals_opposite_arm_vulnerable_interceptions";
  independentEstimand: false;
  baselineInterceptionsMade: number;
  treatmentVulnerableInterceptions: number;
  treatmentInterceptionsMade: number;
  baselineVulnerableInterceptions: number;
  holdsExactly: boolean;
}

interface BehavioralMirrorSummary {
  artifactOrdinal: number;
  mirror: MatchJob["mirror"];
  treatmentTeam: "amber" | "blue";
  baselineTeam: "amber" | "blue";
  arms: {
    baseline: BehavioralWindowSummary;
    treatment: BehavioralWindowSummary;
  };
  reciprocalAliasIdentity: ReciprocalAliasIdentity;
  treatmentMinusBaseline: BehavioralRateSet;
}

interface BehavioralSeedBlockSummary {
  analysisUnit: "paired_seed_block";
  blockOrdinal: number;
  seed: string;
  mirroredMatches: 2;
  roundScope: "2-4" | "1";
  roundsNestedWithinTeamGames: true;
  mirrors: [BehavioralMirrorSummary, BehavioralMirrorSummary];
  arms: {
    baseline: BehavioralWindowSummary;
    treatment: BehavioralWindowSummary;
  };
  reciprocalAliasIdentity: ReciprocalAliasIdentity;
  treatmentMinusBaseline: BehavioralRateSet;
}

interface BehavioralBlockAggregate {
  analysisUnit: "paired_seed_block";
  seedBlocks: number;
  equalWeightPerSeedBlock: true;
  teamRoundsAreNotIndependentReplicates: true;
  armBlockMeanRates: {
    baseline: BehavioralRateSet;
    treatment: BehavioralRateSet;
  };
  meanWithinBlockTreatmentMinusBaseline: BehavioralRateSet;
}

interface BehavioralBlockAnalysis {
  roundScope: "2-4" | "1";
  interpretation: "primary" | "wrapper_only_diagnostic";
  blocks: BehavioralSeedBlockSummary[];
  aggregate: BehavioralBlockAggregate;
}

interface NumericDistribution {
  observed: number;
  unknown: number;
  min: number | null;
  median: number | null;
  p95NearestRank: number | null;
  max: number | null;
}

interface CompletionTokenDistribution extends NumericDistribution {
  configuredLimitPerCall: typeof EXACT_COMPLETION_TOKEN_LIMIT;
  unknownCalls: number;
  minimumObservedHeadroomTokens: number | null;
  p95ObservedHeadroomTokens: number | null;
  maximumObservedUtilizationRate: number | null;
  callsAtOrAbove90PercentOfLimit: number;
}

interface ClueLegalityFunnel {
  clueCalls: number;
  validatedCalls: number;
  passedCalls: number;
  failedCalls: number;
  appliedDespiteFailedValidation: number;
  rejectedFailedValidation: number;
  missingValidationMetadata: number;
  problemCounts: Record<string, number>;
}

interface PrivateReceiptCounts {
  receiptRows: number;
  exactBodiesStored: number;
  exactBodyUtf8Bytes: number;
  hiddenReasoningPresentAndStored: number;
  explicitReasoningAbsent: number;
  uninspectableInvalidJson: number;
  bodyUnavailableOrNotStored: number;
  lineageFailures: number;
}

/**
 * The paid-call accounting shared by the whole-run rollup and by any single
 * match recovered from the disposable database after its artifact failed to
 * persist. Identical shape on both paths so a recovered match is countable the
 * same way a persisted one is.
 */
interface OperationalCallEvidence {
  providerCalls: number;
  aiCallRecords: number;
  linkedProviderAttemptReceipts: number;
  unlinkedProviderAttempts: number;
  latencyMs: NumericDistribution;
  completionTokens: CompletionTokenDistribution;
  cost: {
    knownCostCalls: number;
    unknownCostCalls: number;
    sumUsd: number;
  };
  providerAttemptState: {
    succeeded: number;
    failed: number;
    timedOut: number;
    other: number;
  };
  actionDisposition: {
    applied: number;
    rejected: number;
    unknown: number;
  };
  routeProof: {
    exactPasses: number;
    failures: number;
    failureIssues: string[];
  };
  privatePaidCallReceipts: PrivateReceiptCounts;
}

interface OperationalRollup extends Omit<
  OperationalCallEvidence,
  "completionTokens" | "privatePaidCallReceipts"
> {
  scope:
    "all_started_matches_including_failed_and_integrity_invalid";
  plannedProviderCalls: number;
  jobs: {
    planned: number;
    launched: number;
    persistedArtifacts: number;
    unpersistedMatchesRecoveredFromDatabase: number;
    unpersistedMatchesNotRecoverable: number;
  };
  expectedProviderCallsForStartedMatches: number;
  missingProviderAttemptsAgainstStartedMatches: number;
  completionTokens: CompletionTokenDistribution & {
    byAction: Record<string, CompletionTokenDistribution>;
    byArm: Record<
      "baseline" | "treatment",
      CompletionTokenDistribution
    >;
  };
  privatePaidCallReceipts: PrivateReceiptCounts & {
    materialization: {
      databaseCopiesPerStoredBody: 1;
      perMatchArtifactCopiesPerStoredBody: 1;
      aggregateReportCopiesPerStoredBody: 0;
      totalMaterializedCopiesPerStoredBody: 2;
      minimumUnescapedUtf8BytesAcrossCopies: number;
      qualification: string;
    };
  };
  clueLegality: ClueLegalityFunnel & {
    failedValidationRate: number | null;
    byArmAndRound: Record<
      "baseline" | "treatment",
      Record<string, ClueLegalityFunnel>
    >;
  };
  failureState: {
    failedMatchArtifacts: number;
    integrityInvalidArtifacts: number;
    artifactPersistenceFailures: number;
    postRunSourceVerificationValid: boolean;
  };
}

/**
 * A launched match whose private artifact could not be written is still a paid
 * match. Its operational evidence is re-read from the disposable database so it
 * stays in the accounting; no exact response body crosses into the aggregate,
 * and nothing about it re-enters behavioral analysis.
 */
export interface RecoveredOperationalSummary {
  source: "disposable_database_requery_after_artifact_persistence_failure";
  status: "recovered" | "unavailable";
  matchId: number | null;
  exactProviderResponseBodiesIncluded: false;
  behavioralUse: "excluded_match_remains_unpersisted_and_suppressing";
  unavailableReason: SanitizedExperimentError | null;
  evidence: OperationalCallEvidence | null;
}

export interface ArtifactPersistenceFailure {
  blockOrdinal: number;
  ordinal: number;
  artifactFile: string;
  error: SanitizedExperimentError;
  recoveredOperationalSummary: RecoveredOperationalSummary;
}

export interface CandidatePolicyAbReport {
  reportVersion: typeof CANDIDATE_POLICY_AB_REPORT_VERSION;
  experimentVersion: typeof CANDIDATE_POLICY_AB_EXPERIMENT_VERSION;
  generatedAt: string;
  schedule: CandidatePolicyAbSchedule;
  status: "complete" | "incomplete";
  releaseBoundary: "blocked_table_protocol_and_prompt_parity";
  tableBotBuildLicenseEligible: false;
  preregistrationContentHash: string;
  plannedMatches: number;
  startedMatches: number;
  validMatches: number;
  failedMatches: number;
  stoppedAfterBlock: number | null;
  artifactPersistenceFailures: ArtifactPersistenceFailure[];
  matchArtifactFiles: string[];
  /**
   * Projections, not the artifacts themselves. Each entry points at its
   * authoritative 0600 file by stable relative path and self-hash; the exact
   * provider response bytes live only there and in the disposable database.
   */
  privateEvidenceBoundary: {
    exactProviderResponseBodies:
      "disposable_database_and_per_match_private_artifact_only";
    aggregateCarriesBodyOrReasoningText: false;
    aggregateCarriesLineageAndAccounting: true;
  };
  matchArtifacts: CandidatePolicyAbAggregateMatchEntry[];
  postRunSourceVerification: {
    valid: boolean;
    mismatches: string[];
    lineage: CandidatePolicyAbSourceLineage;
  };
  behavioralResults: {
    status:
      | "complete_descriptive_unreleasable_protocol_mismatch"
      | "suppressed_incomplete"
      | "excluded_mechanism_canary";
    qualification: string;
    primaryRounds: "2-4";
    primary: BehavioralBlockAnalysis | null;
    roundOne: {
      rounds: "1";
      interpretation: "wrapper_only_diagnostic";
      qualification: string;
      analysis: BehavioralBlockAnalysis | null;
    };
  };
  operationalResults: OperationalRollup;
  reportContentHash: string;
}

interface HeadlessResultLike {
  matchId: number;
  gameId: string;
  winner: "amber" | "blue" | null;
  totalRounds: number;
  teams: Record<string, unknown>;
  players: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export interface CandidatePolicyAbDependencies {
  inspectDatabase?: () => Promise<CandidatePolicyAbDatabaseLineage>;
  executeMatch?: (config: HeadlessMatchConfig) => Promise<HeadlessResultLike>;
  captureMatch?: (matchId: number) => Promise<CapturedMatchData>;
  closeDatabase?: () => Promise<void>;
  collectSourceLineage?: () => Promise<CandidatePolicyAbSourceLineage>;
  collectPostRunSourceLineage?: () => Promise<CandidatePolicyAbSourceLineage>;
  now?: () => Date;
  afterPreregistrationWritten?: (
    path: string,
    preregistration: CandidatePolicyAbPreregistration,
  ) => Promise<void>;
  emitProgress?: (event: {
    blockOrdinal: number;
    ordinal: number;
    status: "success" | "failure";
    matchId: number | null;
  }) => void;
}

export interface CandidatePolicyAbRunOptions {
  outputDir: string;
  schedule: CandidatePolicyAbScheduleId;
  dependencies?: CandidatePolicyAbDependencies;
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function isoNow(now?: () => Date): string {
  const value = (now?.() ?? new Date()).toISOString();
  if (Number.isNaN(Date.parse(value))) {
    throw new Error("experiment timestamp is invalid");
  }
  return value;
}

function oppositeTeam(team: "amber" | "blue"): "amber" | "blue" {
  return team === "amber" ? "blue" : "amber";
}

function isInsideRepository(path: string): boolean {
  const pathRelative = relative(REPOSITORY_ROOT, path);
  return (
    pathRelative === "" ||
    (!pathRelative.startsWith(`..${sep}`) && pathRelative !== "..")
  );
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function assertOutsideEveryGitRepository(
  existingParent: string,
): Promise<void> {
  try {
    await execFileAsync(
      "git",
      ["-C", existingParent, "rev-parse", "--git-dir"],
      {
        encoding: "utf8",
        maxBuffer: 1024 * 1024,
      },
    );
  } catch (error) {
    const code = (error as NodeJS.ErrnoException & { code?: unknown }).code;
    if (code === 128 || code === "128") return;
    const stderr =
      typeof (error as { stderr?: unknown }).stderr === "string"
        ? (error as { stderr: string }).stderr
        : "";
    if (/not a git repository/i.test(stderr)) return;
    throw new Error(
      `could not prove output is outside every git repository: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  throw new Error(
    "experiment output must not be contained in any Git worktree or repository",
  );
}

export function resolveOutputAgainstRealParent(
  requestedOutput: string,
  realParent: string,
): string {
  return resolve(realParent, basename(resolve(requestedOutput)));
}

export async function prepareNewSecureOutputDirectory(
  requestedPath: string,
): Promise<string> {
  if (!requestedPath.trim()) {
    throw new Error("output directory is required");
  }
  const outputDir = resolve(requestedPath);
  if (isInsideRepository(outputDir)) {
    throw new Error(
      "experiment output must be outside the source repository so runtime artifacts cannot dirty the preregistered checkout",
    );
  }
  if (await pathExists(outputDir)) {
    throw new Error(`output directory already exists: ${outputDir}`);
  }
  const parent = await realpath(dirname(outputDir));
  await assertOutsideEveryGitRepository(parent);
  const resolvedOutput = resolveOutputAgainstRealParent(
    outputDir,
    parent,
  );
  if (await pathExists(resolvedOutput)) {
    throw new Error(`output directory already exists: ${resolvedOutput}`);
  }
  await mkdir(resolvedOutput, { mode: 0o700 });
  await chmod(resolvedOutput, 0o700);
  await mkdir(resolve(resolvedOutput, "matches"), { mode: 0o700 });
  await chmod(resolve(resolvedOutput, "matches"), 0o700);
  return resolvedOutput;
}

function assertRelativeArtifactPath(relativePath: string): void {
  if (
    !relativePath ||
    relativePath.startsWith("/") ||
    relativePath.includes("\\") ||
    relativePath.split("/").some((part) => part === "" || part === "..")
  ) {
    throw new Error(`unsafe artifact path: ${relativePath}`);
  }
}

function sensitiveEnvironmentValues(): string[] {
  return Object.entries(process.env)
    .filter(([key, value]) => {
      if (!value || value.length < 8) return false;
      return /(KEY|TOKEN|SECRET|PASSWORD|DATABASE_URL)$/i.test(key);
    })
    .map(([, value]) => value!)
    .sort((left, right) => right.length - left.length);
}

export function assertSecretSafeJson(serialized: string): void {
  const credentialPatterns = [
    /\bsk-(?:ant|or|proj|live|test)-[A-Za-z0-9_-]{12,}\b/,
    /\bgithub_pat_[A-Za-z0-9_]{20,}\b/,
    /\bgh[pousr]_[A-Za-z0-9]{20,}\b/,
    /\bAKIA[0-9A-Z]{16}\b/,
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    /Authorization.{0,24}Bearer\s+[A-Za-z0-9._-]{12,}/i,
  ];
  if (credentialPatterns.some((pattern) => pattern.test(serialized))) {
    throw new Error(
      "artifact serialization contained a credential-shaped value; output suppressed",
    );
  }
  if (
    sensitiveEnvironmentValues().some((secret) => serialized.includes(secret))
  ) {
    throw new Error(
      "artifact serialization contained a configured sensitive environment value; output suppressed",
    );
  }
}

export async function writeSecureNoClobberJson(
  outputDir: string,
  relativePath: string,
  value: unknown,
): Promise<void> {
  assertRelativeArtifactPath(relativePath);
  const absolutePath = resolve(outputDir, relativePath);
  if (!absolutePath.startsWith(`${outputDir}${sep}`)) {
    throw new Error(`artifact escaped output directory: ${relativePath}`);
  }
  const parent = dirname(absolutePath);
  if (parent !== outputDir && !(await pathExists(parent))) {
    await mkdir(parent, { recursive: true, mode: 0o700 });
  }
  await chmod(parent, 0o700);
  const serialized = `${JSON.stringify(
    persistedJsonRepresentation(value),
    null,
    2,
  )}\n`;
  assertSecretSafeJson(serialized);
  const handle = await open(absolutePath, "wx", 0o600);
  try {
    await handle.writeFile(serialized, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await chmod(absolutePath, 0o600);
}

function redactErrorMessage(message: string): string {
  return message
    .replace(
      /\bsk-(?:ant|or|proj|live|test)-[A-Za-z0-9_-]{12,}\b/g,
      "[REDACTED_CREDENTIAL]",
    )
    .replace(/Authorization.{0,24}Bearer\s+\S+/gi, "Authorization: Bearer [REDACTED]")
    .replace(/postgres(?:ql)?:\/\/\S+/gi, "[REDACTED_DATABASE_URL]")
    .slice(0, 2_000);
}

function safeProviderMetadata(
  error: unknown,
): Record<string, unknown> | null {
  if (!error || typeof error !== "object") return null;
  const raw = (error as { providerMetadata?: unknown }).providerMetadata;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const source = raw as Record<string, unknown>;
  const safeKeys = [
    "apiHost",
    "requestedModel",
    "requestedUpstream",
    "physicalAttempt",
    "requestedReasoningEffort",
    "wireReasoningEffort",
    "reasoningDisabled",
    "routing",
    "httpStatus",
    "finishReason",
    "servedModel",
    "upstreamProvider",
    "requestId",
    "generationId",
    "usage",
    "openrouterMetadata",
  ];
  return Object.fromEntries(
    safeKeys
      .filter((key) => source[key] !== undefined)
      .map((key) => [key, source[key]]),
  );
}

function sanitizeError(error: unknown): SanitizedExperimentError {
  const normalized =
    error instanceof Error ? error : new Error(String(error));
  const extended = normalized as Error & {
    code?: unknown;
    matchId?: unknown;
  };
  return {
    name: normalized.name,
    message: redactErrorMessage(normalized.message),
    code: typeof extended.code === "string" ? extended.code : null,
    matchId:
      typeof extended.matchId === "number" &&
      Number.isInteger(extended.matchId)
        ? extended.matchId
        : null,
    providerMetadata: safeProviderMetadata(error),
  };
}

function persistedJsonRepresentation<T>(value: T): T {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new Error("artifact has no JSON representation");
  }
  return JSON.parse(serialized) as T;
}

function withContentHash<
  T extends Record<string, unknown>,
  K extends string,
>(value: T, key: K): T & Record<K, string> {
  // Hash the exact JSON data model that will be persisted. In particular,
  // Drizzle returns Date objects, whose JSON representation is an ISO string
  // but whose enumerable-object representation is empty.
  const persistedValue = persistedJsonRepresentation(value);
  return {
    ...persistedValue,
    [key]: contentHash(persistedValue),
  } as T & Record<K, string>;
}

async function verifyPersistedSelfHash(
  path: string,
  hashField: string,
  expected: Record<string, unknown>,
): Promise<void> {
  const parsed = JSON.parse(await readFile(path, "utf8")) as Record<
    string,
    unknown
  >;
  const claimed = parsed[hashField];
  const withoutHash = Object.fromEntries(
    Object.entries(parsed).filter(([key]) => key !== hashField),
  );
  if (typeof claimed !== "string" || claimed !== contentHash(withoutHash)) {
    throw new Error(`persisted ${hashField} self-hash mismatch`);
  }
  if (
    contentHash(parsed) !==
    contentHash(persistedJsonRepresentation(expected))
  ) {
    throw new Error("persisted artifact differs from in-memory design");
  }
}

async function gitOutput(args: string[]): Promise<string> {
  const result = await execFileAsync("git", ["-C", REPOSITORY_ROOT, ...args], {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  return result.stdout.trim();
}

async function readJsonFile(
  path: string,
): Promise<Record<string, unknown>> {
  const parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
  const value = objectValue(parsed);
  if (!value) {
    throw new Error(`lineage JSON is not an object: ${path}`);
  }
  return value;
}

/**
 * The compiled bytes say nothing about which file `@shared/substrate` resolves
 * to. Record the alias contract, and prove every alias target is a real
 * directory inside this repository rather than a hoisted or linked path.
 */
async function collectImportResolution(
  tsconfigSha256: string | undefined,
): Promise<CandidatePolicyAbImportResolution> {
  if (!tsconfigSha256) {
    throw new Error("tsconfig.json is missing from the pinned source set");
  }
  const tsconfig = await readJsonFile(
    resolve(REPOSITORY_ROOT, "tsconfig.json"),
  );
  const compilerOptions = objectValue(tsconfig.compilerOptions);
  if (!compilerOptions) {
    throw new Error("tsconfig.json has no compilerOptions");
  }
  const baseUrl =
    typeof compilerOptions.baseUrl === "string"
      ? compilerOptions.baseUrl
      : ".";
  const declaredPaths = objectValue(compilerOptions.paths) ?? {};
  const pathAliases = [];
  for (const specifier of Object.keys(declaredPaths).sort()) {
    const declaredTargets = Array.isArray(declaredPaths[specifier])
      ? (declaredPaths[specifier] as unknown[]).filter(
          (entry): entry is string => typeof entry === "string",
        )
      : [];
    if (declaredTargets.length === 0) {
      throw new Error(`tsconfig path alias ${specifier} has no target`);
    }
    const resolvedRoots: string[] = [];
    for (const target of declaredTargets) {
      const root = resolve(
        REPOSITORY_ROOT,
        baseUrl,
        target.replace(/\/?\*+$/, ""),
      );
      if (!(await pathExists(root))) {
        throw new Error(
          `tsconfig path alias ${specifier} resolves to a missing root`,
        );
      }
      resolvedRoots.push(relative(REPOSITORY_ROOT, root) || ".");
    }
    pathAliases.push({
      specifier,
      declaredTargets,
      resolvedRoots,
      allResolvedRootsInsideRepository: resolvedRoots.every((root) =>
        isInsideRepository(resolve(REPOSITORY_ROOT, root)),
      ),
    });
  }
  const withoutHash = {
    tsconfigPath: "tsconfig.json" as const,
    tsconfigSha256,
    runtimeLoader: "tsx" as const,
    moduleResolution:
      typeof compilerOptions.moduleResolution === "string"
        ? compilerOptions.moduleResolution
        : "unspecified",
    baseUrl,
    strict: compilerOptions.strict === true,
    pathAliases,
  };
  return {
    ...withoutHash,
    importResolutionHash: contentHash(withoutHash),
  };
}

/**
 * Declared ranges in `package.json`/`package-lock.json` are an intention.
 * These are the manifests actually present in `node_modules` at dispatch time.
 */
async function collectInstalledDependencies(): Promise<CandidatePolicyAbInstalledDependencies> {
  const rootManifest = await readJsonFile(
    resolve(REPOSITORY_ROOT, "package.json"),
  );
  const declared = {
    ...(objectValue(rootManifest.dependencies) ?? {}),
    ...(objectValue(rootManifest.devDependencies) ?? {}),
  };
  const packages = [];
  for (const name of LINEAGE_DEPENDENCIES) {
    const declaredRange = declared[name];
    if (typeof declaredRange !== "string") {
      throw new Error(`lineage dependency ${name} is not declared`);
    }
    const manifestPath = resolve(
      REPOSITORY_ROOT,
      "node_modules",
      name,
      "package.json",
    );
    if (!(await pathExists(manifestPath))) {
      throw new Error(`lineage dependency ${name} is not installed`);
    }
    const manifestBytes = await readFile(manifestPath);
    const installed = JSON.parse(
      manifestBytes.toString("utf8"),
    ) as Record<string, unknown>;
    if (typeof installed.version !== "string") {
      throw new Error(
        `installed lineage dependency ${name} has no version`,
      );
    }
    packages.push({
      name,
      declaredRange,
      installedVersion: installed.version,
      installedManifestPath: relative(REPOSITORY_ROOT, manifestPath),
      installedManifestSha256: sha256(manifestBytes),
    });
  }
  return {
    packages,
    installedDependencyHash: contentHash(packages),
  };
}

export async function collectCandidatePolicyAbSourceLineage(): Promise<CandidatePolicyAbSourceLineage> {
  const [gitCommitSha, gitTreeSha, gitCommitObjectType, status] =
    await Promise.all([
      gitOutput(["rev-parse", "HEAD"]),
      gitOutput(["rev-parse", "HEAD^{tree}"]),
      gitOutput(["cat-file", "-t", "HEAD"]),
      gitOutput(["status", "--porcelain=v1", "--untracked-files=all"]),
    ]);
  if (gitCommitObjectType !== "commit") {
    throw new Error("experiment source HEAD is not a commit");
  }
  if (status !== "") {
    throw new Error(
      "experiment source checkout is dirty; freeze and commit the exact source before spending",
    );
  }

  const files = [];
  for (const path of SOURCE_PATHS) {
    const workingBytes = await readFile(resolve(REPOSITORY_ROOT, path));
    const committed = await execFileAsync(
      "git",
      ["-C", REPOSITORY_ROOT, "show", `HEAD:${path}`],
      {
        encoding: "buffer",
        maxBuffer: 20 * 1024 * 1024,
      },
    );
    const workingHash = sha256(workingBytes);
    const committedHash = sha256(committed.stdout);
    if (workingHash !== committedHash) {
      throw new Error(`source file differs from HEAD: ${path}`);
    }
    files.push({
      path,
      sha256: workingHash,
      committedSha256: committedHash,
      matchesCommittedBytes: true as const,
    });
  }

  const importResolution = await collectImportResolution(
    files.find((entry) => entry.path === "tsconfig.json")?.sha256,
  );
  const installedDependencies = await collectInstalledDependencies();
  const runtimeIdentity = {
    nodeVersion: process.version,
    v8Version: process.versions.v8,
    platform: process.platform,
    architecture: process.arch,
    execPath: process.execPath,
  };
  return {
    repositoryRoot: REPOSITORY_ROOT,
    capturedAt: new Date().toISOString(),
    gitCommitSha,
    gitTreeSha,
    gitCommitObjectType: "commit",
    gitDirty: false,
    files,
    importResolution,
    installedDependencies,
    sourceSetHash: contentHash({
      gitCommitSha,
      gitTreeSha,
      files,
      importResolution,
      installedDependencies,
    }),
    runtimeIdentity,
    runtimeIdentityHash: contentHash(runtimeIdentity),
  };
}

export function assertDisposableLocalDatabaseUrl(
  databaseUrl: string | undefined,
): {
  databaseName: string;
  socketDirectory: string;
} {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL is not a valid URL");
  }
  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    throw new Error("DATABASE_URL must use postgresql");
  }
  if (parsed.hostname !== "") {
    throw new Error(
      "candidate-policy A/B execution requires a Unix-socket DATABASE_URL with no network hostname",
    );
  }
  if (parsed.username || parsed.password) {
    throw new Error(
      "candidate-policy A/B disposable DATABASE_URL must not embed credentials",
    );
  }
  const socketDirectory = parsed.searchParams.get("host") ?? "";
  if (!["/tmp", "/var/run/postgresql"].includes(socketDirectory)) {
    throw new Error(
      `database Unix socket must be /tmp or /var/run/postgresql, received ${socketDirectory || "(missing)"}`,
    );
  }
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
  if (
    !new RegExp(`^${DISPOSABLE_DATABASE_PREFIX}[a-z0-9_]{4,48}$`).test(
      databaseName,
    )
  ) {
    throw new Error(
      `database name must match ${DISPOSABLE_DATABASE_PREFIX}[a-z0-9_]{4,48}`,
    );
  }
  return { databaseName, socketDirectory };
}

function quotedIdentifier(identifier: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(identifier)) {
    throw new Error(`unsafe database identifier: ${identifier}`);
  }
  return `"${identifier}"`;
}

export async function inspectDisposableLocalDatabase(): Promise<CandidatePolicyAbDatabaseLineage> {
  const databaseUrl = process.env.DATABASE_URL;
  const expected = assertDisposableLocalDatabaseUrl(databaseUrl);
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 1,
    connectionTimeoutMillis: 5_000,
  });
  try {
    const identity = await pool.query<{
      database_name: string;
      server_address: string | null;
    }>(
      "SELECT current_database() AS database_name, inet_server_addr()::text AS server_address",
    );
    const row = identity.rows[0];
    if (!row || row.database_name !== expected.databaseName) {
      throw new Error("connected database identity does not match DATABASE_URL");
    }
    if (row.server_address !== null) {
      throw new Error(
        "connected PostgreSQL server used a network transport instead of a Unix socket",
      );
    }

    const requiredTables = [
      "ai_call_logs",
      "match_rounds",
      "matches",
      "provider_attempts",
      "team_chatter",
    ];
    const tableResult = await pool.query<{ table_name: string }>(
      `SELECT table_name
         FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        ORDER BY table_name`,
    );
    const tableNames = tableResult.rows.map((entry) => entry.table_name);
    const missingTables = requiredTables.filter(
      (table) => !tableNames.includes(table),
    );
    if (missingTables.length > 0) {
      throw new Error(
        `disposable database is not schema-current; missing tables: ${missingTables.join(", ")}`,
      );
    }

    const requiredTelemetryColumns = [
      "ai_call_logs.action_applied",
      "ai_call_logs.actor_id",
      "ai_call_logs.team",
      "ai_call_logs.validation_metadata",
      "provider_attempts.action_applied",
      "provider_attempts.actor_id",
      "provider_attempts.private_response_receipt",
      "provider_attempts.team",
      "provider_attempts.validation_metadata",
    ];
    const columnsResult = await pool.query<{
      table_name: string;
      column_name: string;
      data_type: string;
      is_nullable: string;
      column_default: string | null;
      ordinal_position: number;
    }>(
      `SELECT table_name, column_name, data_type, is_nullable, column_default, ordinal_position
         FROM information_schema.columns
        WHERE table_schema = 'public'
        ORDER BY table_name, ordinal_position`,
    );
    const columnNames = new Set(
      columnsResult.rows.map(
        (entry) => `${entry.table_name}.${entry.column_name}`,
      ),
    );
    const missingColumns = requiredTelemetryColumns.filter(
      (column) => !columnNames.has(column),
    );
    if (missingColumns.length > 0) {
      throw new Error(
        `disposable database is missing telemetry columns: ${missingColumns.join(", ")}`,
      );
    }

    let initialApplicationRows = 0;
    for (const tableName of tableNames) {
      if (tableName.startsWith("__drizzle")) continue;
      const count = await pool.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM ${quotedIdentifier(tableName)}`,
      );
      initialApplicationRows += Number.parseInt(count.rows[0]?.count ?? "0", 10);
    }
    if (initialApplicationRows !== 0) {
      throw new Error(
        `disposable database must be empty before preregistration; found ${initialApplicationRows} application rows`,
      );
    }

    const indexes = await pool.query<{
      tablename: string;
      indexname: string;
      indexdef: string;
    }>(
      `SELECT tablename, indexname, indexdef
         FROM pg_indexes
        WHERE schemaname = 'public'
        ORDER BY tablename, indexname`,
    );
    const schemaDescriptor = {
      tables: tableNames,
      columns: columnsResult.rows,
      indexes: indexes.rows,
    };
    const lineageWithoutHash = {
      databaseName: expected.databaseName,
      socketDirectory: expected.socketDirectory,
      transport: "local_unix_socket" as const,
      initialApplicationRows: 0 as const,
      requiredTables,
      requiredTelemetryColumns,
      provisioningContract: {
        command:
          "npm run experiment:candidate-policy-ab-db-prepare" as const,
        schemaSyncCommand: "npm run db:push" as const,
        mode: "schema_sync_not_migration_replay" as const,
        migrationJournalAcceptedForProvisioning: false as const,
      },
      schemaHash: contentHash(schemaDescriptor),
    };
    return {
      ...lineageWithoutHash,
      databaseLineageHash: contentHash(lineageWithoutHash),
    };
  } finally {
    await pool.end();
  }
}

function deterministicSeedInputs(
  seedValue: string,
  rounds: number,
): SeedInputManifest {
  const rng = createSeededRng(seedValue);
  const amberKeywords = getRandomKeywords(4, rng);
  const blueKeywords = getRandomKeywords(4, rng);
  if (amberKeywords.length !== 4 || blueKeywords.length !== 4) {
    throw new Error("word pack did not produce exactly four keywords per team");
  }
  const codes = Array.from({ length: rounds }, (_, index) => ({
    round: index + 1,
    amber: generateSecretCode(rng),
    blue: generateSecretCode(rng),
  }));
  return {
    seed: seedValue,
    keywords: {
      amber: amberKeywords as [string, string, string, string],
      blue: blueKeywords as [string, string, string, string],
    },
    codes,
  };
}

const compiledArtifact = compileStrategyArtifact(
  mintStrategyArtifact(INTERMEDIATE_HOPS_SOURCE),
);
const compiledPrompts = compiledArtifact.compiled;
const exactModelConfig = getConfigForModel("openrouter", EXACT_MODEL);

function assertExactModelConfig(): void {
  if (
    exactModelConfig.provider !== "openrouter" ||
    exactModelConfig.model !== EXACT_MODEL ||
    exactModelConfig.reasoningEffort !== "xhigh" ||
    exactModelConfig.promptStrategy !== "advanced" ||
    exactModelConfig.timeoutMs !== 45 * 60 * 1_000 ||
    DEEPSEEK_V4_FLASH_CANONICAL.provider !== "openrouter" ||
    DEEPSEEK_V4_FLASH_CANONICAL.model !== EXACT_MODEL ||
    DEEPSEEK_V4_FLASH_CANONICAL.upstream !== EXACT_UPSTREAM_SLUG
  ) {
    throw new Error("exact DeepSeek V4 Flash 0731 experiment route drifted");
  }
}

function promptOverridesForMatch(
  treatmentTeam: "amber" | "blue",
): NonNullable<HeadlessMatchConfig["promptOverrides"]> {
  const controlTeam = oppositeTeam(treatmentTeam);
  return {
    [treatmentTeam]: {
      compiledPrompts,
      candidatePolicy: CIPHER_ENCRYPT_CANDIDATE_POLICY_ARTIFACT,
    },
    [controlTeam]: {
      compiledPrompts,
    },
  };
}

function player(
  name: string,
  team: "amber" | "blue",
): HeadlessMatchConfig["players"][number] {
  return {
    name,
    team,
    aiProvider: "openrouter",
    aiConfig: { ...exactModelConfig },
  };
}

function matchConfig(
  scheduleValue: CandidatePolicyAbSchedule,
  seedValue: string,
  blockOrdinal: number,
  treatmentTeam: "amber" | "blue",
): HeadlessMatchConfig {
  const roleSwapGroupId = `cpab-${scheduleValue.id}-${String(blockOrdinal).padStart(2, "0")}`;
  const parsed = parseHeadlessMatchConfig({
    players: [
      player("Amber Seat 1", "amber"),
      player("Amber Seat 2", "amber"),
      player("Blue Seat 1", "blue"),
      player("Blue Seat 2", "blue"),
    ],
    fastMode: false,
    strictExecution: true,
    seed: seedValue,
    teamSize: 2,
    gameRules: {
      whiteTokenLimit: 1_000,
      blackTokenLimit: 1_000,
      minRoundsBeforeWin: scheduleValue.roundsPerMatch,
      maxRounds: scheduleValue.roundsPerMatch,
    },
    experimentId: `cpab-${scheduleValue.id}-v0.1`,
    promptOverrides: promptOverridesForMatch(treatmentTeam),
    roleSwapGroupId,
    focalTeam: treatmentTeam,
    matchKind: "candidate-policy-ab",
    matchmakingBucket: scheduleValue.id,
    ablations: { flags: [...FIXED_ABLATIONS] },
    enablePostMatchReflection: false,
  });
  assertFixedMatchConfig(parsed, scheduleValue, treatmentTeam);
  return parsed;
}

export function assertFixedMatchConfig(
  config: HeadlessMatchConfig,
  scheduleValue: CandidatePolicyAbSchedule,
  treatmentTeam: "amber" | "blue",
): void {
  const controlTeam = oppositeTeam(treatmentTeam);
  const flags = config.ablations?.flags ?? [];
  const invalid =
    config.players.length !== 4 ||
    config.players.some(
      (entry, index) =>
        entry.name !==
          [
            "Amber Seat 1",
            "Amber Seat 2",
            "Blue Seat 1",
            "Blue Seat 2",
          ][index] ||
        entry.aiProvider !== "openrouter" ||
        entry.aiConfig?.model !== EXACT_MODEL ||
        entry.aiConfig?.reasoningEffort !== "xhigh" ||
        entry.aiConfig?.promptStrategy !== "advanced" ||
        entry.aiConfig?.timeoutMs !== 45 * 60 * 1_000,
    ) ||
    config.teamSize !== 2 ||
    config.strictExecution !== true ||
    config.enablePostMatchReflection !== false ||
    config.scratchNotesByTeam !== undefined ||
    flags.length !== 2 ||
    flags[0] !== FIXED_ABLATIONS[0] ||
    flags[1] !== FIXED_ABLATIONS[1] ||
    config.gameRules?.minRoundsBeforeWin !== scheduleValue.roundsPerMatch ||
    config.gameRules?.maxRounds !== scheduleValue.roundsPerMatch ||
    config.focalTeam !== treatmentTeam ||
    config.promptOverrides?.[treatmentTeam]?.candidatePolicy?.contentHash !==
      CIPHER_ENCRYPT_CANDIDATE_POLICY_ARTIFACT.contentHash ||
    config.promptOverrides?.[controlTeam]?.candidatePolicy !== undefined ||
    contentHash(
      config.promptOverrides?.[treatmentTeam]?.compiledPrompts ?? null,
    ) !== contentHash(compiledPrompts) ||
    contentHash(config.promptOverrides?.[controlTeam]?.compiledPrompts ?? null) !==
      contentHash(compiledPrompts);
  if (invalid) {
    throw new Error("candidate-policy A/B match config drifted from fixed design");
  }
}

export function candidatePolicyAbJobs(
  scheduleValue: CandidatePolicyAbSchedule,
): MatchJob[] {
  const jobs: MatchJob[] = [];
  for (const [seedIndex, seedValue] of scheduleValue.seeds.entries()) {
    const blockOrdinal = seedIndex + 1;
    for (const treatmentTeam of ["amber", "blue"] as const) {
      const ordinal = jobs.length + 1;
      const mirror =
        treatmentTeam === "amber"
          ? "treatment-amber"
          : "treatment-blue";
      const config = matchConfig(
        scheduleValue,
        seedValue,
        blockOrdinal,
        treatmentTeam,
      );
      jobs.push({
        ordinal,
        blockOrdinal,
        seed: seedValue,
        mirror,
        treatmentTeam,
        controlTeam: oppositeTeam(treatmentTeam),
        roleSwapGroupId: config.roleSwapGroupId!,
        artifactFile: `matches/${String(ordinal).padStart(4, "0")}-${mirror}.json`,
        config,
      });
    }
  }
  assertFixedJobs(scheduleValue, jobs);
  return jobs;
}

export function assertFixedJobs(
  scheduleValue: CandidatePolicyAbSchedule,
  jobs: MatchJob[],
): void {
  if (
    jobs.length !== scheduleValue.plannedMatches ||
    jobs.some((job, index) => {
      const expectedBlock = Math.floor(index / 2) + 1;
      const expectedTreatment = index % 2 === 0 ? "amber" : "blue";
      return (
        job.ordinal !== index + 1 ||
        job.blockOrdinal !== expectedBlock ||
        job.seed !== scheduleValue.seeds[expectedBlock - 1] ||
        job.treatmentTeam !== expectedTreatment ||
        job.controlTeam !== oppositeTeam(expectedTreatment) ||
        job.roleSwapGroupId !==
          jobs[(expectedBlock - 1) * 2]?.roleSwapGroupId
      );
    })
  ) {
    throw new Error("candidate-policy A/B job enumeration drifted");
  }
}

function roundOnePromptProof(
  manifest: SeedInputManifest,
  team: "amber" | "blue",
): PreregisteredPromptProof {
  const strategy = getPromptStrategy("advanced");
  const cluePrompt = compiledPrompts.prompts.cluegiver;
  const params = {
    keywords: manifest.keywords[team],
    targetCode: manifest.codes[0]![team],
    history: [],
    ablations: [...FIXED_ABLATIONS],
    systemPromptOverride: cluePrompt.systemPrompt,
    taskDirectives: cluePrompt.taskDirectives ?? undefined,
  };
  const baselineTask = strategy.clueTemplate(params);
  const treatmentTask = strategy.clueTemplate({
    ...params,
    candidatePolicy: CIPHER_ENCRYPT_CANDIDATE_POLICY_ARTIFACT,
  });
  const baselineFull = `${cluePrompt.systemPrompt}\n\n${baselineTask}`;
  const treatmentFull = `${cluePrompt.systemPrompt}\n\n${treatmentTask}`;
  if (
    baselineFull.includes(
      CIPHER_ENCRYPT_CANDIDATE_POLICY_ARTIFACT.instruction,
    ) ||
    baselineFull.includes(COLUMN_LEDGER_MARKER) ||
    !treatmentFull.includes(
      CIPHER_ENCRYPT_CANDIDATE_POLICY_ARTIFACT.instruction,
    ) ||
    treatmentFull.includes(COLUMN_LEDGER_MARKER)
  ) {
    throw new Error("round-one whole-prompt contrast drifted");
  }
  return {
    seed: manifest.seed,
    team,
    systemPromptSha256: sha256Hex(cluePrompt.systemPrompt),
    baseline: {
      fullPrompt: baselineFull,
      fullPromptSha256: sha256Hex(baselineFull),
      charCount: baselineFull.length,
      containsCandidatePolicy: false as const,
      containsColumnLedger: false as const,
    },
    treatment: {
      fullPrompt: treatmentFull,
      fullPromptSha256: sha256Hex(treatmentFull),
      charCount: treatmentFull.length,
      containsCandidatePolicy: true as const,
      containsColumnLedger: false as const,
    },
  };
}

function roundOnePromptProofs(
  seedInputs: SeedInputManifest[],
): PreregisteredPromptProof[] {
  return seedInputs.flatMap((manifest) =>
    (["amber", "blue"] as const).map((team) =>
      roundOnePromptProof(manifest, team),
    ),
  );
}

export function preregisteredRoundOnePromptProof(
  job: MatchJob,
  scheduleValue: CandidatePolicyAbSchedule,
  team: "amber" | "blue",
): PreregisteredPromptProof {
  return roundOnePromptProof(
    deterministicSeedInputs(job.seed, scheduleValue.roundsPerMatch),
    team,
  );
}

function preregistration(
  scheduleValue: CandidatePolicyAbSchedule,
  jobs: MatchJob[],
  sourceLineage: CandidatePolicyAbSourceLineage,
  databaseLineage: CandidatePolicyAbDatabaseLineage,
  now?: () => Date,
): CandidatePolicyAbPreregistration {
  const seedInputs = scheduleValue.seeds.map((seedValue) =>
    deterministicSeedInputs(seedValue, scheduleValue.roundsPerMatch),
  );
  const baselineCarrier = {
    compiledPrompts,
  };
  const treatmentCarrier = {
    compiledPrompts,
    candidatePolicy: CIPHER_ENCRYPT_CANDIDATE_POLICY_ARTIFACT,
  };
  const withoutHash = {
    preregistrationVersion:
      CANDIDATE_POLICY_AB_PREREGISTRATION_VERSION,
    experimentVersion: CANDIDATE_POLICY_AB_EXPERIMENT_VERSION,
    registeredAt: isoNow(now),
    status: "registered_before_provider_dispatch" as const,
    schedule: scheduleValue,
    fixedExecution: {
      teamSize: 2 as const,
      pairConcurrency: PAIR_CONCURRENCY as 2,
      sequentialSeedBlocks: true as const,
      retries: 0 as const,
      fallbacks: 0 as const,
      replacementMatches: 0 as const,
      failedMatchesRetained: true as const,
      stopAfterFailedPair: true as const,
      postMatchReflection: false as const,
      seatAssignment: {
        cluegiver: "alternates_seat_1_seat_2_by_round" as const,
        ownGuesser: "non_cluegiver_teammate" as const,
        interceptor: "seat_1_fixed_every_round" as const,
        mirroredMeaning:
          "treatment_color_swap_only_not_actor_role_rotation" as const,
      },
      scratchNotes: "disabled" as const,
      opponentTranscript:
        "structurally_absent_in_2v2_and_ablated" as const,
      ablations: FIXED_ABLATIONS,
      clueLegalityPreflight: {
        validator:
          "shared.validateClueSubmission@substrate" as const,
        ruleSet: "HERPETARIUM_CLUE_RULES" as const,
        ruleOptions: HERPETARIUM_CLUE_RULES,
        // Normalization is `toLocaleLowerCase("en")` with every non
        // `[a-z0-9]` character removed, so these are characters, not letters,
        // and the containment and stem rules are gated on a keyword having at
        // least four of them. The enforced prompt text states the same gate.
        enforcedConstraints: [
          "exactly three distinct clues per round",
          "one complete word per clue",
          "maximum 40 characters",
          "not equal to any keyword after normalization",
          "for keywords of at least four normalized characters: does not contain that keyword anywhere in the normalized clue, including across separators",
          "for keywords of at least four normalized characters: no clue word begins with that keyword's first four normalized characters",
          "does not repeat any earlier clue from the same team",
        ],
        keywordRuleThreshold: {
          normalizationRule:
            "lowercase_en_then_drop_every_non_alphanumeric_character",
          minimumNormalizedKeywordCharacters: 4,
          shorterKeywordsEnforceOnly: "exact_normalized_equality",
          stemComparison: "clue_word_prefix_against_keyword_first_four",
        },
        strictFailureDisposition:
          "persist_response_reject_action_invalidate_match_no_regeneration" as const,
        nonStrictCompatibilityDisposition:
          "persist_response_apply_unchanged_taint_match_no_regeneration" as const,
        nonStrictTaintedMatchDisposition: {
          durableRecord:
            "passed_false_action_applied_true_disposition_and_taint_reasons_persist",
          matchQualityStatus: "tainted",
          taintReason: "action_validation_failure",
          legacyMetricsEffect:
            "dropped_by_default_from_legacy_tournament_and_eval_aggregates",
          legacyMetricsFilter:
            "server/routes.ts tournament aggregation excludes qualityStatus === 'tainted' unless includeTainted is requested",
          consequence:
            "In non-strict runs a validator failure removes the whole match from the default legacy rate denominators while leaving every row durable, so legacy aggregates silently describe a filtered subset. This strict experiment never reads that path: it retains every match, counts every paid attempt, and suppresses behavioral comparison instead of dropping matches.",
          appliesToThisExperiment: false as const,
        },
        randomCluesAblation: {
          scheduledInThisExperiment: false as const,
          poolSize: 10 as const,
          samplesWithReplacement: true as const,
          duplicateOnlyInvalidTripleProbability: 0.28 as const,
          fourRoundRepeatLegality:
            "impossible_12_draws_from_10_words" as const,
        },
        genericFallbackClues: {
          enabledInStrictExperiment: false as const,
          poolSize: 10 as const,
          samplesWithReplacement: true as const,
          duplicateOnlyInvalidTripleProbability: 0.28 as const,
        },
        qualification:
          "The 28% figure is the exact within-triple duplicate probability for 3 draws with replacement from 10 words. Keyword collisions and prior-round repeats can add attrition. Strict candidate-policy runs schedule neither random_clues nor fallback application; observed validator rejection is reported operationally.",
      },
    },
    route: {
      provider: "openrouter" as const,
      model: EXACT_MODEL,
      upstreamSlug: EXACT_UPSTREAM_SLUG,
      upstreamDisplay: EXACT_UPSTREAM_DISPLAY,
      reasoningEffort: "xhigh" as const,
      wireReasoningEffort: "max" as const,
      timeoutMs: exactModelConfig.timeoutMs,
      maxCompletionTokens: EXACT_COMPLETION_TOKEN_LIMIT,
      allowFallbacks: false as const,
      requireParameters: true as const,
      dataCollection: "deny" as const,
      clientPhysicalRequestsPerCall:
        PHYSICAL_ATTEMPTS_PER_CALL as 1,
      privateReasoningReceipt: {
        requestedForEveryStrictDurableCall: true as const,
        requestShape:
          "reasoning_effort_max_exclude_false" as const,
        storage:
          "operator_private_provider_attempt_exact_success_body" as const,
        exactBodyLineage: "sha256_and_utf8_bytes" as const,
        reasoningDisposition:
          "returned_fields_bound_within_exact_body_or_explicit_absence_with_token_count" as const,
        exactBytesMaterializedIn: [
          "disposable_database_provider_attempt_row",
          "per_match_private_artifact_mode_0600",
        ] as const,
        aggregateReportExposure: false as const,
        gameplayExposure: false as const,
        trackedEvidenceExposure: false as const,
      },
      routerProof:
        "attempt_1_one_selected_deepinfra_zero_or_one_successful_deepinfra_detailed_attempt" as const,
    },
    treatmentContrast: {
      experimentalUnit: "paired_seed_block" as const,
      measuredPackage:
        "full_candidate_policy_authority_plus_treatment_only_ledger_and_rejection" as const,
      minimalMechanismNotEstimated:
        "minimal_ledger_plus_rejection_only" as const,
      baseline:
        "Exact compiled intermediate-hops carrier on every role; no actor-call candidate policy and no column-major ledger.",
      treatment:
        "The same compiled intermediate-hops carrier on every role, plus the exact canonical candidate policy and authority wrapper on cluegiver calls. In rounds 2-4 the treatment-only ledger also gives the operative instruction to reject readily discoverable public association routes.",
      identicalCarrier:
        "Both arms use byte-identical compiled system prompts and role task directives, the same model route, seats, words, codes, rules, and ablations.",
      roundOneDifference:
        "No ledger exists in round 1, but the treatment whole prompt already differs through the candidate-policy authority wrapper and exact policy instruction.",
      laterRoundDifference:
        "In rounds 2-4 the treatment clue prompt adds the column-major public ledger as well as the policy/authority wrapper; the baseline retains its ordinary round-major history and baseline task-authority composition.",
      downstreamDivergence:
        "Generated clues and game outcomes can diverge after the first treated clue, so later decoder/interceptor prompt text may differ endogenously even though their carriers and role directives are identical.",
      interpretationBoundary:
        "This estimates only the full within-Herpetarium candidate-policy/authority plus treatment-only operative-ledger package. It does not estimate the minimal ledger-plus-rejection mechanism by itself and supplies no marginal, bound, or seating inference for The Table.",
      tableTransferBoundary: {
        status:
          "forbidden_known_arm_assignment_and_instruction_mismatch" as const,
        herpetariumAssignment:
          "ledger_and_operative_rejection_instruction_treatment_only" as const,
        currentTableAssignment:
          "ledger_all_encryptors_without_operative_rejection_instruction" as const,
        requiredBeforeTransfer:
          "byte_identical_full_prompts_and_identical_arm_assignment_per_role_and_round" as const,
        forbiddenInterpretations: [
          "table_marginal_effect",
          "table_upper_bound",
          "table_lower_bound",
          "table_seating_license",
        ] as const,
      },
      compiledArtifact: {
        id: compiledArtifact.artifactId,
        contentHash: compiledArtifact.artifactContentHash,
        compiledPromptsHash: contentHash(compiledPrompts),
        genomeHash: compiledPrompts.genomeHash,
        compilerVersion: compiledPrompts.compilerVersion,
        substrateVersion: compiledPrompts.substrateVersion,
      },
      candidatePolicy: {
        id: CIPHER_ENCRYPT_CANDIDATE_POLICY_ARTIFACT.id,
        contentHash:
          CIPHER_ENCRYPT_CANDIDATE_POLICY_ARTIFACT.contentHash,
        instruction:
          CIPHER_ENCRYPT_CANDIDATE_POLICY_ARTIFACT.instruction,
        appliesToRoles: ["cluegiver"] as const,
      },
      baselineCarrierHash: contentHash(baselineCarrier),
      treatmentCarrierHash: contentHash(treatmentCarrier),
    },
    runtimeProtocolParity: {
      status: "known_mismatch_unreleasable" as const,
      currentRunner: "herpetarium_headless_legacy" as const,
      requiredTarget: "table-competitive-v1" as const,
      tableBotBuildLicenseEligible: false as const,
      canaryPurpose: "mechanism_telemetry_only" as const,
      knownMismatches: [
        "herpetarium_allows_round_1_interception",
        "herpetarium_resolves_own_guesses_before_interceptions",
        "herpetarium_active_cluegiver_can_intercept_in_2v2",
        "configured_team_size_round_limit_and_token_limits_are_not_table_competitive_defaults",
        "herpetarium_3v3_can_expose_opponent_decode_chatter",
      ] as const,
      releaseRequirement:
        "table-competitive-v1 runner plus golden transition_role_visibility_and_rules_parity" as const,
    },
    seedInputs,
    roundOnePromptProofs: roundOnePromptProofs(seedInputs),
    jobs,
    estimands: {
      primaryRounds: PRIMARY_ROUND_WINDOW.label,
      primaryRoundWindow: {
        firstRound: PRIMARY_ROUND_WINDOW.firstRound,
        lastRound: PRIMARY_ROUND_WINDOW.lastRound,
        equalsScheduledRoundsPerMatch:
          PRIMARY_ROUND_WINDOW.lastRound ===
          scheduleValue.roundsPerMatch,
        assertion:
          "A behavior-bearing schedule must run exactly rounds 2-4; the harness throws rather than reporting a window narrower than the match it ran.",
      },
      roundOne: "secondary_policy_authority_only" as const,
      outcomes: [
        "teammate decode accuracy",
        "miscommunication frequency",
        "vulnerability to opponent interception",
      ],
      aliasedNonEstimands: [
        "interceptions made: reported only as `opponentArmVulnerabilityRateAlias`, which is assigned from the opposite arm's vulnerability rate rather than recomputed, because in a two-arm match one arm's interceptions are the other arm's vulnerable rounds counted from the other side. Its contrast is the exact negation of the vulnerability contrast and adds no information.",
      ],
      operations: [
        "provider calls",
        "provider-reported or estimated cost",
        "latency distribution",
        "strict route and one-attempt proof",
        "operator-private exact paid-call response receipt counts, body bytes, reasoning presence or explicit absence, and receipt lineage failures",
      ],
      clueLevel: [
        "exact full prompt",
        "raw response",
        "parsed clues",
        "target code",
        "own decode",
        "opponent interception",
        "team and actor identity",
        "action-applied and validator disposition",
        "operator-private paid-call response body hash and UTF-8 length without gameplay exposure",
      ],
      missingDataRule:
        "Every failed or partial match remains in the database and output. It is never retried or replaced. Any failed pair, incomplete schedule, route defect, telemetry defect, or source change suppresses behavioral comparison. If a match launched but its private artifact could not be persisted, its operational provider-attempt, cost, token, and route evidence is re-read once from the disposable database so no paid attempt goes uncounted; the match stays unpersisted, stays out of behavior, and keeps the run incomplete.",
      aggregationRule:
        "Pair by deterministic seed block and mirrored treatment side. Treat rounds as repeated observations nested within a seed block; do not count team-rounds as independent games.",
      inferenceQualification: scheduleValue.inferenceQualification,
    },
    databaseLineage,
    sourceLineage,
  };
  return withContentHash(
    withoutHash as unknown as Record<string, unknown>,
    "preregistrationContentHash",
  ) as unknown as CandidatePolicyAbPreregistration;
}

async function defaultExecuteMatch(
  config: HeadlessMatchConfig,
): Promise<HeadlessResultLike> {
  const { runHeadlessMatch } = await import("../server/headlessRunner");
  return (await runHeadlessMatch(config)) as unknown as HeadlessResultLike;
}

async function defaultCaptureMatch(
  matchId: number,
): Promise<CapturedMatchData> {
  const { storage } = await import("../server/storage");
  const [match, rounds, aiCallLogs, providerAttempts, teamChatter] =
    await Promise.all([
      storage.getMatch(matchId),
      storage.getMatchRounds(matchId),
      storage.getAiCallLogs(matchId),
      storage.getProviderAttempts(matchId),
      storage.getTeamChatter(matchId),
    ]);
  return {
    match: (match ?? null) as unknown as Record<string, unknown> | null,
    rounds: rounds as unknown as Array<Record<string, unknown>>,
    aiCallLogs:
      aiCallLogs as unknown as Array<Record<string, unknown>>,
    providerAttempts:
      providerAttempts as unknown as Array<Record<string, unknown>>,
    teamChatter:
      teamChatter as unknown as Array<Record<string, unknown>>,
  };
}

async function defaultCloseDatabase(): Promise<void> {
  const { closeDatabasePool } = await import("../server/db");
  await closeDatabasePool();
}

function armByTeam(job: MatchJob): {
  amber: "baseline" | "treatment";
  blue: "baseline" | "treatment";
} {
  return {
    amber: job.treatmentTeam === "amber" ? "treatment" : "baseline",
    blue: job.treatmentTeam === "blue" ? "treatment" : "baseline",
  };
}

function objectValue(
  value: unknown,
): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function isSuccessfulDeepInfraDetailedAttempt(
  attempt: unknown,
): boolean {
  const value = objectValue(attempt);
  const rawStatus = value?.status;
  const status =
    asNumber(rawStatus) ??
    (typeof rawStatus === "string" && /^[0-9]{3}$/.test(rawStatus)
      ? Number.parseInt(rawStatus, 10)
      : null);
  return (
    value?.provider === EXACT_UPSTREAM_DISPLAY &&
    status !== null &&
    Number.isInteger(status) &&
    status >= 200 &&
    status < 300
  );
}

function validateRouteMetadata(
  attempt: Record<string, unknown>,
): string[] {
  const issues: string[] = [];
  const request = objectValue(attempt.requestMetadata);
  const terminal = objectValue(attempt.terminalMetadata);
  const routing = objectValue(request?.routing);
  const openRouter = objectValue(terminal?.openrouterMetadata);
  const detailedAttemptsPresent =
    openRouter !== null &&
    Object.prototype.hasOwnProperty.call(openRouter, "attempts");
  const detailedAttemptsShapeValid =
    !detailedAttemptsPresent || Array.isArray(openRouter?.attempts);
  const routerAttempts = Array.isArray(openRouter?.attempts)
    ? openRouter.attempts
    : [];
  const endpoints = objectValue(openRouter?.endpoints);
  const availableEndpoints = Array.isArray(endpoints?.available)
    ? endpoints.available
    : [];
  const selectedEndpoints = availableEndpoints.filter(
    (endpoint) => objectValue(endpoint)?.selected === true,
  );
  const detailedAttemptsValid =
    detailedAttemptsShapeValid &&
    (routerAttempts.length === 0 ||
      (routerAttempts.length === 1 &&
        isSuccessfulDeepInfraDetailedAttempt(routerAttempts[0])));
  if (request?.requestedModel !== EXACT_MODEL) {
    issues.push("provider attempt requested wrong model");
  }
  if (request?.requestedUpstream !== EXACT_UPSTREAM_SLUG) {
    issues.push("provider attempt requested wrong upstream");
  }
  if (request?.physicalAttempt !== 1 || attempt.physicalAttempt !== 1) {
    issues.push("provider attempt was not physical attempt one");
  }
  if (request?.wireReasoningEffort !== "max") {
    issues.push("provider attempt did not send max wire reasoning");
  }
  if (request?.privateReasoningReceiptRequested !== true) {
    issues.push(
      "provider attempt did not request operator-private reasoning retention",
    );
  }
  if (
    request?.maxCompletionTokens !== EXACT_COMPLETION_TOKEN_LIMIT
  ) {
    issues.push("provider attempt used the wrong completion-token ceiling");
  }
  if (
    !Array.isArray(routing?.only) ||
    routing.only.length !== 1 ||
    routing.only[0] !== EXACT_UPSTREAM_SLUG ||
    routing.allow_fallbacks !== false ||
    routing.require_parameters !== true ||
    routing.data_collection !== "deny"
  ) {
    issues.push("provider routing was not the fixed DeepInfra-only route");
  }
  if (
    attempt.status !== "succeeded" ||
    terminal?.httpStatus !== 200 ||
    terminal?.servedModel !== EXACT_MODEL ||
    terminal?.upstreamProvider !== EXACT_UPSTREAM_DISPLAY ||
    terminal?.finishReason !== "stop"
  ) {
    issues.push("provider terminal route proof was not exact and successful");
  }
  if (
    openRouter?.attempt !== 1 ||
    !detailedAttemptsValid ||
    selectedEndpoints.length !== 1 ||
    objectValue(selectedEndpoints[0])?.provider !== EXACT_UPSTREAM_DISPLAY
  ) {
    issues.push(
      "provider OpenRouter proof lacked one selected DeepInfra route and zero or one successful DeepInfra detailed attempt",
    );
  }
  return issues;
}

function hasCompiledCluegiverCarrier(
  prompt: string,
): boolean {
  const artifact = compiledPrompts.prompts.cluegiver;
  return (
    prompt.startsWith(`${artifact.systemPrompt}\n\n`) &&
    (artifact.taskDirectives === null ||
      prompt.includes(artifact.taskDirectives))
  );
}

function hasExactCompiledNonClueCarrier(
  prompt: string,
  role: "own_guesser" | "interceptor",
): boolean {
  const artifact = compiledPrompts.prompts[role];
  const fullSystemPrefix = `${artifact.systemPrompt}\n\n`;
  if (!prompt.startsWith(fullSystemPrefix)) return false;

  const taskHeader = "\n\nYour team's strategic approach:\n";
  const userPromptOffset = fullSystemPrefix.length;
  const headerIndex = prompt.indexOf(taskHeader, userPromptOffset);
  if (artifact.taskDirectives === null) {
    return headerIndex === -1;
  }
  if (
    headerIndex === -1 ||
    prompt.indexOf(taskHeader, headerIndex + taskHeader.length) !== -1
  ) {
    return false;
  }

  const directivesStart = headerIndex + taskHeader.length;
  const nextApplicationSection =
    role === "own_guesser"
      ? "\nStep 5 — Final Answer:"
      : "\nStep 6 — Final Interception:";
  const directivesEnd = prompt.indexOf(
    nextApplicationSection,
    directivesStart,
  );
  if (directivesEnd === -1) return false;
  return (
    prompt.slice(directivesStart, directivesEnd) ===
    artifact.taskDirectives
  );
}

export function validateCapturedMatch(
  job: MatchJob,
  scheduleValue: CandidatePolicyAbSchedule,
  executionResult: HeadlessResultLike | null,
  capture: CapturedMatchData | null,
): string[] {
  const issues: string[] = [];
  if (!executionResult || !capture?.match) {
    return ["match execution or durable match capture is missing"];
  }
  if (
    executionResult.totalRounds !== scheduleValue.roundsPerMatch ||
    capture.match.totalRounds !== scheduleValue.roundsPerMatch
  ) {
    issues.push("match did not complete the fixed number of rounds");
  }
  if (capture.match.gameSeed !== job.seed) {
    issues.push("durable match seed differs from preregistration");
  }
  if (capture.match.roleSwapGroupId !== job.roleSwapGroupId) {
    issues.push("durable role-swap group differs from preregistration");
  }
  if (capture.match.focalTeam !== job.treatmentTeam) {
    issues.push("durable focal team differs from treatment seating");
  }
  if (capture.teamChatter.length !== 0) {
    issues.push("2v2 match unexpectedly persisted team chatter");
  }
  if (capture.rounds.length !== scheduleValue.roundsPerMatch * 2) {
    issues.push("durable round rows are incomplete");
  }

  const expectedCalls =
    scheduleValue.roundsPerMatch * CALLS_PER_MATCH_ROUND;
  if (capture.aiCallLogs.length !== expectedCalls) {
    issues.push(
      `expected ${expectedCalls} AI call logs, received ${capture.aiCallLogs.length}`,
    );
  }
  if (capture.providerAttempts.length !== expectedCalls) {
    issues.push(
      `expected ${expectedCalls} provider attempts, received ${capture.providerAttempts.length}`,
    );
  }

  const playerConfigs = Array.isArray(capture.match.playerConfigs)
    ? (capture.match.playerConfigs as Array<Record<string, unknown>>)
    : [];
  const playerById = new Map(
    playerConfigs.map((entry) => [entry.id, entry]),
  );
  const playersByTeam = {
    amber: playerConfigs.filter((entry) => entry.team === "amber"),
    blue: playerConfigs.filter((entry) => entry.team === "blue"),
  };
  if (
    playersByTeam.amber.length !== 2 ||
    playersByTeam.blue.length !== 2
  ) {
    issues.push("captured player config did not preserve two ordered seats per team");
  }
  for (const round of capture.rounds) {
    const team =
      round.team === "amber" || round.team === "blue"
        ? round.team
        : null;
    const roundNumber = asNumber(round.roundNumber);
    if (!team || roundNumber === null) continue;
    const expectedCluegiver =
      playersByTeam[team][
        (roundNumber - 1) % playersByTeam[team].length
      ];
    if (
      !expectedCluegiver ||
      round.clueGiverId !== expectedCluegiver.id
    ) {
      issues.push(
        `round ${roundNumber} team ${team} cluegiver differs from the preregistered alternating seat schedule`,
      );
    }
  }
  const attemptsByLogId = new Map<
    unknown,
    Array<Record<string, unknown>>
  >();
  for (const attempt of capture.providerAttempts) {
    const linked = attemptsByLogId.get(attempt.aiCallLogId) ?? [];
    linked.push(attempt);
    attemptsByLogId.set(attempt.aiCallLogId, linked);
  }
  const arms = armByTeam(job);

  for (const call of capture.aiCallLogs) {
    const team =
      call.team === "amber" || call.team === "blue" ? call.team : null;
    const actorId = asString(call.actorId);
    const player = actorId ? playerById.get(actorId) : undefined;
    if (!team || !actorId || !player || player.team !== team) {
      issues.push(`AI call ${String(call.id)} lacks exact team/actor attribution`);
    }
    const roundNumber = asNumber(call.roundNumber);
    if (team && actorId && roundNumber !== null) {
      const orderedSeats = playersByTeam[team];
      const cluegiver =
        orderedSeats[(roundNumber - 1) % orderedSeats.length];
      const expectedActor =
        call.actionType === "generate_clues"
          ? cluegiver
          : call.actionType === "generate_guess"
            ? orderedSeats.find(
                (entry) => entry.id !== cluegiver?.id,
              )
            : call.actionType === "generate_interception"
              ? orderedSeats[0]
              : undefined;
      if (!expectedActor || actorId !== expectedActor.id) {
        issues.push(
          `AI call ${String(call.id)} actor differs from the preregistered 2v2 seat schedule`,
        );
      }
    }
    if (
      call.provider !== "openrouter" ||
      call.model !== EXACT_MODEL ||
      call.timedOut !== false ||
      call.usedFallback !== false ||
      call.error !== null ||
      call.parseQuality !== "clean" ||
      call.actionApplied !== true ||
      call.reasoningTrace !== null
    ) {
      issues.push(`AI call ${String(call.id)} violated strict result invariants`);
    }
    const validation = objectValue(call.validationMetadata);
    if (validation?.passed !== true) {
      issues.push(`AI call ${String(call.id)} lacks passing validation metadata`);
    }
    const prompt = asString(call.prompt) ?? "";
    if (prompt.includes(SCRATCH_NOTES_MARKER)) {
      issues.push(`AI call ${String(call.id)} included scratch notes`);
    }
    const linkedAttempts = attemptsByLogId.get(call.id) ?? [];
    if (linkedAttempts.length !== 1) {
      issues.push(
        `AI call ${String(call.id)} has ${linkedAttempts.length} linked provider attempts instead of exactly one`,
      );
    } else {
      const attempt = linkedAttempts[0]!;
      if (
        attempt.matchId !== call.matchId ||
        attempt.gameId !== call.gameId ||
        attempt.roundNumber !== call.roundNumber ||
        attempt.actionType !== call.actionType ||
        attempt.team !== team ||
        attempt.actorId !== actorId ||
        attempt.actionApplied !== true ||
        objectValue(attempt.validationMetadata)?.passed !== true
      ) {
        issues.push(
          `provider attempt ${String(attempt.id)} round/action/disposition/attribution differs from its AI call`,
        );
      }
      issues.push(...validateRouteMetadata(attempt));
      issues.push(
        ...verifyPrivateProviderReceipt(
          attempt.privateResponseReceipt,
        ).map(
          (issue) =>
            `provider attempt ${String(attempt.id)}: ${issue}`,
        ),
      );
    }

    if (call.actionType === "reflection") {
      issues.push("post-match reflection call occurred despite fixed disablement");
    }
    if (call.actionType === "generate_clues" && team) {
      const isTreatment = arms[team] === "treatment";
      const containsPolicy = prompt.includes(
        CIPHER_ENCRYPT_CANDIDATE_POLICY_ARTIFACT.instruction,
      );
      const containsLedger = prompt.includes(COLUMN_LEDGER_MARKER);
      if (isTreatment !== containsPolicy) {
        issues.push(
          `clue call ${String(call.id)} candidate-policy carrier differs from seating`,
        );
      }
      if (
        (isTreatment && roundNumber !== null && roundNumber >= 2) !==
        containsLedger
      ) {
        issues.push(
          `clue call ${String(call.id)} column-ledger timing differs from fixed treatment`,
        );
      }
      if (!hasCompiledCluegiverCarrier(prompt)) {
        issues.push(
          `clue call ${String(call.id)} did not use the exact compiled cluegiver carrier`,
        );
      }
      if (roundNumber === 1) {
        const proof = preregisteredRoundOnePromptProof(
          job,
          scheduleValue,
          team,
        );
        const expected = isTreatment
          ? proof.treatment
          : proof.baseline;
        if (
          prompt !== expected.fullPrompt ||
          prompt.length !== expected.charCount ||
          sha256Hex(prompt) !== expected.fullPromptSha256
        ) {
          issues.push(
            `clue call ${String(call.id)} round-one prompt bytes/hash differ from preregistration`,
          );
        }
      }
    } else {
      if (
        prompt.includes(
          CIPHER_ENCRYPT_CANDIDATE_POLICY_ARTIFACT.instruction,
        ) ||
        prompt.includes(COLUMN_LEDGER_MARKER)
      ) {
        issues.push(
          `non-clue call ${String(call.id)} received cluegiver-only treatment content`,
        );
      }
      const expectedRole =
        call.actionType === "generate_guess"
          ? "own_guesser"
          : call.actionType === "generate_interception"
            ? "interceptor"
            : null;
      if (
        expectedRole === null ||
        !hasExactCompiledNonClueCarrier(prompt, expectedRole)
      ) {
        issues.push(
          `non-clue call ${String(call.id)} did not use its exact compiled baseline carrier`,
        );
      }
    }
  }

  const callIds = new Set(capture.aiCallLogs.map((call) => call.id));
  const seenAttemptIds = new Set<number>();
  for (const attempt of capture.providerAttempts) {
    const attemptId = asNumber(attempt.id);
    if (attemptId === null || seenAttemptIds.has(attemptId)) {
      issues.push("provider attempt IDs are missing or duplicated");
    } else {
      seenAttemptIds.add(attemptId);
    }
    if (!callIds.has(attempt.aiCallLogId)) {
      issues.push(
        `provider attempt ${String(attempt.id)} links to no captured AI call`,
      );
    }
  }

  for (let round = 1; round <= scheduleValue.roundsPerMatch; round += 1) {
    for (const actionType of [
      "generate_clues",
      "generate_guess",
      "generate_interception",
    ]) {
      for (const team of ["amber", "blue"] as const) {
        const count = capture.aiCallLogs.filter(
          (call) =>
            call.roundNumber === round &&
            call.actionType === actionType &&
            call.team === team,
        ).length;
        if (count !== 1) {
          issues.push(
            `round ${round} team ${team} ${actionType} count was ${count}, expected exactly one`,
          );
        }
      }
    }
  }

  return [...new Set(issues)];
}

async function executeAndPersistJob(input: {
  outputDir: string;
  preregistrationContentHash: string;
  schedule: CandidatePolicyAbSchedule;
  job: MatchJob;
  executeMatch: (config: HeadlessMatchConfig) => Promise<HeadlessResultLike>;
  captureMatch: (matchId: number) => Promise<CapturedMatchData>;
  now?: () => Date;
}): Promise<CandidatePolicyAbMatchArtifact> {
  let executionResult: HeadlessResultLike | null = null;
  let error: unknown;
  try {
    executionResult = await input.executeMatch(input.job.config);
  } catch (caught) {
    error = caught;
  }

  const sanitizedError = error ? sanitizeError(error) : null;
  const matchId =
    executionResult?.matchId ?? sanitizedError?.matchId ?? null;
  let capture: CapturedMatchData | null = null;
  if (matchId !== null) {
    try {
      capture = await input.captureMatch(matchId);
    } catch (captureError) {
      if (!error) error = captureError;
    }
  }
  const finalError = error ? sanitizeError(error) : null;
  const issues = validateCapturedMatch(
    input.job,
    input.schedule,
    executionResult,
    capture,
  );
  if (finalError) {
    issues.unshift(`execution failed: ${finalError.message}`);
  }
  const status =
    finalError === null && issues.length === 0 ? "success" : "failure";
  const withoutHash = {
    artifactVersion: CANDIDATE_POLICY_AB_MATCH_ARTIFACT_VERSION,
    experimentVersion: CANDIDATE_POLICY_AB_EXPERIMENT_VERSION,
    preregistrationContentHash: input.preregistrationContentHash,
    settledAt: isoNow(input.now),
    job: input.job,
    armByTeam: armByTeam(input.job),
    status,
    matchId,
    executionResult:
      executionResult as unknown as Record<string, unknown> | null,
    error: finalError,
    capture,
    integrity: {
      valid: issues.length === 0,
      issues,
    },
  };
  const artifact = withContentHash(
    withoutHash as unknown as Record<string, unknown>,
    "artifactContentHash",
  ) as unknown as CandidatePolicyAbMatchArtifact;
  try {
    await writeSecureNoClobberJson(
      input.outputDir,
      input.job.artifactFile,
      artifact,
    );
    await verifyPersistedSelfHash(
      resolve(input.outputDir, input.job.artifactFile),
      "artifactContentHash",
      artifact as unknown as Record<string, unknown>,
    );
  } catch (persistError) {
    // The match itself already ran and was already paid for. Carry its id out
    // with the failure so the caller can re-read its operational evidence from
    // the disposable database instead of losing the whole match from the count.
    const surfaced =
      persistError instanceof Error
        ? persistError
        : new Error(String(persistError));
    if (
      matchId !== null &&
      (surfaced as { matchId?: unknown }).matchId === undefined
    ) {
      Object.assign(surfaced, { matchId });
    }
    throw surfaced;
  }
  return artifact;
}

function sourceVerification(
  before: CandidatePolicyAbSourceLineage,
  after: CandidatePolicyAbSourceLineage,
): {
  valid: boolean;
  mismatches: string[];
  lineage: CandidatePolicyAbSourceLineage;
} {
  const mismatches: string[] = [];
  if (after.gitCommitSha !== before.gitCommitSha) {
    mismatches.push("git commit changed during execution");
  }
  if (after.gitTreeSha !== before.gitTreeSha) {
    mismatches.push("git tree changed during execution");
  }
  if (after.sourceSetHash !== before.sourceSetHash) {
    mismatches.push("critical source set changed during execution");
  }
  if (after.runtimeIdentityHash !== before.runtimeIdentityHash) {
    mismatches.push("runtime identity changed during execution");
  }
  return {
    valid: mismatches.length === 0,
    mismatches,
    lineage: after,
  };
}

function nearestRank(values: number[], probability: number): number | null {
  if (values.length === 0) return null;
  const ordered = [...values].sort((left, right) => left - right);
  const index = Math.max(
    0,
    Math.min(
      ordered.length - 1,
      Math.ceil(probability * ordered.length) - 1,
    ),
  );
  return ordered[index]!;
}

function rate(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

function costFromCall(call: Record<string, unknown>): number | null {
  const metadata = objectValue(call.providerMetadata);
  const usage = objectValue(metadata?.usage);
  const reported = asNumber(usage?.costUsd) ?? asNumber(usage?.cost);
  if (reported !== null && reported >= 0) return reported;
  const estimated = asString(call.estimatedCostUsd);
  if (estimated === null) return null;
  const parsed = Number.parseFloat(estimated);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function emptyBehavioralWindow(
  roundScope: "2-4" | "1",
  interpretation: "primary" | "wrapper_only_diagnostic",
): BehavioralWindowSummary {
  return {
    roundScope,
    interpretation,
    teamGames: 0,
    teamRounds: 0,
    teammateDecodesCorrect: 0,
    miscommunications: 0,
    vulnerableInterceptions: 0,
    interceptionsMade: 0,
    decodeAccuracy: null,
    vulnerabilityRate: null,
    interceptionsMadeAccountingRate: null,
  };
}

function recordBehavioralRound(
  summary: BehavioralWindowSummary,
  ownRound: Record<string, unknown>,
  opponentRound: Record<string, unknown> | undefined,
): void {
  summary.teamRounds += 1;
  if (ownRound.ownCorrect === true) {
    summary.teammateDecodesCorrect += 1;
  } else {
    summary.miscommunications += 1;
  }
  if (ownRound.intercepted === true) {
    summary.vulnerableInterceptions += 1;
  }
  if (opponentRound?.intercepted === true) {
    summary.interceptionsMade += 1;
  }
}

function finalizeBehavioralWindow(
  summary: BehavioralWindowSummary,
): BehavioralWindowSummary {
  return {
    ...summary,
    decodeAccuracy: rate(
      summary.teammateDecodesCorrect,
      summary.teamRounds,
    ),
    vulnerabilityRate: rate(
      summary.vulnerableInterceptions,
      summary.teamRounds,
    ),
    interceptionsMadeAccountingRate: rate(
      summary.interceptionsMade,
      summary.teamRounds,
    ),
  };
}

function summarizeArmWindow(
  arm: "baseline" | "treatment",
  artifacts: CandidatePolicyAbMatchArtifact[],
  roundScope: "2-4" | "1",
): BehavioralWindowSummary {
  const summary = emptyBehavioralWindow(
    roundScope,
    roundScope === "2-4"
      ? "primary"
      : "wrapper_only_diagnostic",
  );

  for (const artifact of artifacts) {
    const capture = artifact.capture;
    if (!capture) continue;
    const teams = ["amber", "blue"] as const;
    const selectedTeams = teams.filter(
      (team) => artifact.armByTeam[team] === arm,
    );
    for (const team of selectedTeams) {
      summary.teamGames += 1;
      const ownRounds = capture.rounds.filter(
        (round) => round.team === team,
      );
      const opponentRounds = new Map(
        capture.rounds
          .filter((round) => round.team === oppositeTeam(team))
          .map((round) => [round.roundNumber, round]),
      );
      for (const round of ownRounds) {
        const roundNumber = asNumber(round.roundNumber);
        const opponentRound = opponentRounds.get(round.roundNumber);
        const included =
          roundScope === "1"
            ? roundNumber === 1
            : roundNumber !== null &&
              roundNumber >= PRIMARY_ROUND_WINDOW.firstRound &&
              roundNumber <= PRIMARY_ROUND_WINDOW.lastRound;
        if (included) {
          recordBehavioralRound(summary, round, opponentRound);
        }
      }
    }
  }
  return finalizeBehavioralWindow(summary);
}

/**
 * `oppositeArm` is required, not optional: the reciprocal view is defined only
 * relative to the other arm of the same window, and taking it from there is
 * what makes it an alias rather than a parallel measurement.
 */
function behavioralRates(
  summary: BehavioralWindowSummary,
  oppositeArm: BehavioralWindowSummary,
): BehavioralRateSet {
  return {
    decodeAccuracy: summary.decodeAccuracy,
    miscommunicationRate: rate(
      summary.miscommunications,
      summary.teamRounds,
    ),
    vulnerabilityRate: summary.vulnerabilityRate,
    opponentArmVulnerabilityRateAlias: oppositeArm.vulnerabilityRate,
  };
}

function reciprocalAliasIdentity(
  baseline: BehavioralWindowSummary,
  treatment: BehavioralWindowSummary,
): ReciprocalAliasIdentity {
  return {
    claim:
      "arm_interceptions_made_equals_opposite_arm_vulnerable_interceptions",
    independentEstimand: false,
    baselineInterceptionsMade: baseline.interceptionsMade,
    treatmentVulnerableInterceptions:
      treatment.vulnerableInterceptions,
    treatmentInterceptionsMade: treatment.interceptionsMade,
    baselineVulnerableInterceptions:
      baseline.vulnerableInterceptions,
    holdsExactly:
      baseline.interceptionsMade ===
        treatment.vulnerableInterceptions &&
      treatment.interceptionsMade ===
        baseline.vulnerableInterceptions,
  };
}

function difference(
  treatment: number | null,
  baseline: number | null,
): number | null {
  return treatment === null || baseline === null
    ? null
    : treatment - baseline;
}

function contrastRates(
  treatment: BehavioralRateSet,
  baseline: BehavioralRateSet,
): BehavioralRateSet {
  return {
    decodeAccuracy: difference(
      treatment.decodeAccuracy,
      baseline.decodeAccuracy,
    ),
    miscommunicationRate: difference(
      treatment.miscommunicationRate,
      baseline.miscommunicationRate,
    ),
    vulnerabilityRate: difference(
      treatment.vulnerabilityRate,
      baseline.vulnerabilityRate,
    ),
    // Exactly the negation of the vulnerability contrast above, because each
    // arm's alias is the other arm's vulnerability rate. Retained so the
    // algebraic redundancy is visible in the output rather than implied.
    opponentArmVulnerabilityRateAlias: difference(
      treatment.opponentArmVulnerabilityRateAlias,
      baseline.opponentArmVulnerabilityRateAlias,
    ),
  };
}

function meanComplete(values: Array<number | null>): number | null {
  if (
    values.length === 0 ||
    values.some((value) => value === null)
  ) {
    return null;
  }
  return (
    (values as number[]).reduce((sum, value) => sum + value, 0) /
    values.length
  );
}

function meanRates(values: BehavioralRateSet[]): BehavioralRateSet {
  return {
    decodeAccuracy: meanComplete(
      values.map((value) => value.decodeAccuracy),
    ),
    miscommunicationRate: meanComplete(
      values.map((value) => value.miscommunicationRate),
    ),
    vulnerabilityRate: meanComplete(
      values.map((value) => value.vulnerabilityRate),
    ),
    opponentArmVulnerabilityRateAlias: meanComplete(
      values.map(
        (value) => value.opponentArmVulnerabilityRateAlias,
      ),
    ),
  };
}

export function aggregateBehavioralSeedBlocks(
  scheduleValue: CandidatePolicyAbSchedule,
  artifacts: CandidatePolicyAbMatchArtifact[],
  roundScope: "2-4" | "1",
): BehavioralBlockAnalysis {
  assertPrimaryRoundWindowMatchesSchedule(scheduleValue);
  const blocks = scheduleValue.seeds.map((seed, index) => {
    const blockOrdinal = index + 1;
    const blockArtifacts = artifacts.filter(
      (artifact) => artifact.job.blockOrdinal === blockOrdinal,
    );
    if (blockArtifacts.length !== 2) {
      throw new Error(
        `behavioral seed block ${blockOrdinal} lacked its two mirrored artifacts`,
      );
    }
    blockArtifacts.sort(
      (left, right) => left.job.ordinal - right.job.ordinal,
    );
    const mirrors = blockArtifacts.map((artifact) => {
      const baseline = summarizeArmWindow(
        "baseline",
        [artifact],
        roundScope,
      );
      const treatment = summarizeArmWindow(
        "treatment",
        [artifact],
        roundScope,
      );
      return {
        artifactOrdinal: artifact.job.ordinal,
        mirror: artifact.job.mirror,
        treatmentTeam: artifact.job.treatmentTeam,
        baselineTeam: artifact.job.controlTeam,
        arms: { baseline, treatment },
        reciprocalAliasIdentity: reciprocalAliasIdentity(
          baseline,
          treatment,
        ),
        treatmentMinusBaseline: contrastRates(
          behavioralRates(treatment, baseline),
          behavioralRates(baseline, treatment),
        ),
      };
    }) as BehavioralSeedBlockSummary["mirrors"];
    const baseline = summarizeArmWindow(
      "baseline",
      blockArtifacts,
      roundScope,
    );
    const treatment = summarizeArmWindow(
      "treatment",
      blockArtifacts,
      roundScope,
    );
    return {
      analysisUnit: "paired_seed_block" as const,
      blockOrdinal,
      seed,
      mirroredMatches: 2 as const,
      roundScope,
      roundsNestedWithinTeamGames: true as const,
      mirrors,
      arms: { baseline, treatment },
      reciprocalAliasIdentity: reciprocalAliasIdentity(
        baseline,
        treatment,
      ),
      treatmentMinusBaseline: meanRates(
        mirrors.map((mirror) => mirror.treatmentMinusBaseline),
      ),
    };
  });
  return {
    roundScope,
    interpretation:
      roundScope === "2-4"
        ? ("primary" as const)
        : ("wrapper_only_diagnostic" as const),
    blocks,
    aggregate: {
      analysisUnit: "paired_seed_block" as const,
      seedBlocks: blocks.length,
      equalWeightPerSeedBlock: true as const,
      teamRoundsAreNotIndependentReplicates: true as const,
      armBlockMeanRates: {
        baseline: meanRates(
          blocks.map((block) =>
            behavioralRates(
              block.arms.baseline,
              block.arms.treatment,
            ),
          ),
        ),
        treatment: meanRates(
          blocks.map((block) =>
            behavioralRates(
              block.arms.treatment,
              block.arms.baseline,
            ),
          ),
        ),
      },
      meanWithinBlockTreatmentMinusBaseline: meanRates(
        blocks.map((block) => block.treatmentMinusBaseline),
      ),
    },
  };
}

function numericDistribution(
  values: number[],
  total: number = values.length,
): NumericDistribution {
  return {
    observed: values.length,
    unknown: Math.max(0, total - values.length),
    min: values.length > 0 ? Math.min(...values) : null,
    median: nearestRank(values, 0.5),
    p95NearestRank: nearestRank(values, 0.95),
    max: values.length > 0 ? Math.max(...values) : null,
  };
}

function completionTokenDistribution(
  values: number[],
  totalCalls: number,
): CompletionTokenDistribution {
  const distribution = numericDistribution(values, totalCalls);
  return {
    ...distribution,
    configuredLimitPerCall: EXACT_COMPLETION_TOKEN_LIMIT,
    unknownCalls: Math.max(0, totalCalls - values.length),
    minimumObservedHeadroomTokens:
      distribution.max === null
        ? null
        : EXACT_COMPLETION_TOKEN_LIMIT - distribution.max,
    p95ObservedHeadroomTokens:
      distribution.p95NearestRank === null
        ? null
        : EXACT_COMPLETION_TOKEN_LIMIT -
          distribution.p95NearestRank,
    maximumObservedUtilizationRate:
      distribution.max === null
        ? null
        : distribution.max / EXACT_COMPLETION_TOKEN_LIMIT,
    callsAtOrAbove90PercentOfLimit: values.filter(
      (value) => value >= EXACT_COMPLETION_TOKEN_LIMIT * 0.9,
    ).length,
  };
}

function emptyClueLegalityFunnel(): ClueLegalityFunnel {
  return {
    clueCalls: 0,
    validatedCalls: 0,
    passedCalls: 0,
    failedCalls: 0,
    appliedDespiteFailedValidation: 0,
    rejectedFailedValidation: 0,
    missingValidationMetadata: 0,
    problemCounts: {},
  };
}

function recordClueLegality(
  funnel: ClueLegalityFunnel,
  call: Record<string, unknown>,
): void {
  funnel.clueCalls += 1;
  const validation = objectValue(call.validationMetadata);
  if (
    validation?.validator !==
    "shared.validateClueSubmission@substrate"
  ) {
    funnel.missingValidationMetadata += 1;
    return;
  }
  funnel.validatedCalls += 1;
  if (validation.passed === true) {
    funnel.passedCalls += 1;
    return;
  }
  funnel.failedCalls += 1;
  if (call.actionApplied === true) {
    funnel.appliedDespiteFailedValidation += 1;
  } else {
    funnel.rejectedFailedValidation += 1;
  }
  const problems = Array.isArray(validation.problems)
    ? validation.problems.filter(
        (problem): problem is string => typeof problem === "string",
      )
    : ["missing validator problem detail"];
  for (const problem of problems) {
    funnel.problemCounts[problem] =
      (funnel.problemCounts[problem] ?? 0) + 1;
  }
}

interface OperationalAccumulator {
  latencies: number[];
  completionTokens: number[];
  completionByAction: Map<string, { calls: number; values: number[] }>;
  completionByArm: Record<
    "baseline" | "treatment",
    { calls: number; values: number[] }
  >;
  clueLegality: ClueLegalityFunnel;
  clueByArmAndRound: OperationalRollup["clueLegality"]["byArmAndRound"];
  providerAttemptState: OperationalCallEvidence["providerAttemptState"];
  actionDisposition: OperationalCallEvidence["actionDisposition"];
  routeFailureIssues: string[];
  routeExactPasses: number;
  providerCalls: number;
  aiCallRecords: number;
  costSumUsd: number;
  knownCostCalls: number;
  unknownCostCalls: number;
  unlinkedProviderAttempts: number;
  linkedProviderAttemptReceipts: number;
  receipts: PrivateReceiptCounts;
}

/**
 * One accountable match's paid-call evidence. `capture` is always the full
 * in-memory capture including exact bodies, because receipt lineage can only be
 * verified against them; only what is written out is projected.
 */
interface OperationalSource {
  label: string;
  armByTeam: {
    amber: "baseline" | "treatment";
    blue: "baseline" | "treatment";
  };
  capture: CapturedMatchData | null;
}

function newOperationalAccumulator(): OperationalAccumulator {
  return {
    latencies: [],
    completionTokens: [],
    completionByAction: new Map(),
    completionByArm: {
      baseline: { calls: 0, values: [] },
      treatment: { calls: 0, values: [] },
    },
    clueLegality: emptyClueLegalityFunnel(),
    clueByArmAndRound: { baseline: {}, treatment: {} },
    providerAttemptState: {
      succeeded: 0,
      failed: 0,
      timedOut: 0,
      other: 0,
    },
    actionDisposition: { applied: 0, rejected: 0, unknown: 0 },
    routeFailureIssues: [],
    routeExactPasses: 0,
    providerCalls: 0,
    aiCallRecords: 0,
    costSumUsd: 0,
    knownCostCalls: 0,
    unknownCostCalls: 0,
    unlinkedProviderAttempts: 0,
    linkedProviderAttemptReceipts: 0,
    receipts: {
      receiptRows: 0,
      exactBodiesStored: 0,
      exactBodyUtf8Bytes: 0,
      hiddenReasoningPresentAndStored: 0,
      explicitReasoningAbsent: 0,
      uninspectableInvalidJson: 0,
      bodyUnavailableOrNotStored: 0,
      lineageFailures: 0,
    },
  };
}

function accumulateOperationalSource(
  accumulator: OperationalAccumulator,
  source: OperationalSource,
): void {
  const {
    completionByAction,
    completionByArm,
    clueLegality,
    clueByArmAndRound,
    providerAttemptState,
    actionDisposition,
  } = accumulator;
  const capture = source.capture;
  if (!capture) return;
  {
    const callIds = new Set(capture.aiCallLogs.map((call) => call.id));
    accumulator.aiCallRecords += capture.aiCallLogs.length;
    for (const call of capture.aiCallLogs) {
      const latency = asNumber(call.latencyMs);
      if (latency !== null && latency >= 0) {
        accumulator.latencies.push(latency);
      }

      const actionType = asString(call.actionType) ?? "unknown";
      const actionSlice = completionByAction.get(actionType) ?? {
        calls: 0,
        values: [],
      };
      actionSlice.calls += 1;
      completionByAction.set(actionType, actionSlice);
      const team =
        call.team === "amber" || call.team === "blue"
          ? call.team
          : null;
      const arm = team ? source.armByTeam[team] : null;
      if (arm) completionByArm[arm].calls += 1;

      const completion = asNumber(call.completionTokens);
      if (completion !== null && completion >= 0) {
        accumulator.completionTokens.push(completion);
        actionSlice.values.push(completion);
        if (arm) completionByArm[arm].values.push(completion);
      }

      const cost = costFromCall(call);
      if (cost === null) {
        accumulator.unknownCostCalls += 1;
      } else {
        accumulator.knownCostCalls += 1;
        accumulator.costSumUsd += cost;
      }

      if (actionType === "generate_clues") {
        recordClueLegality(clueLegality, call);
        if (arm) {
          const roundKey = String(call.roundNumber);
          const funnel =
            clueByArmAndRound[arm][roundKey] ??
            emptyClueLegalityFunnel();
          recordClueLegality(funnel, call);
          clueByArmAndRound[arm][roundKey] = funnel;
        }
      }
    }

    accumulator.providerCalls += capture.providerAttempts.length;
    for (const attempt of capture.providerAttempts) {
      const receipts = accumulator.receipts;
      const receiptIssues = verifyPrivateProviderReceipt(
        attempt.privateResponseReceipt,
      );
      if (receiptIssues.length > 0) {
        receipts.lineageFailures += 1;
      } else {
        const receipt =
          attempt.privateResponseReceipt as PrivateProviderResponseReceipt;
        receipts.receiptRows += 1;
        if (
          receipt.responseBody.storage === "stored_exact" &&
          receipt.responseBody.utf8Bytes !== null
        ) {
          receipts.exactBodiesStored += 1;
          receipts.exactBodyUtf8Bytes +=
            receipt.responseBody.utf8Bytes;
        } else {
          receipts.bodyUnavailableOrNotStored += 1;
        }
        if (receipt.reasoning.presence === "present") {
          receipts.hiddenReasoningPresentAndStored += 1;
        } else if (receipt.reasoning.presence === "absent") {
          receipts.explicitReasoningAbsent += 1;
        } else if (
          receipt.reasoning.presence ===
          "uninspectable_invalid_json"
        ) {
          receipts.uninspectableInvalidJson += 1;
        }
      }
      if (!callIds.has(attempt.aiCallLogId)) {
        accumulator.unlinkedProviderAttempts += 1;
      } else {
        accumulator.linkedProviderAttemptReceipts += 1;
      }
      if (attempt.status === "succeeded") {
        providerAttemptState.succeeded += 1;
      } else if (attempt.status === "failed") {
        providerAttemptState.failed += 1;
      } else if (attempt.status === "timed_out") {
        providerAttemptState.timedOut += 1;
      } else {
        providerAttemptState.other += 1;
      }
      if (attempt.actionApplied === true) {
        actionDisposition.applied += 1;
      } else if (attempt.actionApplied === false) {
        actionDisposition.rejected += 1;
      } else {
        actionDisposition.unknown += 1;
      }
      const issues = validateRouteMetadata(attempt);
      if (issues.length === 0) {
        accumulator.routeExactPasses += 1;
      } else {
        accumulator.routeFailureIssues.push(
          ...issues.map(
            (issue) =>
              `${source.label} attempt ${String(attempt.id)}: ${issue}`,
          ),
        );
      }
    }
  }
}

/**
 * Collapses one accumulator into the shared paid-call evidence shape. Calls
 * without an AI-call record still count as unknown-cost subjects, so the
 * denominator never quietly shrinks to the rows that happened to survive.
 */
function summarizeOperationalAccumulator(
  accumulator: OperationalAccumulator,
): OperationalCallEvidence {
  const operationalCallSubjects = Math.max(
    accumulator.aiCallRecords,
    accumulator.providerCalls,
  );
  return {
    providerCalls: accumulator.providerCalls,
    aiCallRecords: accumulator.aiCallRecords,
    linkedProviderAttemptReceipts:
      accumulator.linkedProviderAttemptReceipts,
    unlinkedProviderAttempts: accumulator.unlinkedProviderAttempts,
    latencyMs: numericDistribution(
      accumulator.latencies,
      operationalCallSubjects,
    ),
    completionTokens: completionTokenDistribution(
      accumulator.completionTokens,
      operationalCallSubjects,
    ),
    cost: {
      knownCostCalls: accumulator.knownCostCalls,
      unknownCostCalls:
        accumulator.unknownCostCalls +
        Math.max(
          0,
          accumulator.providerCalls - accumulator.aiCallRecords,
        ),
      sumUsd: accumulator.costSumUsd,
    },
    providerAttemptState: accumulator.providerAttemptState,
    actionDisposition: accumulator.actionDisposition,
    routeProof: {
      exactPasses: accumulator.routeExactPasses,
      failures:
        accumulator.providerCalls - accumulator.routeExactPasses,
      failureIssues: accumulator.routeFailureIssues,
    },
    privatePaidCallReceipts: accumulator.receipts,
  };
}

function recoveredOperationalEvidence(
  source: OperationalSource,
): OperationalCallEvidence {
  const accumulator = newOperationalAccumulator();
  accumulateOperationalSource(accumulator, source);
  return summarizeOperationalAccumulator(accumulator);
}

function operationalRollup(
  scheduleValue: CandidatePolicyAbSchedule,
  artifacts: CandidatePolicyAbMatchArtifact[],
  recoveredSources: OperationalSource[],
  startedMatches: number,
  artifactPersistenceFailures: ArtifactPersistenceFailure[],
  postRunSourceVerification: ReturnType<typeof sourceVerification>,
): OperationalRollup {
  const accumulator = newOperationalAccumulator();
  for (const artifact of artifacts) {
    accumulateOperationalSource(accumulator, {
      label: `match-job ${artifact.job.ordinal}`,
      armByTeam: artifact.armByTeam,
      capture: artifact.capture,
    });
  }
  // A launched match whose artifact could not be written was still paid for.
  // Its database-recovered evidence joins the same totals so the paid-call
  // denominator matches what was actually dispatched. The recovered capture
  // exists only here, in memory; nothing derived from it carries exact bytes.
  for (const source of recoveredSources) {
    accumulateOperationalSource(accumulator, source);
  }
  const {
    completionByAction,
    completionByArm,
    clueLegality,
    clueByArmAndRound,
  } = accumulator;
  const evidence = summarizeOperationalAccumulator(accumulator);
  const exactPrivateBodyUtf8Bytes =
    evidence.privatePaidCallReceipts.exactBodyUtf8Bytes;
  const recoveredMatches = artifactPersistenceFailures.filter(
    (failure) =>
      failure.recoveredOperationalSummary.status === "recovered",
  ).length;
  return {
    ...evidence,
    scope:
      "all_started_matches_including_failed_and_integrity_invalid",
    plannedProviderCalls: scheduleValue.plannedProviderCalls,
    jobs: {
      planned: scheduleValue.plannedMatches,
      launched: startedMatches,
      persistedArtifacts: artifacts.length,
      unpersistedMatchesRecoveredFromDatabase: recoveredMatches,
      unpersistedMatchesNotRecoverable:
        artifactPersistenceFailures.length - recoveredMatches,
    },
    expectedProviderCallsForStartedMatches:
      startedMatches *
      scheduleValue.roundsPerMatch *
      CALLS_PER_MATCH_ROUND,
    missingProviderAttemptsAgainstStartedMatches: Math.max(
      0,
      startedMatches *
        scheduleValue.roundsPerMatch *
        CALLS_PER_MATCH_ROUND -
        evidence.providerCalls,
    ),
    completionTokens: {
      ...evidence.completionTokens,
      byAction: Object.fromEntries(
        [...completionByAction.entries()].map(
          ([actionType, slice]) => [
            actionType,
            completionTokenDistribution(
              slice.values,
              slice.calls,
            ),
          ],
        ),
      ),
      byArm: {
        baseline: completionTokenDistribution(
          completionByArm.baseline.values,
          completionByArm.baseline.calls,
        ),
        treatment: completionTokenDistribution(
          completionByArm.treatment.values,
          completionByArm.treatment.calls,
        ),
      },
    },
    privatePaidCallReceipts: {
      ...evidence.privatePaidCallReceipts,
      materialization: {
        databaseCopiesPerStoredBody: 1,
        perMatchArtifactCopiesPerStoredBody: 1,
        aggregateReportCopiesPerStoredBody: 0,
        totalMaterializedCopiesPerStoredBody: 2,
        minimumUnescapedUtf8BytesAcrossCopies:
          exactPrivateBodyUtf8Bytes * 2,
        qualification:
          "Minimum unescaped response-body bytes only. PostgreSQL JSONB/TOAST and JSON escaping/structure overhead are not estimated. Exact bodies are operator-private in exactly two places: the disposable database row and the 0600 per-match artifact. The aggregate report carries their SHA-256, UTF-8 length, and reasoning presence but never their bytes; no gameplay route or tracked evidence file includes them either.",
      },
    },
    clueLegality: {
      ...clueLegality,
      failedValidationRate: rate(
        clueLegality.failedCalls,
        clueLegality.validatedCalls,
      ),
      byArmAndRound: clueByArmAndRound,
    },
    failureState: {
      failedMatchArtifacts: artifacts.filter(
        (artifact) => artifact.status === "failure",
      ).length,
      integrityInvalidArtifacts: artifacts.filter(
        (artifact) => !artifact.integrity.valid,
      ).length,
      artifactPersistenceFailures:
        artifactPersistenceFailures.length,
      postRunSourceVerificationValid:
        postRunSourceVerification.valid,
    },
  };
}

/**
 * Strip the exact response bytes from one receipt while keeping every field an
 * auditor needs to bind the aggregate row to its authoritative copies. A
 * receipt whose shape is not recognised is replaced outright rather than passed
 * through, so a malformed row cannot smuggle bytes into the aggregate.
 */
function aggregateReceiptProjection(raw: unknown): unknown {
  if (raw === null || raw === undefined) return null;
  const receipt = objectValue(raw);
  const body = objectValue(receipt?.responseBody);
  const reasoning = objectValue(receipt?.reasoning);
  if (!receipt || !body || !reasoning) {
    return {
      aggregateProjection: "unrecognized_receipt_shape_removed",
      textIncludedInThisAggregate: false,
    };
  }
  return {
    version: receipt.version,
    storageClass: receipt.storageClass,
    source: receipt.source,
    exactBytesLocation:
      "provider_attempts_row_and_per_match_private_artifact_only",
    responseBody: {
      storage: body.storage,
      textPresentInAuthoritativeCopies: typeof body.text === "string",
      textIncludedInThisAggregate: false,
      sha256: asString(body.sha256),
      utf8Bytes: asNumber(body.utf8Bytes),
    },
    reasoning: {
      presence: reasoning.presence,
      storage: reasoning.storage,
      // Field *names* such as `choices[0].message.reasoning`, never their values.
      providerFields: Array.isArray(reasoning.providerFields)
        ? reasoning.providerFields.filter(
            (field): field is string => typeof field === "string",
          )
        : [],
      sha256: asString(reasoning.sha256),
      utf8Bytes: asNumber(reasoning.utf8Bytes),
      reasoningTokens: asNumber(reasoning.reasoningTokens),
    },
    exactResponseBodyStored: receipt.exactResponseBodyStored === true,
    hiddenReasoningStored: receipt.hiddenReasoningStored === true,
    receiptContentSha256: asString(receipt.receiptContentSha256),
  } satisfies Record<string, unknown>;
}

function aggregateCapture(
  capture: CapturedMatchData | null,
): AggregateCapturedMatchData | null {
  if (!capture) return null;
  return {
    match: capture.match,
    rounds: capture.rounds,
    aiCallLogs: capture.aiCallLogs,
    // Every attempt row survives so the paid-call denominator is unchanged;
    // only the receipt's exact bytes are projected away.
    providerAttempts: capture.providerAttempts.map((attempt) => ({
      ...attempt,
      privateResponseReceipt: aggregateReceiptProjection(
        attempt.privateResponseReceipt,
      ),
    })),
    teamChatter: capture.teamChatter,
  };
}

function aggregateMatchEntry(
  artifact: CandidatePolicyAbMatchArtifact,
): CandidatePolicyAbAggregateMatchEntry {
  const receiptsHoldingBodies = (
    artifact.capture?.providerAttempts ?? []
  ).some((attempt) => {
    const body = objectValue(
      objectValue(attempt.privateResponseReceipt)?.responseBody,
    );
    return typeof body?.text === "string";
  });
  return {
    artifactVersion: artifact.artifactVersion,
    experimentVersion: artifact.experimentVersion,
    aggregateProjection: "exact_provider_response_bodies_removed",
    preregistrationContentHash: artifact.preregistrationContentHash,
    settledAt: artifact.settledAt,
    job: artifact.job,
    armByTeam: artifact.armByTeam,
    status: artifact.status,
    matchId: artifact.matchId,
    executionResult: artifact.executionResult,
    error: artifact.error,
    capture: aggregateCapture(artifact.capture),
    integrity: artifact.integrity,
    privateArtifact: {
      relativePath: artifact.job.artifactFile,
      mode: "0600",
      artifactContentHash: artifact.artifactContentHash,
      holdsExactProviderResponseBodies: receiptsHoldingBodies,
    },
  };
}

function report(
  scheduleValue: CandidatePolicyAbSchedule,
  preregistrationValue: CandidatePolicyAbPreregistration,
  artifacts: CandidatePolicyAbMatchArtifact[],
  recoveredSources: OperationalSource[],
  startedMatches: number,
  artifactPersistenceFailures: ArtifactPersistenceFailure[],
  stoppedAfterBlock: number | null,
  postRunSourceVerification: ReturnType<typeof sourceVerification>,
  now?: () => Date,
): CandidatePolicyAbReport {
  const validArtifacts = artifacts.filter(
    (artifact) =>
      artifact.status === "success" && artifact.integrity.valid,
  );
  const complete =
    startedMatches === scheduleValue.plannedMatches &&
    artifacts.length === scheduleValue.plannedMatches &&
    artifactPersistenceFailures.length === 0 &&
    validArtifacts.length === scheduleValue.plannedMatches &&
    postRunSourceVerification.valid;
  const behavioralStatus = !scheduleValue.behaviorIncluded
    ? "excluded_mechanism_canary"
    : complete
      ? "complete_descriptive_unreleasable_protocol_mismatch"
      : "suppressed_incomplete";
  const primary =
    behavioralStatus ===
    "complete_descriptive_unreleasable_protocol_mismatch"
      ? aggregateBehavioralSeedBlocks(
          scheduleValue,
          validArtifacts,
          "2-4",
        )
      : null;
  const roundOneAnalysis =
    behavioralStatus ===
    "complete_descriptive_unreleasable_protocol_mismatch"
      ? aggregateBehavioralSeedBlocks(
          scheduleValue,
          validArtifacts,
          "1",
        )
      : null;
  const withoutHash = {
    reportVersion: CANDIDATE_POLICY_AB_REPORT_VERSION,
    experimentVersion: CANDIDATE_POLICY_AB_EXPERIMENT_VERSION,
    generatedAt: isoNow(now),
    schedule: scheduleValue,
    status: complete ? ("complete" as const) : ("incomplete" as const),
    releaseBoundary:
      "blocked_table_protocol_and_prompt_parity" as const,
    tableBotBuildLicenseEligible: false as const,
    preregistrationContentHash:
      preregistrationValue.preregistrationContentHash,
    plannedMatches: scheduleValue.plannedMatches,
    startedMatches,
    validMatches: validArtifacts.length,
    failedMatches:
      artifacts.length -
      validArtifacts.length +
      artifactPersistenceFailures.length,
    stoppedAfterBlock,
    artifactPersistenceFailures,
    matchArtifactFiles: artifacts.map(
      (artifact) => artifact.job.artifactFile,
    ),
    privateEvidenceBoundary: {
      exactProviderResponseBodies:
        "disposable_database_and_per_match_private_artifact_only" as const,
      aggregateCarriesBodyOrReasoningText: false as const,
      aggregateCarriesLineageAndAccounting: true as const,
    },
    matchArtifacts: artifacts.map(aggregateMatchEntry),
    postRunSourceVerification,
    behavioralResults: {
      status: behavioralStatus,
      qualification:
        behavioralStatus === "excluded_mechanism_canary"
          ? "Mechanism canary excluded from behavior by preregistration."
          : behavioralStatus === "suppressed_incomplete"
            ? "Behavioral comparison suppressed because the complete paired schedule and all integrity proofs were not present."
            : `${scheduleValue.inferenceQualification} These within-Herpetarium descriptive results are explicitly unreleasable under the known protocol and prompt-assignment mismatch and cannot license a Table BotBuild.`,
      primaryRounds: "2-4" as const,
      primary,
      roundOne: {
        rounds: "1" as const,
        interpretation: "wrapper_only_diagnostic" as const,
        qualification:
          "Round 1 is reported separately because the treatment differs only through the candidate-policy authority wrapper; the public column ledger does not yet exist. Round-1 outcomes are never pooled into the rounds 2-4 primary estimates.",
        analysis: roundOneAnalysis,
      },
    },
    operationalResults: operationalRollup(
      scheduleValue,
      artifacts,
      recoveredSources,
      startedMatches,
      artifactPersistenceFailures,
      postRunSourceVerification,
    ),
  };
  return withContentHash(
    withoutHash as unknown as Record<string, unknown>,
    "reportContentHash",
  ) as unknown as CandidatePolicyAbReport;
}

/**
 * Re-reads a launched match from the disposable database after its private
 * artifact failed to persist. This is a read, not a retry: no provider call is
 * made, the match is not re-run or replaced, its artifact stays absent, and the
 * run stays incomplete with behavior suppressed. The only thing recovered is
 * the operational accounting, so a paid attempt is never silently uncounted.
 */
async function recoverUnpersistedMatchEvidence(input: {
  job: MatchJob;
  matchId: number | null;
  captureMatch: (matchId: number) => Promise<CapturedMatchData>;
}): Promise<{
  summary: RecoveredOperationalSummary;
  source: OperationalSource | null;
}> {
  const unrecovered = (
    unavailableReason: SanitizedExperimentError,
  ): {
    summary: RecoveredOperationalSummary;
    source: null;
  } => ({
    summary: {
      source:
        "disposable_database_requery_after_artifact_persistence_failure",
      status: "unavailable",
      matchId: input.matchId,
      exactProviderResponseBodiesIncluded: false,
      behavioralUse:
        "excluded_match_remains_unpersisted_and_suppressing",
      unavailableReason,
      evidence: null,
    },
    source: null,
  });

  if (input.matchId === null) {
    return unrecovered({
      name: "UnrecoverableMatchEvidence",
      message:
        "artifact persistence failed before any durable match id was observed",
      code: null,
      matchId: null,
      providerMetadata: null,
    });
  }
  let capture: CapturedMatchData;
  try {
    capture = await input.captureMatch(input.matchId);
  } catch (error) {
    return unrecovered(sanitizeError(error));
  }
  const source: OperationalSource = {
    label: `match-job ${input.job.ordinal} (unpersisted, database-recovered)`,
    armByTeam: armByTeam(input.job),
    capture,
  };
  return {
    summary: {
      source:
        "disposable_database_requery_after_artifact_persistence_failure",
      status: "recovered",
      matchId: input.matchId,
      exactProviderResponseBodiesIncluded: false,
      behavioralUse:
        "excluded_match_remains_unpersisted_and_suppressing",
      unavailableReason: null,
      evidence: recoveredOperationalEvidence(source),
    },
    source,
  };
}

export async function runCandidatePolicyAbExperiment(
  options: CandidatePolicyAbRunOptions,
): Promise<CandidatePolicyAbReport> {
  assertExactModelConfig();
  const scheduleValue = CANDIDATE_POLICY_AB_SCHEDULES[options.schedule];
  if (!scheduleValue) {
    throw new Error(`unknown fixed schedule: ${String(options.schedule)}`);
  }
  const dependencies = options.dependencies ?? {};
  const collectSource =
    dependencies.collectSourceLineage ??
    collectCandidatePolicyAbSourceLineage;
  const collectPostSource =
    dependencies.collectPostRunSourceLineage ?? collectSource;
  const inspectDatabase =
    dependencies.inspectDatabase ?? inspectDisposableLocalDatabase;
  const executeMatch =
    dependencies.executeMatch ?? defaultExecuteMatch;
  const captureMatch =
    dependencies.captureMatch ?? defaultCaptureMatch;
  const closeDatabase =
    dependencies.closeDatabase ?? defaultCloseDatabase;

  const jobs = candidatePolicyAbJobs(scheduleValue);
  const sourceLineage = await collectSource();
  const databaseLineage = await inspectDatabase();
  const outputDir = await prepareNewSecureOutputDirectory(
    options.outputDir,
  );
  const preregistrationValue = preregistration(
    scheduleValue,
    jobs,
    sourceLineage,
    databaseLineage,
    dependencies.now,
  );
  const preregistrationPath = resolve(
    outputDir,
    "preregistration.json",
  );
  await writeSecureNoClobberJson(
    outputDir,
    "preregistration.json",
    preregistrationValue,
  );
  await verifyPersistedSelfHash(
    preregistrationPath,
    "preregistrationContentHash",
    preregistrationValue as unknown as Record<string, unknown>,
  );
  await dependencies.afterPreregistrationWritten?.(
    preregistrationPath,
    preregistrationValue,
  );

  const artifacts: CandidatePolicyAbMatchArtifact[] = [];
  const artifactPersistenceFailures: ArtifactPersistenceFailure[] = [];
  // Full captures for launched-but-unpersisted matches. In-memory only: they
  // feed the operational rollup and are never serialized anywhere.
  const recoveredSources: OperationalSource[] = [];
  let stoppedAfterBlock: number | null = null;
  let launchedMatches = 0;
  let executionStarted = false;
  try {
    for (
      let blockOrdinal = 1;
      blockOrdinal <= scheduleValue.plannedSeedBlocks;
      blockOrdinal += 1
    ) {
      const pair = jobs.filter(
        (job) => job.blockOrdinal === blockOrdinal,
      );
      if (pair.length !== PAIR_CONCURRENCY) {
        throw new Error(
          `seed block ${blockOrdinal} does not contain exactly two mirrored matches`,
        );
      }
      executionStarted = true;
      launchedMatches += pair.length;
      const settlements = await Promise.allSettled(
        pair.map((job) =>
          executeAndPersistJob({
            outputDir,
            preregistrationContentHash:
              preregistrationValue.preregistrationContentHash,
            schedule: scheduleValue,
            job,
            executeMatch,
            captureMatch,
            now: dependencies.now,
          }),
        ),
      );

      let pairFailed = false;
      for (const [index, settlement] of settlements.entries()) {
        if (settlement.status === "fulfilled") {
          const artifact = settlement.value;
          artifacts.push(artifact);
          dependencies.emitProgress?.({
            blockOrdinal,
            ordinal: artifact.job.ordinal,
            status: artifact.status,
            matchId: artifact.matchId,
          });
          if (artifact.status === "failure") pairFailed = true;
        } else {
          pairFailed = true;
          const job = pair[index]!;
          const failure = sanitizeError(settlement.reason);
          const recovery = await recoverUnpersistedMatchEvidence({
            job,
            matchId: failure.matchId,
            captureMatch,
          });
          if (recovery.source) {
            recoveredSources.push(recovery.source);
          }
          artifactPersistenceFailures.push({
            blockOrdinal,
            ordinal: job.ordinal,
            artifactFile: job.artifactFile,
            error: failure,
            recoveredOperationalSummary: recovery.summary,
          });
          dependencies.emitProgress?.({
            blockOrdinal,
            ordinal: job.ordinal,
            status: "failure",
            matchId: failure.matchId,
          });
        }
      }
      artifacts.sort((left, right) => left.job.ordinal - right.job.ordinal);
      if (pairFailed) {
        stoppedAfterBlock = blockOrdinal;
        break;
      }
    }

    let verification: ReturnType<typeof sourceVerification>;
    try {
      const postRunLineage = await collectPostSource();
      verification = sourceVerification(
        sourceLineage,
        postRunLineage,
      );
    } catch (error) {
      verification = {
        valid: false,
        mismatches: [
          `post-run source lineage collection failed: ${
            sanitizeError(error).message
          }`,
        ],
        // The pre-run lineage remains the last durable, verified source
        // identity. The explicit mismatch prevents it from being mistaken for
        // a successful post-run recapture.
        lineage: sourceLineage,
      };
    }
    const reportValue = report(
      scheduleValue,
      preregistrationValue,
      artifacts,
      recoveredSources,
      launchedMatches,
      artifactPersistenceFailures,
      stoppedAfterBlock,
      verification,
      dependencies.now,
    );
    await writeSecureNoClobberJson(
      outputDir,
      "report.json",
      reportValue,
    );
    await verifyPersistedSelfHash(
      resolve(outputDir, "report.json"),
      "reportContentHash",
      reportValue as unknown as Record<string, unknown>,
    );
    return reportValue;
  } finally {
    if (executionStarted) {
      await closeDatabase();
    }
  }
}

function isDirectExecution(): boolean {
  if (!process.argv[1]) return false;
  return resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length !== 1 || args[0]!.startsWith("-")) {
    throw new Error(
      "Usage: tsx scripts/run-candidate-policy-ab-experiment.ts <new-output-directory>",
    );
  }
  const result = await runCandidatePolicyAbExperiment({
    outputDir: args[0]!,
    schedule: "full",
  });
  console.log(
    JSON.stringify(
      {
        status: result.status,
        schedule: result.schedule.id,
        validMatches: result.validMatches,
        plannedMatches: result.plannedMatches,
        releaseBoundary: result.releaseBoundary,
        tableBotBuildLicenseEligible:
          result.tableBotBuildLicenseEligible,
      },
      null,
      2,
    ),
  );
  if (result.status !== "complete") {
    process.exitCode = 1;
  }
}

if (isDirectExecution()) {
  main().catch((error) => {
    console.error(
      `[candidate-policy-ab] ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    process.exitCode = 1;
  });
}
