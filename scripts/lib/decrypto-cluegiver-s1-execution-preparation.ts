/**
 * Provider-free execution-preparation contract for the S1 cluegiver canary.
 *
 * This module constructs no provider client and performs no dispatch,
 * credential, database, or network operation. Its returned artifact is the
 * sole typed input authorized for a future separately reviewed provider
 * adapter. The exact freshly compiled payload is carried inside that artifact;
 * stored prompt bytes are not accepted as a parallel input.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  DEEPSEEK_V4_FLASH_CANONICAL,
  JOINT_ASSIGNMENT_DECODER_COMPILER_HASH,
  JOINT_ASSIGNMENT_DECODER_COMPILER_ID,
  JOINT_ASSIGNMENT_DECODER_POLICY_ARTIFACT,
  canonicalJson,
  cloneAndDeepFreeze,
  compileJointAssignmentDecoderPrompt,
  contentHash,
  exactKeys,
  mintObservationV2,
  sha256Hex,
  tableCompetitiveIdentitySet,
  validateGuessDecisionContext,
  verifyCompiledJointAssignmentDecoderPrompt,
  verifyBotBuildManifest,
  verifyCluegiverBotBuildManifest,
  verifyCluegiverObservation,
  verifyObservationV2,
  type BotBuildManifest,
  type BotBuildManifestForDecision,
  type CluegiverBotBuildManifest,
  type ContentIdentityRef,
  type DecryptoCluegiverObservation,
  type DecryptoObservationV2,
  type DecryptoObservationV2Source,
  type CompiledJointAssignmentDecoderPrompt,
} from "@shared/substrate";
import {
  CLUEGIVER_S1_C0_ARM,
  CLUEGIVER_S1_C1_ARM,
  CLUEGIVER_S1_ACTION_CONTRACT_HASH,
  CLUEGIVER_S1_ACTION_CONTRACT_ID,
  candidateBlockRemovedPromptSha256,
  compileCluegiverS1Prompt,
  cluegiverS1ProviderPayload,
  validateCluegiverS1Action,
  type CluegiverS1Arm,
  type CluegiverS1CompilerIdentity,
  type CompiledCluegiverS1Prompt,
  type CluegiverS1ProviderPayload,
} from "./decrypto-cluegiver-s1-policies";
import {
  CLUEGIVER_S1_REVIEWED_BOTBUILD_IDENTITIES,
  CLUEGIVER_S1_REVIEWED_BOTBUILD_IDENTITY_SOURCE,
} from "./decrypto-cluegiver-s1-reviewed-botbuild-identities";

export {
  CLUEGIVER_S1_REVIEWED_BOTBUILD_IDENTITIES,
  CLUEGIVER_S1_REVIEWED_BOTBUILD_IDENTITY_SOURCE,
};

export const CLUEGIVER_S1_EXECUTION_PREPARATION_VERSION =
  "decrypto-cluegiver-s1-execution-preparation@0.1.0";
export const CLUEGIVER_S1_PARENT_TERMINAL_RECORD_VERSION =
  "decrypto-cluegiver-s1-parent-terminal-record@0.1.0";
export const CLUEGIVER_S1_PREPARED_DISPATCH_VERSION =
  "decrypto-cluegiver-s1-prepared-dispatch@0.1.0";
export const CLUEGIVER_S1_RECEIPT_VERSION =
  "decrypto-cluegiver-s1-prereg-dry-run-receipt@0.4.0";
export const CLUEGIVER_S1_MAX_TOKENS = 65_536 as const;
export const CLUEGIVER_S1_CONCURRENCY = 4 as const;
export const CLUEGIVER_S1_WARNING_MS = 300_000 as const;
export const CLUEGIVER_S1_HARD_STOP_MS = 600_000 as const;
export const CLUEGIVER_S1_ORDERING_SEED =
  "decrypto-cluegiver-s1-dag-order@2026-08-02.2";
export const CLUEGIVER_S1_HISTORICAL_V02_RECEIPT_BYTES_SHA256 =
  "181fd6f3c1d40d7722018cecf181838d366f8c97062a7cbbe8484c4eb3c936b2";
export const CLUEGIVER_S1_REVIEWED_PROVIDER_VISIBLE_PROMPT_PROJECTION_HASH =
  "56989a03e8482f2df20ef9cc112584f2408a5693006c58131ba95d4bf4019b40";

export const CLUEGIVER_S1_CLUE_PLACEHOLDERS = cloneAndDeepFreeze([
  "PARENTCLUEONE",
  "PARENTCLUETWO",
  "PARENTCLUETHREE",
] as [string, string, string]);

export const CLUEGIVER_S1_SAMPLING_CONTRACT = cloneAndDeepFreeze({
  temperature: "wire_key_must_be_absent" as const,
  top_p: "wire_key_must_be_absent" as const,
  seed: "wire_key_must_be_absent" as const,
  providerDefaultValues: "not_claimed" as const,
  nondeterminism: "uncontrolled_provider_sampling" as const,
  replicationInterpretation:
    "repeated_physical_draws_not_independent_positions" as const,
  futureAdapterWireObligation: "omit_temperature_top_p_and_seed_keys" as const,
});

export const CLUEGIVER_S1_ROUTE_PLAN = cloneAndDeepFreeze({
  requestedModel: {
    provider: DEEPSEEK_V4_FLASH_CANONICAL.provider,
    model: DEEPSEEK_V4_FLASH_CANONICAL.model,
    upstream: DEEPSEEK_V4_FLASH_CANONICAL.upstream,
  },
  route: {
    upstreamOrder: ["deepinfra"] as const,
    allowFallbacks: false as const,
    requireParameters: true as const,
    maximumAttempts: 1 as const,
    maxTokens: CLUEGIVER_S1_MAX_TOKENS,
  },
  reasoning: {
    applicationEffort: "xhigh" as const,
    wireEffort: "max" as const,
    mode: "full_strength_async" as const,
  },
  sampling: CLUEGIVER_S1_SAMPLING_CONTRACT,
  timeout: {
    warningMs: CLUEGIVER_S1_WARNING_MS,
    hardStopMs: CLUEGIVER_S1_HARD_STOP_MS,
    behaviorAtWarning: "record_warning_and_continue" as const,
    behaviorAtHardStop: "record_timeout_no_retry_no_fallback" as const,
  },
});

export const CLUEGIVER_S1_ROUTE_PLAN_HASH = contentHash(
  CLUEGIVER_S1_ROUTE_PLAN,
);

export const CLUEGIVER_S1_JOB_EXECUTION_PLAN = cloneAndDeepFreeze({
  status: "planned_unlicensed" as const,
  providerDispatches: 0 as const,
  outcome: null,
  maximumAttempts: 1 as const,
  maxTokens: CLUEGIVER_S1_MAX_TOKENS,
  retries: 0 as const,
  fallbacks: 0 as const,
  warningMs: CLUEGIVER_S1_WARNING_MS,
  hardStopMs: CLUEGIVER_S1_HARD_STOP_MS,
});

export const CLUEGIVER_S1_EXECUTION_CONTROL_PLAN = cloneAndDeepFreeze({
  mode: "dry_run" as const,
  providerDispatch: "forbidden" as const,
  databaseAccess: "forbidden" as const,
  networkAccess: "forbidden" as const,
  providerCallsThisRun: 0 as const,
  plannedProviderCallsAfterReview: 56 as const,
  maximumAttemptsPerJob: 1 as const,
  maxTokensPerJob: CLUEGIVER_S1_MAX_TOKENS,
  concurrency: CLUEGIVER_S1_CONCURRENCY,
  concurrencyScope: "worker_limit_only" as const,
  dependencyScheduling:
    "child_preparation_requires_one_hash_bound_succeeded_parent_terminal_record" as const,
  retries: 0 as const,
  fallbacks: 0 as const,
  providerCallLicense: "unlicensed" as const,
  jobExecutionPlan: CLUEGIVER_S1_JOB_EXECUTION_PLAN,
});

export const CLUEGIVER_S1_DISPATCH_INVARIANTS = cloneAndDeepFreeze({
  oneCluegiverParentPerCell: true as const,
  allSixAssessorsShareParentClueTriple: true as const,
  parentRationaleVisibleDownstream: false as const,
  childObservationTemplatesVerify: true as const,
  sharedAssessorPolicyCompilerAndValidator: true as const,
  sharedRegistryAwareDecisionContexts: true as const,
  uniquePersistenceIdempotencyKeyIsJobId: true as const,
  dispatchPreparationReturnsFreshCompiledArtifact: true as const,
  providerVisiblePromptProjectionHash:
    CLUEGIVER_S1_REVIEWED_PROVIDER_VISIBLE_PROMPT_PROJECTION_HASH,
  providerInvocations: 0 as const,
  c2Jobs: 0 as const,
});

const CLUEGIVER_S1_REVIEWED_POSITION_METADATA = cloneAndDeepFreeze({
  "production-red-column-leak-anchor": {
    positionHash:
      "d3b2b1199b63f697f38c807add525adf0ab33bf1b54e8f9cfc43445018b253e1",
    historyStrata: [
      "history_bearing",
      "history_bearing",
      "history_bearing",
    ] as const,
    gameId: "884e2eac-0088-4cbc-8f23-54cd67d1712d",
    focalTeam: "red",
    opponentTeam: "blue",
    focalCluegiver: {
      actorId: "production-red-agent-b",
      seatId: "production-red-seat-b",
    },
    teammateDecoder: {
      actorId: "production-red-agent-a",
      seatId: "production-red-seat-a",
    },
    opponentCluegiverSeatId: "production-blue-seat-b",
    opponentInterceptor: {
      actorId: "production-blue-agent-a",
      seatId: "production-blue-seat-a",
    },
    currentOpponentClues: ["treetop", "turret", "nebula"] as const,
  },
  "experiment-blue-canyon-violin": {
    positionHash:
      "93e6fb65e02628ccbab06d30878fc9be587e183d6e77bf2bdbecef848742d968",
    historyStrata: [
      "history_free",
      "history_bearing",
      "history_bearing",
    ] as const,
    gameId: "s1-experiment-blue-canyon-violin",
    focalTeam: "blue",
    opponentTeam: "red",
    focalCluegiver: {
      actorId: "s1-blue-canyon-agent-b",
      seatId: "s1-blue-canyon-seat-b",
    },
    teammateDecoder: {
      actorId: "s1-blue-canyon-agent-a",
      seatId: "s1-blue-canyon-seat-a",
    },
    opponentCluegiverSeatId: "s1-red-orchard-seat-b",
    opponentInterceptor: {
      actorId: "s1-red-orchard-agent-a",
      seatId: "s1-red-orchard-seat-a",
    },
    currentOpponentClues: ["meadow", "silken", "moor"] as const,
  },
  "experiment-blue-thunder-library": {
    positionHash:
      "d8b6ab3b0a0f710fdc731251d230783bdc68e0cb3deeaec794fede02f34b53e3",
    historyStrata: [
      "history_free",
      "history_bearing",
      "history_bearing",
    ] as const,
    gameId: "s1-experiment-blue-thunder-library",
    focalTeam: "blue",
    opponentTeam: "red",
    focalCluegiver: {
      actorId: "s1-blue-thunder-agent-b",
      seatId: "s1-blue-thunder-seat-b",
    },
    teammateDecoder: {
      actorId: "s1-blue-thunder-agent-a",
      seatId: "s1-blue-thunder-seat-a",
    },
    opponentCluegiverSeatId: "s1-red-landscape-seat-b",
    opponentInterceptor: {
      actorId: "s1-red-landscape-agent-a",
      seatId: "s1-red-landscape-seat-a",
    },
    currentOpponentClues: ["gorge", "strings", "glass"] as const,
  },
  "experiment-red-lantern-desert": {
    positionHash:
      "d0a62665896aa6f1a4eed36d6f56c2603961f89b8cbacf4d522b726d7268c1c2",
    historyStrata: [
      "history_bearing",
      "history_free",
      "history_bearing",
    ] as const,
    gameId: "s1-experiment-red-lantern-desert",
    focalTeam: "red",
    opponentTeam: "blue",
    focalCluegiver: {
      actorId: "s1-red-lantern-agent-b",
      seatId: "s1-red-lantern-seat-b",
    },
    teammateDecoder: {
      actorId: "s1-red-lantern-agent-a",
      seatId: "s1-red-lantern-seat-a",
    },
    opponentCluegiverSeatId: "s1-blue-weather-seat-b",
    opponentInterceptor: {
      actorId: "s1-blue-weather-agent-a",
      seatId: "s1-blue-weather-seat-a",
    },
    currentOpponentClues: ["rumble", "shelf", "crossing"] as const,
  },
});

const CLUEGIVER_S1_PARENT_DECISION_FOCUS =
  "Choose three legal strategic clues for the live round-two code.";
const CLUEGIVER_S1_DECODER_DECISION_FOCUS =
  "Map the three current own clues to one legal distinct three-digit code.";
const CLUEGIVER_S1_INTERCEPTOR_DECISION_FOCUS =
  "Map the three current opponent clues to one legal distinct three-digit interception.";

const CLUEGIVER_S1_REVIEWED_JOB_IDENTITIES = cloneAndDeepFreeze({
  cluegiverPromptCompiler: {
    id: "paired-cluegiver-s1-compiler@0.2.0",
    contentHash:
      "d2c478c81ab12b7e94694e39943a76ff85ac8163d8474f1763769fc533928818",
  },
  cluegiverActionContract: {
    id: CLUEGIVER_S1_ACTION_CONTRACT_ID,
    contentHash: CLUEGIVER_S1_ACTION_CONTRACT_HASH,
  },
  cluegiverActionValidator: {
    id: "cluegiver-s1-action-validator@0.2.0",
    contentHash:
      "9d44bffb2209b9506e3cacc02668e1059003eca767e150a08f9fef4bc671bffb",
  },
  assessorPromptCompiler: {
    contract: {
      id: JOINT_ASSIGNMENT_DECODER_COMPILER_ID,
      contentHash: JOINT_ASSIGNMENT_DECODER_COMPILER_HASH,
    },
    implementation: {
      id: "joint-assignment-decoder-compiler-implementation@0.1.0",
      contentHash:
        "65d7ff146927993249292bca682f93543b13dcd9d86bad6e29f6a27701a420c3",
    },
  },
  assessorActionValidator: {
    id: "joint-assignment-action-validator@0.1.0",
    contentHash:
      "9b6fc31c189837dbb79c1ad51c0e5c44e54cd9b0358878ffe48b69731311e50b",
  },
  assessorPolicy: {
    id: JOINT_ASSIGNMENT_DECODER_POLICY_ARTIFACT.id,
    contentHash: JOINT_ASSIGNMENT_DECODER_POLICY_ARTIFACT.contentHash,
  },
});

export interface SourceByteIdentity {
  readonly path: string;
  readonly sha256: string;
  readonly bytes: number;
}

const EXECUTION_PREPARATION_IMPLEMENTATION_BYTES = readFileSync(
  fileURLToPath(import.meta.url),
  "utf8",
);

export const CLUEGIVER_S1_EXECUTION_PREPARATION_IMPLEMENTATION_SOURCE =
  cloneAndDeepFreeze({
    path: "scripts/lib/decrypto-cluegiver-s1-execution-preparation.ts" as const,
    sha256: sha256Hex(EXECUTION_PREPARATION_IMPLEMENTATION_BYTES),
    bytes: Buffer.byteLength(
      EXECUTION_PREPARATION_IMPLEMENTATION_BYTES,
      "utf8",
    ),
  });

export function mintCluegiverS1ExecutorContract(
  implementationSource: SourceByteIdentity,
) {
  if (
    canonicalJson(implementationSource) !==
    canonicalJson(CLUEGIVER_S1_EXECUTION_PREPARATION_IMPLEMENTATION_SOURCE)
  ) {
    throw new Error(
      "S1 executor contract requires the exact execution-preparation implementation bytes",
    );
  }
  const source = {
    id: "decrypto-cluegiver-s1-executor-contract@0.4.0" as const,
    status: "descriptor_only_executor_not_implemented" as const,
    implementationSource,
    reviewedBotBuildIdentitySource:
      CLUEGIVER_S1_REVIEWED_BOTBUILD_IDENTITY_SOURCE,
    reviewedBotBuildIdentities: CLUEGIVER_S1_REVIEWED_BOTBUILD_IDENTITIES,
    maxTokens: CLUEGIVER_S1_MAX_TOKENS,
    concurrency: CLUEGIVER_S1_CONCURRENCY,
    concurrencyScope: "worker_limit_only" as const,
    dependencyScheduling:
      "parent_record_shape_and_hash_required_before_child_preparation" as const,
    durableLoadProof:
      "deferred_to_separately_reviewed_concrete_executor_persistence" as const,
    persistence: {
      idempotencyKeyField: "jobId" as const,
      uniquenessScope: "entire_preregistered_dag" as const,
      terminalRecordCardinality: "at_most_one_per_jobId" as const,
      decisionIdMayKeyPersistence: false as const,
      logicalActionKeyMayKeyPersistence: false as const,
    },
    providerAdapterInput: {
      only: "CluegiverS1PreparedDispatchArtifact" as const,
      rawOrStoredPromptParallelInput: "forbidden" as const,
      preparationEntrypoint: "prepareCluegiverS1Dispatch" as const,
      mintCapability:
        "module_private_process_local_WeakSet_membership" as const,
      rehydratedOrDeserializedArtifacts: "forbidden" as const,
      verificationImmediatelyBeforeDispatch:
        "verifyCluegiverS1PreparedDispatchArtifact_required" as const,
      samplingWireKeys:
        CLUEGIVER_S1_SAMPLING_CONTRACT.futureAdapterWireObligation,
    },
  };
  return cloneAndDeepFreeze({
    ...source,
    contentHash: contentHash(source),
  });
}

export const CLUEGIVER_S1_EXECUTOR_CONTRACT = mintCluegiverS1ExecutorContract(
  CLUEGIVER_S1_EXECUTION_PREPARATION_IMPLEMENTATION_SOURCE,
);

export function makeCluegiverS1CellOrderingKey(
  positionId: string,
  arm: CluegiverS1Arm,
): string {
  return sha256Hex(
    `${CLUEGIVER_S1_ORDERING_SEED}\u0000${positionId}\u0000${arm}`,
  );
}

export function makeCluegiverS1CellId(orderingKey: string): string {
  return `s1-cell:${orderingKey.slice(0, 20)}`;
}

export function makeCluegiverS1ParentJobId(cellId: string): string {
  return `${cellId}:cluegiver`;
}

export function makeCluegiverS1AssessorJobId(
  parentJobId: string,
  role: "decoder" | "interceptor",
  replication: 1 | 2 | 3,
): string {
  return `${parentJobId}:${role}:${replication}`;
}

export function makeCluegiverS1AssessorMatchedPositionKey(
  positionId: string,
): string {
  return sha256Hex(
    `${CLUEGIVER_S1_ORDERING_SEED}\u0000matched-assessor\u0000${positionId}`,
  ).slice(0, 20);
}

export interface CluegiverS1ParentTerminalRecordSource {
  readonly recordVersion: typeof CLUEGIVER_S1_PARENT_TERMINAL_RECORD_VERSION;
  readonly recordKind: "cluegiver_parent_terminal";
  readonly jobId: string;
  readonly cellId: string;
  readonly arm: CluegiverS1Arm;
  readonly terminalStatus: "succeeded";
  readonly actionValidation: {
    readonly validator: "validateCluegiverS1Action";
    readonly status: "validated";
  };
  readonly action: {
    readonly rationale: string;
    readonly clues: readonly [string, string, string];
  };
  readonly actionContentHash: string;
}

export interface CluegiverS1ParentTerminalRecord extends CluegiverS1ParentTerminalRecordSource {
  readonly contentHash: string;
}

export function mintCluegiverS1ParentTerminalRecord(input: {
  readonly jobId: string;
  readonly cellId: string;
  readonly arm: CluegiverS1Arm;
  readonly observation: DecryptoCluegiverObservation;
  readonly action: unknown;
}): CluegiverS1ParentTerminalRecord {
  const problems = validateCluegiverS1Action(input.action, input.observation);
  if (problems.length > 0) {
    throw new Error(
      `cannot mint S1 parent terminal record for an invalid action: ${problems.join("; ")}`,
    );
  }
  const actionRecord = input.action as {
    readonly rationale: string;
    readonly clues: readonly [string, string, string];
  };
  const action = cloneAndDeepFreeze({
    rationale: actionRecord.rationale,
    clues: [...actionRecord.clues] as [string, string, string],
  });
  const source: CluegiverS1ParentTerminalRecordSource = {
    recordVersion: CLUEGIVER_S1_PARENT_TERMINAL_RECORD_VERSION,
    recordKind: "cluegiver_parent_terminal",
    jobId: input.jobId,
    cellId: input.cellId,
    arm: input.arm,
    terminalStatus: "succeeded",
    actionValidation: {
      validator: "validateCluegiverS1Action",
      status: "validated",
    },
    action,
    actionContentHash: contentHash(action),
  };
  return cloneAndDeepFreeze({
    ...source,
    contentHash: contentHash(source),
  });
}

interface DispatchPersistencePlan {
  readonly idempotencyKey: string;
  readonly keySource: "jobId";
  readonly uniquenessScope: "entire_preregistered_dag";
  readonly decisionIdMayKeyPersistence: false;
  readonly logicalActionKeyMayKeyPersistence: false;
}

interface DispatchCell {
  readonly ordinal: number;
  readonly cellId: string;
  readonly orderingKey: string;
  readonly positionId: string;
  readonly positionHash: string;
  readonly arm: CluegiverS1Arm;
  readonly historyStrata: readonly ("history_bearing" | "history_free")[];
  readonly parentJobId: string;
  readonly teammateDecoderJobIds: readonly [string, string, string];
  readonly opponentInterceptorJobIds: readonly [string, string, string];
  readonly jobCount: 7;
}

interface DispatchBaseJob {
  readonly ordinal: number;
  readonly cellOrdinal: number;
  readonly jobId: string;
  readonly cellId: string;
  readonly positionId: string;
  readonly arm: CluegiverS1Arm;
  readonly dependencies: readonly string[];
  readonly route: typeof CLUEGIVER_S1_ROUTE_PLAN;
  readonly execution: typeof CLUEGIVER_S1_JOB_EXECUTION_PLAN;
  readonly persistence: DispatchPersistencePlan;
}

interface DispatchParentJob extends DispatchBaseJob {
  readonly role: "cluegiver";
  readonly assessorReplication: null;
  readonly promptCompiler: ContentIdentityRef;
  readonly actionContract: ContentIdentityRef;
  readonly actionValidator: ContentIdentityRef;
  readonly observation: DecryptoCluegiverObservation;
  readonly compiledPrompt: {
    readonly id: string;
    readonly contentHash: string;
    readonly systemPromptSha256: string;
    readonly userPromptSha256: string;
    readonly candidateBlockRemovedUserPromptSha256: string;
  };
  readonly outputContract: {
    readonly publishToChildren: "clues_only";
    readonly rationaleVisibility: "parent_private_never_downstream";
  };
}

interface DispatchAssessorJob extends DispatchBaseJob {
  readonly role: "teammate_decoder" | "opponent_interceptor";
  readonly assessorReplication: 1 | 2 | 3;
  readonly parentJobId: string;
  readonly promptCompiler: {
    readonly contract: ContentIdentityRef;
    readonly implementation: ContentIdentityRef;
  };
  readonly actionContract: ContentIdentityRef;
  readonly actionValidator: ContentIdentityRef;
  readonly policy: ContentIdentityRef;
  readonly blindedInput: {
    readonly observationTemplate: DecryptoObservationV2;
    readonly cluePlaceholders: readonly [string, string, string];
    readonly parentOutputProjection: {
      readonly sourceJobId: string;
      readonly include: readonly ["clues"];
      readonly exclude: readonly ["rationale"];
      readonly materializer: "materializeAssessorObservationFromParentAction";
      readonly requiredBotBuildManifest: ContentIdentityRef;
    };
  };
  readonly templateBinding: {
    readonly cellId: string;
    readonly arm: CluegiverS1Arm;
    readonly role: "teammate_decoder" | "opponent_interceptor";
    readonly assessorReplication: 1 | 2 | 3;
    readonly observationTemplateContentHash: string;
  };
  readonly compiledPromptTemplate: {
    readonly id: string;
    readonly contentHash: string;
    readonly observationTemplateContentHash: string;
    readonly placeholderIndependentContentHash: string;
    readonly providerPayloadContentHash: string;
    readonly systemPromptSha256: string;
    readonly taskPromptSha256: string;
    readonly actionContractSha256: string;
  };
}

type DispatchJob = DispatchParentJob | DispatchAssessorJob;

export interface CluegiverS1DispatchPreregistration {
  readonly preregistrationContentHash: string;
  readonly route: typeof CLUEGIVER_S1_ROUTE_PLAN;
  readonly execution: typeof CLUEGIVER_S1_EXECUTION_CONTROL_PLAN & {
    readonly executorContract: ReturnType<
      typeof mintCluegiverS1ExecutorContract
    >;
  };
  readonly implementationBindings: {
    readonly cluegiverPromptCompiler: CluegiverS1CompilerIdentity;
    readonly executionPreparationImplementation: SourceByteIdentity;
    readonly reviewedBotBuildIdentitySource: SourceByteIdentity;
  };
  readonly botBuilds: {
    readonly assessor: BotBuildManifest;
    readonly cluegiverByArm: Readonly<
      Record<CluegiverS1Arm, CluegiverBotBuildManifest>
    >;
  };
  readonly dag: {
    readonly cells: readonly DispatchCell[];
    readonly jobs: readonly DispatchJob[];
  };
  readonly invariants: typeof CLUEGIVER_S1_DISPATCH_INVARIANTS;
}

export interface CluegiverS1AssessorProviderPayload {
  readonly systemPrompt: string;
  readonly taskPrompt: string;
  readonly actionContract: string;
}

export function cluegiverS1AssessorProviderPayload(
  compiled: CompiledJointAssignmentDecoderPrompt,
): Readonly<CluegiverS1AssessorProviderPayload> {
  const payload = cloneAndDeepFreeze({
    systemPrompt: compiled.systemPrompt,
    taskPrompt: compiled.taskPrompt,
    actionContract: compiled.actionContract,
  });
  const problems = exactKeys(
    payload,
    ["systemPrompt", "taskPrompt", "actionContract"],
    "S1 assessor provider payload",
  );
  if (problems.length > 0) throw new Error(problems.join("; "));
  return payload;
}

export function cluegiverS1AssessorPlaceholderIndependentContentHash(
  compiled: CompiledJointAssignmentDecoderPrompt,
): string {
  return contentHash({
    compiler: compiled.compiler,
    policy: compiled.policy,
    transcriptTreatment: compiled.transcriptTreatment,
    role: compiled.role,
    systemPrompt: compiled.systemPrompt,
    actionContract: compiled.actionContract,
  });
}

export function compileCluegiverS1AssessorPrompt(
  observation: DecryptoObservationV2,
  assessorBuild: BotBuildManifestForDecision,
): CompiledJointAssignmentDecoderPrompt {
  const contextProblems = validateGuessDecisionContext(
    observation,
    assessorBuild,
  );
  if (contextProblems.length > 0) {
    throw new Error(
      `invalid S1 guess decision context: ${contextProblems.join("; ")}`,
    );
  }
  const compiled = compileJointAssignmentDecoderPrompt(observation);
  if (!verifyCompiledJointAssignmentDecoderPrompt(compiled, observation)) {
    throw new Error(
      `${observation.decisionId} joint-assignment prompt failed verification`,
    );
  }
  return compiled;
}

export function materializeAssessorObservationFromParentAction(
  template: DecryptoObservationV2,
  parentAction: unknown,
  assessorBuild: BotBuildManifestForDecision,
): DecryptoObservationV2 {
  const templateContextProblems = validateGuessDecisionContext(
    template,
    assessorBuild,
  );
  if (templateContextProblems.length > 0) {
    throw new Error(
      `cannot materialize invalid S1 guess decision context: ${templateContextProblems.join("; ")}`,
    );
  }
  const action =
    parentAction !== null && typeof parentAction === "object"
      ? (parentAction as Record<string, unknown>)
      : null;
  if (
    !Array.isArray(action?.clues) ||
    action.clues.length !== 3 ||
    !action.clues.every((clue) => typeof clue === "string")
  ) {
    throw new Error("parent action must expose exactly one three-clue array");
  }
  const clues = [...action.clues] as [string, string, string];
  const { contentHash: _discardedHash, ...source } = template;
  const materialized: DecryptoObservationV2Source = {
    ...source,
    ownClues: template.role === "decoder" ? clues : [...template.ownClues],
    opponentClues:
      template.role === "interceptor" ? clues : [...template.opponentClues],
  };
  const observation = mintObservationV2(materialized);
  if (!verifyObservationV2(observation)) {
    throw new Error("materialized S1 guess observation failed verification");
  }
  const materializedContextProblems = validateGuessDecisionContext(
    observation,
    assessorBuild,
  );
  if (materializedContextProblems.length > 0) {
    throw new Error(
      `materialized S1 guess decision context failed: ${materializedContextProblems.join("; ")}`,
    );
  }
  return observation;
}

function jsonRoundTrip(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

function assertCanonicalRouteAndExecution(
  preregistration: CluegiverS1DispatchPreregistration,
): void {
  const { executorContract, ...executionControlPlan } =
    preregistration.execution;
  const executionProblems = exactKeys(
    preregistration.execution,
    [
      "mode",
      "providerDispatch",
      "databaseAccess",
      "networkAccess",
      "providerCallsThisRun",
      "plannedProviderCallsAfterReview",
      "maximumAttemptsPerJob",
      "maxTokensPerJob",
      "concurrency",
      "concurrencyScope",
      "dependencyScheduling",
      "retries",
      "fallbacks",
      "providerCallLicense",
      "jobExecutionPlan",
      "executorContract",
    ],
    "S1 top-level execution",
  );
  if (
    executionProblems.length > 0 ||
    canonicalJson(jsonRoundTrip(preregistration.route)) !==
      canonicalJson(CLUEGIVER_S1_ROUTE_PLAN) ||
    canonicalJson(jsonRoundTrip(executionControlPlan)) !==
      canonicalJson(CLUEGIVER_S1_EXECUTION_CONTROL_PLAN) ||
    canonicalJson(executorContract) !==
      canonicalJson(CLUEGIVER_S1_EXECUTOR_CONTRACT)
  ) {
    throw new Error(
      "S1 dispatch preparation requires the exact round-trippable top-level route and execution plan",
    );
  }
  for (const job of preregistration.dag.jobs) {
    if (
      canonicalJson(jsonRoundTrip(job.route)) !==
        canonicalJson(CLUEGIVER_S1_ROUTE_PLAN) ||
      canonicalJson(jsonRoundTrip(job.execution)) !==
        canonicalJson(CLUEGIVER_S1_JOB_EXECUTION_PLAN)
    ) {
      throw new Error(
        `${job.jobId} route/execution copy drifted from the frozen top-level plans`,
      );
    }
  }
}

function assertCanonicalCellGraph(
  preregistration: CluegiverS1DispatchPreregistration,
): void {
  if (
    preregistration.dag.cells.length !== 8 ||
    preregistration.dag.jobs.length !== 56
  ) {
    throw new Error("S1 dispatch preparation requires the complete 8-cell DAG");
  }
  const expectedCoordinates = Object.keys(
    CLUEGIVER_S1_REVIEWED_POSITION_METADATA,
  )
    .flatMap((positionId) =>
      ([CLUEGIVER_S1_C0_ARM, CLUEGIVER_S1_C1_ARM] as const).map((arm) => ({
        positionId,
        arm,
        orderingKey: makeCluegiverS1CellOrderingKey(positionId, arm),
      })),
    )
    .sort((left, right) =>
      left.orderingKey < right.orderingKey
        ? -1
        : left.orderingKey > right.orderingKey
          ? 1
          : 0,
    );
  for (const [cellIndex, cell] of preregistration.dag.cells.entries()) {
    const expectedCoordinate = expectedCoordinates[cellIndex];
    if (
      expectedCoordinate === undefined ||
      cell.positionId !== expectedCoordinate.positionId ||
      cell.arm !== expectedCoordinate.arm
    ) {
      throw new Error(`S1 cell ${cellIndex + 1} canonical coordinate drifted`);
    }
    const positionMetadata =
      CLUEGIVER_S1_REVIEWED_POSITION_METADATA[
        cell.positionId as keyof typeof CLUEGIVER_S1_REVIEWED_POSITION_METADATA
      ];
    if (positionMetadata === undefined) {
      throw new Error(`${cell.cellId} uses an unreviewed position`);
    }
    const expectedOrderingKey = makeCluegiverS1CellOrderingKey(
      cell.positionId,
      cell.arm,
    );
    const expectedCellId = makeCluegiverS1CellId(expectedOrderingKey);
    const expectedParentJobId = makeCluegiverS1ParentJobId(expectedCellId);
    const expectedDecoderJobIds = [1, 2, 3].map((replication) =>
      makeCluegiverS1AssessorJobId(
        expectedParentJobId,
        "decoder",
        replication as 1 | 2 | 3,
      ),
    );
    const expectedInterceptorJobIds = [1, 2, 3].map((replication) =>
      makeCluegiverS1AssessorJobId(
        expectedParentJobId,
        "interceptor",
        replication as 1 | 2 | 3,
      ),
    );
    const jobs = preregistration.dag.jobs.filter(
      (job) => job.cellId === cell.cellId,
    );
    const expectedCell = {
      ordinal: cellIndex + 1,
      cellId: expectedCellId,
      orderingKey: expectedOrderingKey,
      positionId: cell.positionId,
      positionHash: positionMetadata.positionHash,
      arm: cell.arm,
      historyStrata: positionMetadata.historyStrata,
      parentJobId: expectedParentJobId,
      teammateDecoderJobIds: expectedDecoderJobIds,
      opponentInterceptorJobIds: expectedInterceptorJobIds,
      jobCount: 7,
    };
    if (
      canonicalJson(cell) !== canonicalJson(expectedCell) ||
      jobs.length !== 7 ||
      canonicalJson(jobs.map((job) => job.jobId)) !==
        canonicalJson([
          expectedParentJobId,
          ...expectedDecoderJobIds,
          ...expectedInterceptorJobIds,
        ]) ||
      jobs.some(
        (job, jobIndex) =>
          job.cellOrdinal !== cell.ordinal ||
          job.ordinal !== cellIndex * 7 + jobIndex + 1,
      )
    ) {
      throw new Error(`${cell.cellId} canonical cell graph drifted`);
    }
  }
}

function reviewedPositionMetadata(positionId: string) {
  const metadata =
    CLUEGIVER_S1_REVIEWED_POSITION_METADATA[
      positionId as keyof typeof CLUEGIVER_S1_REVIEWED_POSITION_METADATA
    ];
  if (metadata === undefined) {
    throw new Error(`S1 position ${positionId} is not independently reviewed`);
  }
  return metadata;
}

function assertCanonicalParentObservationSemantics(
  job: DispatchParentJob,
): void {
  const metadata = reviewedPositionMetadata(job.positionId);
  const actual = {
    observationVersion: job.observation.observationVersion,
    decisionId: job.observation.decisionId,
    logicalActionKey: job.observation.logicalActionKey,
    gameId: job.observation.gameId,
    roundNumber: job.observation.roundNumber,
    actor: job.observation.actor,
    activeCluegiverSeatId: job.observation.activeCluegiverSeatId,
    identities: job.observation.identities,
    role: job.observation.role,
    team: job.observation.team,
    decisionFocus: job.observation.decisionFocus,
    transcript: job.observation.transcript,
  };
  const expected = {
    observationVersion: "cluegiver-0.1",
    decisionId: `s1-cluegiver:${job.positionId}`,
    logicalActionKey: `s1-clue-action:${job.positionId}:round-2`,
    gameId: metadata.gameId,
    roundNumber: 2,
    actor: {
      actorId: metadata.focalCluegiver.actorId,
      seatId: metadata.focalCluegiver.seatId,
      seatRole: "agent_b",
      team: metadata.focalTeam,
      role: "cluegiver",
    },
    activeCluegiverSeatId: metadata.focalCluegiver.seatId,
    identities: {
      botBuild:
        CLUEGIVER_S1_REVIEWED_BOTBUILD_IDENTITIES.cluegiverByArm[job.arm],
      ...tableCompetitiveIdentitySet(),
    },
    role: "cluegiver",
    team: metadata.focalTeam,
    decisionFocus: CLUEGIVER_S1_PARENT_DECISION_FOCUS,
    transcript: [],
  };
  if (canonicalJson(actual) !== canonicalJson(expected)) {
    throw new Error(
      `${job.jobId} canonical parent observation semantics drifted`,
    );
  }
}

function assertCanonicalAssessorObservationSemantics(
  job: DispatchAssessorJob,
  parent: DispatchParentJob,
): void {
  const metadata = reviewedPositionMetadata(job.positionId);
  const observation = job.blindedInput.observationTemplate;
  const isDecoder = job.role === "teammate_decoder";
  const role = isDecoder ? "decoder" : "interceptor";
  const actorSource = isDecoder
    ? metadata.teammateDecoder
    : metadata.opponentInterceptor;
  const team = isDecoder ? metadata.focalTeam : metadata.opponentTeam;
  const { contentHash: _contentHash, ...actual } = observation;
  const decisionId = `s1-assess:${makeCluegiverS1AssessorMatchedPositionKey(job.positionId)}:${role}:${job.assessorReplication}`;
  const resolvedAssessorSide = (
    side: DecryptoCluegiverObservation["resolvedRounds"][number]["own"],
  ) => ({
    clues: [...side.clues],
    code: [...side.code],
    ownDecode: [...side.ownDecode],
    intercept: null,
    decodedCorrectly:
      side.code.length === side.ownDecode.length &&
      side.code.every((digit, index) => digit === side.ownDecode[index]),
    wasIntercepted: null,
  });
  const orientedResolvedRounds = parent.observation.resolvedRounds.map(
    (round) => ({
      roundNumber: round.roundNumber,
      own: resolvedAssessorSide(isDecoder ? round.own : round.opponent),
      opponent: resolvedAssessorSide(isDecoder ? round.opponent : round.own),
    }),
  );
  const expected = {
    observationVersion: "0.2",
    decisionId,
    logicalActionKey: `${decisionId}:one-attempt`,
    gameId: metadata.gameId,
    roundNumber: 2,
    actor: {
      actorId: actorSource.actorId,
      seatId: actorSource.seatId,
      team,
      role,
    },
    activeCluegiverSeatId: isDecoder
      ? metadata.focalCluegiver.seatId
      : metadata.opponentCluegiverSeatId,
    identities: {
      botBuild: CLUEGIVER_S1_REVIEWED_BOTBUILD_IDENTITIES.assessor,
      ...tableCompetitiveIdentitySet(),
    },
    role,
    team,
    ownKeywords: isDecoder ? [...parent.observation.ownKeywords] : null,
    ownClues: isDecoder
      ? [...CLUEGIVER_S1_CLUE_PLACEHOLDERS]
      : [...metadata.currentOpponentClues],
    opponentClues: isDecoder
      ? [...metadata.currentOpponentClues]
      : [...CLUEGIVER_S1_CLUE_PLACEHOLDERS],
    resolvedRounds: orientedResolvedRounds,
    tokens: isDecoder
      ? {
          own: { ...parent.observation.tokens.own },
          opponent: { ...parent.observation.tokens.opponent },
        }
      : {
          own: { ...parent.observation.tokens.opponent },
          opponent: { ...parent.observation.tokens.own },
        },
    teamChatVisibility: parent.observation.teamChatVisibility,
    decisionFocus: isDecoder
      ? CLUEGIVER_S1_DECODER_DECISION_FOCUS
      : CLUEGIVER_S1_INTERCEPTOR_DECISION_FOCUS,
    transcript: [],
  };
  if (canonicalJson(actual) !== canonicalJson(expected)) {
    throw new Error(
      `${job.jobId} canonical assessor observation semantics drifted`,
    );
  }
}

function findCanonicalJob(
  preregistration: CluegiverS1DispatchPreregistration,
  jobId: string,
): DispatchJob {
  const jobIds = preregistration.dag.jobs.map((job) => job.jobId);
  if (new Set(jobIds).size !== jobIds.length) {
    throw new Error("S1 dispatch preparation requires globally unique jobIds");
  }
  const matches = preregistration.dag.jobs.filter((job) => job.jobId === jobId);
  if (matches.length !== 1) {
    throw new Error(
      "S1 dispatch preparation requires exactly one preregistered jobId",
    );
  }
  const job = matches[0]!;
  const cellMatches = preregistration.dag.cells.filter(
    (cell) => cell.cellId === job.cellId,
  );
  if (cellMatches.length !== 1) {
    throw new Error(`${job.jobId} must bind exactly one canonical cell`);
  }
  const cell = cellMatches[0]!;
  const expectedOrderingKey = makeCluegiverS1CellOrderingKey(
    job.positionId,
    job.arm,
  );
  const expectedCellId = makeCluegiverS1CellId(expectedOrderingKey);
  if (
    cell.ordinal !== job.cellOrdinal ||
    cell.positionId !== job.positionId ||
    cell.arm !== job.arm ||
    cell.orderingKey !== expectedOrderingKey ||
    cell.cellId !== expectedCellId ||
    cell.parentJobId !== makeCluegiverS1ParentJobId(cell.cellId) ||
    job.persistence.idempotencyKey !== job.jobId ||
    job.persistence.keySource !== "jobId" ||
    job.persistence.decisionIdMayKeyPersistence ||
    job.persistence.logicalActionKeyMayKeyPersistence
  ) {
    throw new Error(`${job.jobId} canonical cell/job binding drifted`);
  }
  if (job.role === "cluegiver") {
    if (
      job.jobId !== cell.parentJobId ||
      job.assessorReplication !== null ||
      job.dependencies.length !== 0 ||
      job.observation.decisionId !== `s1-cluegiver:${job.positionId}` ||
      job.observation.logicalActionKey !==
        `s1-clue-action:${job.positionId}:round-2` ||
      canonicalJson(job.observation.identities.botBuild) !==
        canonicalJson({
          id: preregistration.botBuilds.cluegiverByArm[job.arm].id,
          contentHash:
            preregistration.botBuilds.cluegiverByArm[job.arm].contentHash,
        }) ||
      canonicalJson(job.promptCompiler) !==
        canonicalJson({
          id: preregistration.implementationBindings.cluegiverPromptCompiler.id,
          contentHash:
            preregistration.implementationBindings.cluegiverPromptCompiler
              .contentHash,
        })
    ) {
      throw new Error(`${job.jobId} canonical parent binding drifted`);
    }
    assertCanonicalParentObservationSemantics(job);
    assertExactCanonicalParentJob(job, cell, preregistration);
    return job;
  }
  if (job.role !== "teammate_decoder" && job.role !== "opponent_interceptor") {
    throw new Error(`${job.jobId} must have one exact assessor role`);
  }
  const roleIndex = job.assessorReplication - 1;
  const expectedJobId =
    job.role === "teammate_decoder"
      ? cell.teammateDecoderJobIds[roleIndex]
      : cell.opponentInterceptorJobIds[roleIndex];
  const idRole = job.role === "teammate_decoder" ? "decoder" : "interceptor";
  const parent = preregistration.dag.jobs.find(
    (candidate) => candidate.jobId === cell.parentJobId,
  );
  if (parent?.role !== "cluegiver") {
    throw new Error(`${job.jobId} canonical parent is missing`);
  }
  const expectedDecisionId = `s1-assess:${makeCluegiverS1AssessorMatchedPositionKey(job.positionId)}:${idRole}:${job.assessorReplication}`;
  if (
    expectedJobId !== job.jobId ||
    job.jobId !==
      makeCluegiverS1AssessorJobId(
        cell.parentJobId,
        idRole,
        job.assessorReplication,
      ) ||
    job.parentJobId !== cell.parentJobId ||
    canonicalJson(job.dependencies) !== canonicalJson([cell.parentJobId]) ||
    job.templateBinding.cellId !== cell.cellId ||
    job.templateBinding.arm !== cell.arm ||
    job.templateBinding.role !== job.role ||
    job.templateBinding.assessorReplication !== job.assessorReplication ||
    job.templateBinding.observationTemplateContentHash !==
      job.blindedInput.observationTemplate.contentHash ||
    job.blindedInput.parentOutputProjection.sourceJobId !== cell.parentJobId ||
    canonicalJson(job.blindedInput.parentOutputProjection.include) !==
      canonicalJson(["clues"]) ||
    canonicalJson(job.blindedInput.parentOutputProjection.exclude) !==
      canonicalJson(["rationale"]) ||
    canonicalJson(
      job.blindedInput.parentOutputProjection.requiredBotBuildManifest,
    ) !==
      canonicalJson({
        id: preregistration.botBuilds.assessor.id,
        contentHash: preregistration.botBuilds.assessor.contentHash,
      }) ||
    canonicalJson(job.blindedInput.cluePlaceholders) !==
      canonicalJson(CLUEGIVER_S1_CLUE_PLACEHOLDERS) ||
    job.blindedInput.observationTemplate.decisionId !== expectedDecisionId ||
    job.blindedInput.observationTemplate.logicalActionKey !==
      `${expectedDecisionId}:one-attempt` ||
    job.blindedInput.observationTemplate.role !== idRole ||
    job.blindedInput.observationTemplate.gameId !== parent.observation.gameId ||
    job.blindedInput.observationTemplate.roundNumber !==
      parent.observation.roundNumber
  ) {
    throw new Error(`${job.jobId} canonical assessor template binding drifted`);
  }
  assertCanonicalAssessorObservationSemantics(job, parent);
  assertExactCanonicalAssessorJob(job, cell, preregistration);
  return job;
}

function assertTemplateHashes(
  job: DispatchAssessorJob,
  preregistration: CluegiverS1DispatchPreregistration,
): CompiledJointAssignmentDecoderPrompt {
  const template = job.blindedInput.observationTemplate;
  const compiled = compileCluegiverS1AssessorPrompt(
    template,
    preregistration.botBuilds.assessor,
  );
  const payload = cluegiverS1AssessorProviderPayload(compiled);
  if (
    template.contentHash !==
      job.compiledPromptTemplate.observationTemplateContentHash ||
    compiled.contentHash !== job.compiledPromptTemplate.contentHash ||
    cluegiverS1AssessorPlaceholderIndependentContentHash(compiled) !==
      job.compiledPromptTemplate.placeholderIndependentContentHash ||
    contentHash(payload) !==
      job.compiledPromptTemplate.providerPayloadContentHash ||
    sha256Hex(payload.systemPrompt) !==
      job.compiledPromptTemplate.systemPromptSha256 ||
    sha256Hex(payload.taskPrompt) !==
      job.compiledPromptTemplate.taskPromptSha256 ||
    sha256Hex(payload.actionContract) !==
      job.compiledPromptTemplate.actionContractSha256
  ) {
    throw new Error(
      `${job.jobId} full or placeholder-independent template hash drifted`,
    );
  }
  return compiled;
}

function assertParentPromptHashes(
  job: DispatchParentJob,
  preregistration: CluegiverS1DispatchPreregistration,
): CompiledCluegiverS1Prompt {
  const compiled = compileCluegiverS1Prompt({
    observation: job.observation,
    botBuild: preregistration.botBuilds.cluegiverByArm[job.arm],
    arm: job.arm,
    compiler: preregistration.implementationBindings.cluegiverPromptCompiler,
  });
  const payload = cluegiverS1ProviderPayload(compiled);
  if (
    compiled.carrier.id !== job.compiledPrompt.id ||
    compiled.contentHash !== job.compiledPrompt.contentHash ||
    sha256Hex(payload.systemPrompt) !== job.compiledPrompt.systemPromptSha256 ||
    sha256Hex(payload.userPrompt) !== job.compiledPrompt.userPromptSha256 ||
    candidateBlockRemovedPromptSha256(compiled) !==
      job.compiledPrompt.candidateBlockRemovedUserPromptSha256
  ) {
    throw new Error(`${job.jobId} freshly compiled parent prompt hash drifted`);
  }
  return compiled;
}

function canonicalPersistencePlan(jobId: string): DispatchPersistencePlan {
  return {
    idempotencyKey: jobId,
    keySource: "jobId",
    uniquenessScope: "entire_preregistered_dag",
    decisionIdMayKeyPersistence: false,
    logicalActionKeyMayKeyPersistence: false,
  };
}

function canonicalBaseJob(
  job: DispatchJob,
  cell: DispatchCell,
  ordinal: number,
  dependencies: readonly string[],
) {
  return {
    ordinal,
    cellOrdinal: cell.ordinal,
    jobId: job.jobId,
    cellId: cell.cellId,
    positionId: cell.positionId,
    arm: cell.arm,
    dependencies,
    route: CLUEGIVER_S1_ROUTE_PLAN,
    execution: CLUEGIVER_S1_JOB_EXECUTION_PLAN,
    persistence: canonicalPersistencePlan(job.jobId),
  };
}

function assertExactCanonicalParentJob(
  job: DispatchParentJob,
  cell: DispatchCell,
  preregistration: CluegiverS1DispatchPreregistration,
): void {
  if (!verifyCluegiverObservation(job.observation)) {
    throw new Error(
      `${job.jobId} parent observation failed exact verification`,
    );
  }
  const compiled = assertParentPromptHashes(job, preregistration);
  const payload = cluegiverS1ProviderPayload(compiled);
  const expected = {
    ...canonicalBaseJob(job, cell, (cell.ordinal - 1) * 7 + 1, [] as const),
    role: "cluegiver" as const,
    assessorReplication: null,
    promptCompiler:
      CLUEGIVER_S1_REVIEWED_JOB_IDENTITIES.cluegiverPromptCompiler,
    actionContract:
      CLUEGIVER_S1_REVIEWED_JOB_IDENTITIES.cluegiverActionContract,
    actionValidator:
      CLUEGIVER_S1_REVIEWED_JOB_IDENTITIES.cluegiverActionValidator,
    observation: job.observation,
    compiledPrompt: {
      id: compiled.carrier.id,
      contentHash: compiled.contentHash,
      systemPromptSha256: sha256Hex(payload.systemPrompt),
      userPromptSha256: sha256Hex(payload.userPrompt),
      candidateBlockRemovedUserPromptSha256:
        candidateBlockRemovedPromptSha256(compiled),
    },
    outputContract: {
      publishToChildren: "clues_only" as const,
      rationaleVisibility: "parent_private_never_downstream" as const,
    },
  };
  if (canonicalJson(job) !== canonicalJson(expected)) {
    throw new Error(
      `${job.jobId} must equal the exact canonical parent job contract`,
    );
  }
}

function assertExactCanonicalAssessorJob(
  job: DispatchAssessorJob,
  cell: DispatchCell,
  preregistration: CluegiverS1DispatchPreregistration,
): void {
  if (!verifyObservationV2(job.blindedInput.observationTemplate)) {
    throw new Error(
      `${job.jobId} assessor observation template failed exact verification`,
    );
  }
  const compiled = assertTemplateHashes(job, preregistration);
  const payload = cluegiverS1AssessorProviderPayload(compiled);
  const idRole = job.role === "teammate_decoder" ? "decoder" : "interceptor";
  const ordinalOffset =
    job.role === "teammate_decoder"
      ? job.assessorReplication + 1
      : job.assessorReplication + 4;
  const expected = {
    ...canonicalBaseJob(job, cell, (cell.ordinal - 1) * 7 + ordinalOffset, [
      cell.parentJobId,
    ] as const),
    role: job.role,
    assessorReplication: job.assessorReplication,
    parentJobId: cell.parentJobId,
    promptCompiler: CLUEGIVER_S1_REVIEWED_JOB_IDENTITIES.assessorPromptCompiler,
    actionContract: {
      id: `joint-assignment-${idRole}-action-contract@0.1.0`,
      contentHash: contentHash(compiled.actionContract),
    },
    actionValidator:
      CLUEGIVER_S1_REVIEWED_JOB_IDENTITIES.assessorActionValidator,
    policy: CLUEGIVER_S1_REVIEWED_JOB_IDENTITIES.assessorPolicy,
    blindedInput: {
      observationTemplate: job.blindedInput.observationTemplate,
      cluePlaceholders: CLUEGIVER_S1_CLUE_PLACEHOLDERS,
      parentOutputProjection: {
        sourceJobId: cell.parentJobId,
        include: ["clues"] as const,
        exclude: ["rationale"] as const,
        materializer: "materializeAssessorObservationFromParentAction" as const,
        requiredBotBuildManifest: {
          id: preregistration.botBuilds.assessor.id,
          contentHash: preregistration.botBuilds.assessor.contentHash,
        },
      },
    },
    templateBinding: {
      cellId: cell.cellId,
      arm: cell.arm,
      role: job.role,
      assessorReplication: job.assessorReplication,
      observationTemplateContentHash:
        job.blindedInput.observationTemplate.contentHash,
    },
    compiledPromptTemplate: {
      id: `compiled:${job.blindedInput.observationTemplate.decisionId}`,
      contentHash: compiled.contentHash,
      observationTemplateContentHash:
        job.blindedInput.observationTemplate.contentHash,
      placeholderIndependentContentHash:
        cluegiverS1AssessorPlaceholderIndependentContentHash(compiled),
      providerPayloadContentHash: contentHash(payload),
      systemPromptSha256: sha256Hex(payload.systemPrompt),
      taskPromptSha256: sha256Hex(payload.taskPrompt),
      actionContractSha256: sha256Hex(payload.actionContract),
    },
  };
  if (canonicalJson(job) !== canonicalJson(expected)) {
    throw new Error(
      `${job.jobId} must equal the exact canonical assessor job contract`,
    );
  }
}

export type CluegiverS1ProviderVisiblePromptProjectionEntry =
  | {
      readonly systemPromptSha256: string;
      readonly userPromptSha256: string;
    }
  | {
      readonly systemPromptSha256: string;
      readonly taskPromptSha256: string;
      readonly actionContractSha256: string;
    };

export function cluegiverS1ProviderVisiblePromptProjection(
  preregistration: CluegiverS1DispatchPreregistration,
): readonly CluegiverS1ProviderVisiblePromptProjectionEntry[] {
  return cloneAndDeepFreeze(
    preregistration.dag.jobs.map((job) => {
      if (job.role === "cluegiver") {
        const payload = cluegiverS1ProviderPayload(
          assertParentPromptHashes(job, preregistration),
        );
        return {
          systemPromptSha256: sha256Hex(payload.systemPrompt),
          userPromptSha256: sha256Hex(payload.userPrompt),
        };
      }
      if (
        job.role !== "teammate_decoder" &&
        job.role !== "opponent_interceptor"
      ) {
        throw new Error(`${job.jobId} must have one exact assessor role`);
      }
      const payload = cluegiverS1AssessorProviderPayload(
        assertTemplateHashes(job, preregistration),
      );
      return {
        systemPromptSha256: sha256Hex(payload.systemPrompt),
        taskPromptSha256: sha256Hex(payload.taskPrompt),
        actionContractSha256: sha256Hex(payload.actionContract),
      };
    }),
  );
}

export function cluegiverS1ProviderVisiblePromptProjectionHash(
  preregistration: CluegiverS1DispatchPreregistration,
): string {
  return contentHash(
    cluegiverS1ProviderVisiblePromptProjection(preregistration),
  );
}

function verifyParentTerminalRecord(
  record: CluegiverS1ParentTerminalRecord,
  parent: DispatchParentJob,
): void {
  const problems = [
    ...exactKeys(
      record,
      [
        "recordVersion",
        "recordKind",
        "jobId",
        "cellId",
        "arm",
        "terminalStatus",
        "actionValidation",
        "action",
        "actionContentHash",
        "contentHash",
      ],
      "S1 parent terminal record",
    ),
    ...exactKeys(
      record?.actionValidation,
      ["validator", "status"],
      "S1 parent terminal action validation",
    ),
    ...exactKeys(
      record?.action,
      ["rationale", "clues"],
      "S1 parent terminal action",
    ),
  ];
  const { contentHash: recordedHash, ...source } = record;
  if (
    problems.length > 0 ||
    record.recordVersion !== CLUEGIVER_S1_PARENT_TERMINAL_RECORD_VERSION ||
    record.recordKind !== "cluegiver_parent_terminal" ||
    record.jobId !== parent.jobId ||
    record.cellId !== parent.cellId ||
    record.arm !== parent.arm ||
    record.terminalStatus !== "succeeded" ||
    record.actionValidation.validator !== "validateCluegiverS1Action" ||
    record.actionValidation.status !== "validated" ||
    contentHash(record.action) !== record.actionContentHash ||
    contentHash(source) !== recordedHash
  ) {
    throw new Error(
      "S1 child preparation requires the exact hash-bound succeeded parent terminal record",
    );
  }
  const actionProblems = validateCluegiverS1Action(
    record.action,
    parent.observation,
  );
  if (actionProblems.length > 0) {
    throw new Error(
      `S1 parent terminal record action failed validation: ${actionProblems.join("; ")}`,
    );
  }
}

declare const preparedDispatchArtifactBrand: unique symbol;
const mintedPreparedDispatchArtifacts = new WeakSet<object>();

interface PreparedProviderRequest<TPayload> {
  readonly provider: string;
  readonly model: string;
  readonly upstream: string | null;
  readonly upstreamOrder: readonly ["deepinfra"];
  readonly allowFallbacks: false;
  readonly requireParameters: true;
  readonly applicationEffort: "xhigh";
  readonly wireEffort: "max";
  readonly sampling: typeof CLUEGIVER_S1_SAMPLING_CONTRACT;
  readonly maxTokens: 65536;
  readonly maximumAttempts: 1;
  readonly warningMs: 300000;
  readonly hardStopMs: 600000;
  readonly payload: TPayload;
  readonly payloadContentHash: string;
}

interface PreparedDispatchBase<TKind extends string, TPayload> {
  readonly artifactVersion: typeof CLUEGIVER_S1_PREPARED_DISPATCH_VERSION;
  readonly artifactKind: TKind;
  readonly source: "fresh_compile_from_preregistered_observation";
  readonly jobId: string;
  readonly cellId: string;
  readonly arm: CluegiverS1Arm;
  readonly role: "cluegiver" | "teammate_decoder" | "opponent_interceptor";
  readonly routeContentHash: typeof CLUEGIVER_S1_ROUTE_PLAN_HASH;
  readonly executionPlanContentHash: string;
  readonly compiledPromptContentHash: string;
  readonly providerRequest: PreparedProviderRequest<TPayload>;
  readonly parentTerminalRecord: null | {
    readonly jobId: string;
    readonly actionContentHash: string;
    readonly terminalRecordContentHash: string;
  };
  readonly contentHash: string;
  readonly [preparedDispatchArtifactBrand]: true;
}

export type CluegiverS1PreparedParentDispatchArtifact = PreparedDispatchBase<
  "cluegiver_parent_dispatch",
  CluegiverS1ProviderPayload
>;

export type CluegiverS1PreparedAssessorDispatchArtifact = PreparedDispatchBase<
  "assessor_child_dispatch",
  CluegiverS1AssessorProviderPayload
> & {
  readonly materializedObservationContentHash: string;
  readonly placeholderIndependentContentHash: string;
};

export type CluegiverS1PreparedDispatchArtifact =
  | CluegiverS1PreparedParentDispatchArtifact
  | CluegiverS1PreparedAssessorDispatchArtifact;

export type CluegiverS1ProviderAdapter = (
  artifact: CluegiverS1PreparedDispatchArtifact,
) => Promise<unknown>;

function providerRequest<TPayload>(
  payload: TPayload,
): PreparedProviderRequest<TPayload> {
  return cloneAndDeepFreeze({
    provider: CLUEGIVER_S1_ROUTE_PLAN.requestedModel.provider,
    model: CLUEGIVER_S1_ROUTE_PLAN.requestedModel.model,
    upstream: CLUEGIVER_S1_ROUTE_PLAN.requestedModel.upstream ?? null,
    upstreamOrder: CLUEGIVER_S1_ROUTE_PLAN.route.upstreamOrder,
    allowFallbacks: CLUEGIVER_S1_ROUTE_PLAN.route.allowFallbacks,
    requireParameters: CLUEGIVER_S1_ROUTE_PLAN.route.requireParameters,
    applicationEffort: CLUEGIVER_S1_ROUTE_PLAN.reasoning.applicationEffort,
    wireEffort: CLUEGIVER_S1_ROUTE_PLAN.reasoning.wireEffort,
    sampling: CLUEGIVER_S1_SAMPLING_CONTRACT,
    maxTokens: CLUEGIVER_S1_MAX_TOKENS,
    maximumAttempts: CLUEGIVER_S1_ROUTE_PLAN.route.maximumAttempts,
    warningMs: CLUEGIVER_S1_WARNING_MS,
    hardStopMs: CLUEGIVER_S1_HARD_STOP_MS,
    payload,
    payloadContentHash: contentHash(payload),
  });
}

type PreparedParentDispatchArtifactSource = Omit<
  CluegiverS1PreparedParentDispatchArtifact,
  "contentHash" | typeof preparedDispatchArtifactBrand
>;

type PreparedAssessorDispatchArtifactSource = Omit<
  CluegiverS1PreparedAssessorDispatchArtifact,
  "contentHash" | typeof preparedDispatchArtifactBrand
>;

function mintPreparedDispatchArtifact(
  source:
    | PreparedParentDispatchArtifactSource
    | PreparedAssessorDispatchArtifactSource,
): CluegiverS1PreparedDispatchArtifact {
  const frozen = cloneAndDeepFreeze({
    ...source,
    contentHash: contentHash(source),
  });
  mintedPreparedDispatchArtifacts.add(frozen);
  return frozen as unknown as CluegiverS1PreparedDispatchArtifact;
}

export function verifyCluegiverS1PreparedDispatchArtifact(
  artifact: CluegiverS1PreparedDispatchArtifact,
): boolean {
  try {
    if (!mintedPreparedDispatchArtifacts.has(artifact)) return false;
    const { contentHash: recorded, ...source } = artifact;
    const artifactKeys =
      artifact.artifactKind === "cluegiver_parent_dispatch"
        ? [
            "artifactVersion",
            "artifactKind",
            "source",
            "jobId",
            "cellId",
            "arm",
            "role",
            "routeContentHash",
            "executionPlanContentHash",
            "compiledPromptContentHash",
            "providerRequest",
            "parentTerminalRecord",
            "contentHash",
          ]
        : [
            "artifactVersion",
            "artifactKind",
            "source",
            "jobId",
            "cellId",
            "arm",
            "role",
            "routeContentHash",
            "executionPlanContentHash",
            "compiledPromptContentHash",
            "materializedObservationContentHash",
            "placeholderIndependentContentHash",
            "providerRequest",
            "parentTerminalRecord",
            "contentHash",
          ];
    const requestProblems = exactKeys(
      artifact.providerRequest,
      [
        "provider",
        "model",
        "upstream",
        "upstreamOrder",
        "allowFallbacks",
        "requireParameters",
        "applicationEffort",
        "wireEffort",
        "sampling",
        "maxTokens",
        "maximumAttempts",
        "warningMs",
        "hardStopMs",
        "payload",
        "payloadContentHash",
      ],
      "S1 prepared provider request",
    );
    const payloadProblems = exactKeys(
      artifact.providerRequest.payload,
      artifact.artifactKind === "cluegiver_parent_dispatch"
        ? ["systemPrompt", "userPrompt"]
        : ["systemPrompt", "taskPrompt", "actionContract"],
      "S1 prepared provider payload",
    );
    return (
      exactKeys(artifact, artifactKeys, "S1 prepared dispatch artifact")
        .length === 0 &&
      requestProblems.length === 0 &&
      payloadProblems.length === 0 &&
      artifact.artifactVersion === CLUEGIVER_S1_PREPARED_DISPATCH_VERSION &&
      (artifact.artifactKind === "cluegiver_parent_dispatch" ||
        artifact.artifactKind === "assessor_child_dispatch") &&
      artifact.source === "fresh_compile_from_preregistered_observation" &&
      artifact.routeContentHash === CLUEGIVER_S1_ROUTE_PLAN_HASH &&
      artifact.executionPlanContentHash ===
        contentHash(CLUEGIVER_S1_JOB_EXECUTION_PLAN) &&
      artifact.providerRequest.payloadContentHash ===
        contentHash(artifact.providerRequest.payload) &&
      artifact.providerRequest.provider ===
        CLUEGIVER_S1_ROUTE_PLAN.requestedModel.provider &&
      artifact.providerRequest.model ===
        CLUEGIVER_S1_ROUTE_PLAN.requestedModel.model &&
      artifact.providerRequest.upstream ===
        (CLUEGIVER_S1_ROUTE_PLAN.requestedModel.upstream ?? null) &&
      canonicalJson(artifact.providerRequest.upstreamOrder) ===
        canonicalJson(CLUEGIVER_S1_ROUTE_PLAN.route.upstreamOrder) &&
      artifact.providerRequest.allowFallbacks === false &&
      artifact.providerRequest.requireParameters === true &&
      artifact.providerRequest.applicationEffort === "xhigh" &&
      artifact.providerRequest.wireEffort === "max" &&
      canonicalJson(artifact.providerRequest.sampling) ===
        canonicalJson(CLUEGIVER_S1_SAMPLING_CONTRACT) &&
      artifact.providerRequest.maxTokens === CLUEGIVER_S1_MAX_TOKENS &&
      artifact.providerRequest.maximumAttempts === 1 &&
      artifact.providerRequest.warningMs === CLUEGIVER_S1_WARNING_MS &&
      artifact.providerRequest.hardStopMs === CLUEGIVER_S1_HARD_STOP_MS &&
      (artifact.artifactKind === "cluegiver_parent_dispatch"
        ? artifact.role === "cluegiver" &&
          artifact.parentTerminalRecord === null
        : (artifact.role === "teammate_decoder" ||
            artifact.role === "opponent_interceptor") &&
          artifact.parentTerminalRecord !== null &&
          Object.isFrozen(artifact.parentTerminalRecord)) &&
      contentHash(source) === recorded &&
      Object.isFrozen(artifact) &&
      Object.isFrozen(artifact.providerRequest) &&
      Object.isFrozen(artifact.providerRequest.sampling) &&
      Object.isFrozen(artifact.providerRequest.payload)
    );
  } catch {
    return false;
  }
}

function assertMaterializedProjection(
  template: DecryptoObservationV2,
  materialized: DecryptoObservationV2,
  parentAction: CluegiverS1ParentTerminalRecord["action"],
): void {
  const { contentHash: _templateHash, ...templateSource } = template;
  const { contentHash: _materializedHash, ...materializedSource } =
    materialized;
  const expected =
    template.role === "decoder"
      ? { ...templateSource, ownClues: [...parentAction.clues] }
      : { ...templateSource, opponentClues: [...parentAction.clues] };
  if (canonicalJson(expected) !== canonicalJson(materializedSource)) {
    throw new Error(
      "S1 materialized assessor observation must differ only by the projected parent clue triple",
    );
  }
}

export function assertCluegiverS1PreregistrationDispatchContracts(
  preregistration: CluegiverS1DispatchPreregistration,
): void {
  const { preregistrationContentHash, ...source } = preregistration;
  if (
    contentHash(source) !== preregistrationContentHash ||
    canonicalJson(
      preregistration.implementationBindings.executionPreparationImplementation,
    ) !==
      canonicalJson(CLUEGIVER_S1_EXECUTION_PREPARATION_IMPLEMENTATION_SOURCE) ||
    canonicalJson(
      preregistration.implementationBindings.reviewedBotBuildIdentitySource,
    ) !== canonicalJson(CLUEGIVER_S1_REVIEWED_BOTBUILD_IDENTITY_SOURCE) ||
    preregistration.execution.executorContract.contentHash !==
      CLUEGIVER_S1_EXECUTOR_CONTRACT.contentHash
  ) {
    throw new Error(
      "S1 dispatch preparation requires the exact implementation-bound preregistration",
    );
  }
  if (
    exactKeys(
      preregistration.invariants,
      Object.keys(CLUEGIVER_S1_DISPATCH_INVARIANTS),
      "S1 dispatch invariants",
    ).length > 0 ||
    canonicalJson(preregistration.invariants) !==
      canonicalJson(CLUEGIVER_S1_DISPATCH_INVARIANTS)
  ) {
    throw new Error(
      "S1 dispatch preparation requires the exact reviewed dispatch invariants",
    );
  }
  if (
    exactKeys(
      preregistration.botBuilds,
      ["assessor", "cluegiverByArm"],
      "S1 BotBuild set",
    ).length > 0 ||
    exactKeys(
      preregistration.botBuilds.cluegiverByArm,
      [CLUEGIVER_S1_C0_ARM, CLUEGIVER_S1_C1_ARM],
      "S1 cluegiver BotBuild arms",
    ).length > 0 ||
    canonicalJson({
      id: preregistration.botBuilds.assessor.id,
      contentHash: preregistration.botBuilds.assessor.contentHash,
    }) !== canonicalJson(CLUEGIVER_S1_REVIEWED_BOTBUILD_IDENTITIES.assessor) ||
    canonicalJson({
      id: preregistration.botBuilds.cluegiverByArm[CLUEGIVER_S1_C0_ARM].id,
      contentHash:
        preregistration.botBuilds.cluegiverByArm[CLUEGIVER_S1_C0_ARM]
          .contentHash,
    }) !==
      canonicalJson(
        CLUEGIVER_S1_REVIEWED_BOTBUILD_IDENTITIES.cluegiverByArm[
          CLUEGIVER_S1_C0_ARM
        ],
      ) ||
    canonicalJson({
      id: preregistration.botBuilds.cluegiverByArm[CLUEGIVER_S1_C1_ARM].id,
      contentHash:
        preregistration.botBuilds.cluegiverByArm[CLUEGIVER_S1_C1_ARM]
          .contentHash,
    }) !==
      canonicalJson(
        CLUEGIVER_S1_REVIEWED_BOTBUILD_IDENTITIES.cluegiverByArm[
          CLUEGIVER_S1_C1_ARM
        ],
      ) ||
    !verifyBotBuildManifest(preregistration.botBuilds.assessor) ||
    !verifyCluegiverBotBuildManifest(
      preregistration.botBuilds.cluegiverByArm[CLUEGIVER_S1_C0_ARM],
    ) ||
    !verifyCluegiverBotBuildManifest(
      preregistration.botBuilds.cluegiverByArm[CLUEGIVER_S1_C1_ARM],
    ) ||
    canonicalJson({
      id: preregistration.implementationBindings.cluegiverPromptCompiler.id,
      contentHash:
        preregistration.implementationBindings.cluegiverPromptCompiler
          .contentHash,
    }) !==
      canonicalJson(
        CLUEGIVER_S1_REVIEWED_JOB_IDENTITIES.cluegiverPromptCompiler,
      )
  ) {
    throw new Error(
      `S1 dispatch preparation requires exact reviewed full BotBuild identities before compilation; received assessor=${preregistration.botBuilds.assessor.contentHash}, c0=${preregistration.botBuilds.cluegiverByArm[CLUEGIVER_S1_C0_ARM].contentHash}, c1=${preregistration.botBuilds.cluegiverByArm[CLUEGIVER_S1_C1_ARM].contentHash}`,
    );
  }
  assertCanonicalRouteAndExecution(preregistration);
  assertCanonicalCellGraph(preregistration);
  for (const job of preregistration.dag.jobs) {
    findCanonicalJob(preregistration, job.jobId);
  }
  if (
    cluegiverS1ProviderVisiblePromptProjectionHash(preregistration) !==
    CLUEGIVER_S1_REVIEWED_PROVIDER_VISIBLE_PROMPT_PROJECTION_HASH
  ) {
    throw new Error(
      "S1 freshly recomputed provider-visible prompt projection drifted from the reviewed constant",
    );
  }
}

export function prepareCluegiverS1Dispatch(input: {
  readonly preregistration: CluegiverS1DispatchPreregistration;
  readonly jobId: string;
  readonly parentTerminalRecord?: CluegiverS1ParentTerminalRecord;
}): CluegiverS1PreparedDispatchArtifact {
  const { preregistration, jobId } = input;
  assertCluegiverS1PreregistrationDispatchContracts(preregistration);
  const job = findCanonicalJob(preregistration, jobId);
  if (job.role === "cluegiver") {
    if (input.parentTerminalRecord !== undefined) {
      throw new Error(
        "S1 cluegiver parent preparation cannot consume a parent terminal record",
      );
    }
    const compiled = assertParentPromptHashes(job, preregistration);
    const payload = cluegiverS1ProviderPayload(compiled);
    const artifact = mintPreparedDispatchArtifact({
      artifactVersion: CLUEGIVER_S1_PREPARED_DISPATCH_VERSION,
      artifactKind: "cluegiver_parent_dispatch",
      source: "fresh_compile_from_preregistered_observation",
      jobId: job.jobId,
      cellId: job.cellId,
      arm: job.arm,
      role: job.role,
      routeContentHash: CLUEGIVER_S1_ROUTE_PLAN_HASH,
      executionPlanContentHash: contentHash(CLUEGIVER_S1_JOB_EXECUTION_PLAN),
      compiledPromptContentHash: compiled.contentHash,
      providerRequest: providerRequest(payload),
      parentTerminalRecord: null,
    });
    if (!verifyCluegiverS1PreparedDispatchArtifact(artifact)) {
      throw new Error(
        "S1 prepared parent dispatch artifact failed verification",
      );
    }
    return artifact;
  }

  if (input.parentTerminalRecord === undefined) {
    throw new Error(
      "S1 child preparation requires one hash-bound parent terminal record",
    );
  }
  const parent = preregistration.dag.jobs.find(
    (candidate) => candidate.jobId === job.parentJobId,
  );
  if (parent?.role !== "cluegiver") {
    throw new Error("S1 child preparation requires its exact cluegiver parent");
  }
  verifyParentTerminalRecord(input.parentTerminalRecord, parent);
  const compiledTemplate = assertTemplateHashes(job, preregistration);
  const materialized = materializeAssessorObservationFromParentAction(
    job.blindedInput.observationTemplate,
    input.parentTerminalRecord.action,
    preregistration.botBuilds.assessor,
  );
  assertMaterializedProjection(
    job.blindedInput.observationTemplate,
    materialized,
    input.parentTerminalRecord.action,
  );
  const compiled = compileCluegiverS1AssessorPrompt(
    materialized,
    preregistration.botBuilds.assessor,
  );
  const payload = cluegiverS1AssessorProviderPayload(compiled);
  const placeholderIndependentContentHash =
    cluegiverS1AssessorPlaceholderIndependentContentHash(compiled);
  if (
    placeholderIndependentContentHash !==
      job.compiledPromptTemplate.placeholderIndependentContentHash ||
    placeholderIndependentContentHash !==
      cluegiverS1AssessorPlaceholderIndependentContentHash(compiledTemplate) ||
    !verifyCompiledJointAssignmentDecoderPrompt(compiled, materialized)
  ) {
    throw new Error(
      "S1 materialized assessor prompt failed placeholder-independent or full verification",
    );
  }
  const artifact = mintPreparedDispatchArtifact({
    artifactVersion: CLUEGIVER_S1_PREPARED_DISPATCH_VERSION,
    artifactKind: "assessor_child_dispatch",
    source: "fresh_compile_from_preregistered_observation",
    jobId: job.jobId,
    cellId: job.cellId,
    arm: job.arm,
    role: job.role,
    routeContentHash: CLUEGIVER_S1_ROUTE_PLAN_HASH,
    executionPlanContentHash: contentHash(CLUEGIVER_S1_JOB_EXECUTION_PLAN),
    compiledPromptContentHash: compiled.contentHash,
    materializedObservationContentHash: materialized.contentHash,
    placeholderIndependentContentHash,
    providerRequest: providerRequest(payload),
    parentTerminalRecord: {
      jobId: input.parentTerminalRecord.jobId,
      actionContentHash: input.parentTerminalRecord.actionContentHash,
      terminalRecordContentHash: input.parentTerminalRecord.contentHash,
    },
  });
  if (!verifyCluegiverS1PreparedDispatchArtifact(artifact)) {
    throw new Error(
      "S1 prepared assessor dispatch artifact failed verification",
    );
  }
  return artifact;
}

export interface CluegiverS1ReceiptSourceIdentities {
  readonly exactTable7ddeRange: SourceByteIdentity & {
    readonly extractedInstructionSha256: string;
  };
  readonly experimentCompilerImplementation: SourceByteIdentity;
  readonly executionPreparationImplementation: SourceByteIdentity;
  readonly reviewedBotBuildIdentitySource: SourceByteIdentity;
  readonly jointAssignmentCompilerImplementation: SourceByteIdentity;
  readonly sharedCluegiverObservationImplementation: SourceByteIdentity;
  readonly sharedCluegiverBuildImplementation: SourceByteIdentity;
  readonly historicalReceiptV02: SourceByteIdentity;
}

export interface CluegiverS1DryRunReceipt {
  readonly receiptVersion: typeof CLUEGIVER_S1_RECEIPT_VERSION;
  readonly recordedOn: "2026-08-02";
  readonly status: string;
  readonly baseCommit: string;
  readonly reviewedPreregistrationParentCommit: string;
  readonly fixtureVersion: string;
  readonly fixtureContentHash: string;
  readonly exactTableSourceRangeSha256: string;
  readonly extractedInstructionSha256: string;
  readonly compilerImplementationSha256: string;
  readonly compilerIdentityHash: string;
  readonly executionPreparationImplementationSha256: string;
  readonly reviewedBotBuildIdentitySourceSha256: string;
  readonly assessorBotBuildContentHash: string;
  readonly cluegiverC0BotBuildContentHash: string;
  readonly cluegiverC1BotBuildContentHash: string;
  readonly jointAssignmentImplementationSha256: string;
  readonly jointAssignmentCompilerContractHash: string;
  readonly reviewedCluegiverObservationSourceSha256: string;
  readonly reviewedCluegiverBuildSourceSha256: string;
  readonly historicalReceiptV02BytesSha256: string;
  readonly routePlanHash: string;
  readonly orchestrationPolicyHash: string;
  readonly executorContractHash: string;
  readonly maxTokens: 65536;
  readonly concurrency: 4;
  readonly providerVisiblePromptProjectionHash: string;
  readonly preregistrationContentHash: string;
  readonly cellsContentHash: string;
  readonly jobsContentHash: string;
  readonly jobIdsContentHash: string;
  readonly firstJobId: string;
  readonly lastJobId: string;
  readonly cellCount: number;
  readonly jobCount: number;
  readonly providerCallsThisRun: 0;
  readonly integrationGate: string;
  readonly reviewedContractCommit: string;
  readonly contentHash: string;
}

export function buildCluegiverS1DryRunReceipt(
  preregistration: CluegiverS1DispatchPreregistration & {
    readonly status: string;
    readonly baseCommit: string;
    readonly amendmentProvenance: {
      readonly reviewedPreregistrationParentCommit: string;
    };
    readonly fixture: {
      readonly version: string;
      readonly contentHash: string;
    };
    readonly integrationGate: {
      readonly status: string;
      readonly reviewedContractCommit: string;
    };
    readonly implementationBindings: CluegiverS1DispatchPreregistration["implementationBindings"] & {
      readonly jointAssignmentPromptCompilerContract: ContentIdentityRef;
      readonly sourceBytes: CluegiverS1ReceiptSourceIdentities;
    };
    readonly invariants: {
      readonly providerVisiblePromptProjectionHash: string;
    };
  },
  sources: CluegiverS1ReceiptSourceIdentities,
): CluegiverS1DryRunReceipt {
  const jobs = preregistration.dag.jobs;
  const cells = preregistration.dag.cells;
  if (
    jobs.length === 0 ||
    cells.length === 0 ||
    canonicalJson(sources) !==
      canonicalJson(preregistration.implementationBindings.sourceBytes) ||
    canonicalJson(sources.executionPreparationImplementation) !==
      canonicalJson(CLUEGIVER_S1_EXECUTION_PREPARATION_IMPLEMENTATION_SOURCE) ||
    canonicalJson(sources.reviewedBotBuildIdentitySource) !==
      canonicalJson(CLUEGIVER_S1_REVIEWED_BOTBUILD_IDENTITY_SOURCE) ||
    sources.historicalReceiptV02.sha256 !==
      CLUEGIVER_S1_HISTORICAL_V02_RECEIPT_BYTES_SHA256
  ) {
    throw new Error(
      "S1 dry-run receipt requires exact manifest-matched source and historical receipt identities",
    );
  }
  assertCluegiverS1PreregistrationDispatchContracts(preregistration);
  const source: Omit<CluegiverS1DryRunReceipt, "contentHash"> = {
    receiptVersion: CLUEGIVER_S1_RECEIPT_VERSION,
    recordedOn: "2026-08-02",
    status: preregistration.status,
    baseCommit: preregistration.baseCommit,
    reviewedPreregistrationParentCommit:
      preregistration.amendmentProvenance.reviewedPreregistrationParentCommit,
    fixtureVersion: preregistration.fixture.version,
    fixtureContentHash: preregistration.fixture.contentHash,
    exactTableSourceRangeSha256: sources.exactTable7ddeRange.sha256,
    extractedInstructionSha256:
      sources.exactTable7ddeRange.extractedInstructionSha256,
    compilerImplementationSha256:
      sources.experimentCompilerImplementation.sha256,
    compilerIdentityHash:
      preregistration.implementationBindings.cluegiverPromptCompiler
        .contentHash,
    executionPreparationImplementationSha256:
      sources.executionPreparationImplementation.sha256,
    reviewedBotBuildIdentitySourceSha256:
      sources.reviewedBotBuildIdentitySource.sha256,
    assessorBotBuildContentHash: preregistration.botBuilds.assessor.contentHash,
    cluegiverC0BotBuildContentHash:
      preregistration.botBuilds.cluegiverByArm[CLUEGIVER_S1_C0_ARM].contentHash,
    cluegiverC1BotBuildContentHash:
      preregistration.botBuilds.cluegiverByArm[CLUEGIVER_S1_C1_ARM].contentHash,
    jointAssignmentImplementationSha256:
      sources.jointAssignmentCompilerImplementation.sha256,
    jointAssignmentCompilerContractHash:
      preregistration.implementationBindings
        .jointAssignmentPromptCompilerContract.contentHash,
    reviewedCluegiverObservationSourceSha256:
      sources.sharedCluegiverObservationImplementation.sha256,
    reviewedCluegiverBuildSourceSha256:
      sources.sharedCluegiverBuildImplementation.sha256,
    historicalReceiptV02BytesSha256: sources.historicalReceiptV02.sha256,
    routePlanHash: contentHash(preregistration.route),
    orchestrationPolicyHash:
      preregistration.botBuilds.assessor.execution.orchestrationPolicy
        .contentHash,
    executorContractHash:
      preregistration.execution.executorContract.contentHash,
    maxTokens: preregistration.execution.maxTokensPerJob,
    concurrency: preregistration.execution.concurrency,
    providerVisiblePromptProjectionHash:
      preregistration.invariants.providerVisiblePromptProjectionHash,
    preregistrationContentHash: preregistration.preregistrationContentHash,
    cellsContentHash: contentHash(cells),
    jobsContentHash: contentHash(jobs),
    jobIdsContentHash: contentHash(jobs.map((job) => job.jobId)),
    firstJobId: jobs[0]!.jobId,
    lastJobId: jobs[jobs.length - 1]!.jobId,
    cellCount: cells.length,
    jobCount: jobs.length,
    providerCallsThisRun: preregistration.execution.providerCallsThisRun,
    integrationGate: preregistration.integrationGate.status,
    reviewedContractCommit:
      preregistration.integrationGate.reviewedContractCommit,
  };
  return cloneAndDeepFreeze({
    ...source,
    contentHash: contentHash(source),
  });
}

export function renderCluegiverS1DryRunReceipt(
  receipt: CluegiverS1DryRunReceipt,
): string {
  return `${JSON.stringify(receipt, null, 2)}\n`;
}

export const CLUEGIVER_S1_SUPPORTED_ARMS = cloneAndDeepFreeze([
  CLUEGIVER_S1_C0_ARM,
  CLUEGIVER_S1_C1_ARM,
] as const);
