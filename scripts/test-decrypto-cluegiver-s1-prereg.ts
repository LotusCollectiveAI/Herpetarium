/**
 * Adversarial provider-free tests for the corrected S1 preregistration.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CIPHER_ENCRYPT_CANDIDATE_POLICY_ARTIFACT,
  CROSS_ROUND_COLUMN_LEAK_BLUE_2026_08_01,
  CROSS_ROUND_COLUMN_LEAK_2026_08_01,
  CROSS_ROUND_PRODUCTION_SMOKE_EVENT_PROVENANCE_2026_08_01,
  JOINT_ASSIGNMENT_DECODER_COMPILER_HASH,
  JOINT_ASSIGNMENT_DECODER_COMPILER_ID,
  JOINT_ASSIGNMENT_DECODER_POLICY_ARTIFACT,
  canonicalJson,
  cloneAndDeepFreeze,
  contentHash,
  sha256Hex,
  validateCluegiverDecisionContext,
  validateCluegiverObservation,
  validateGuessDecisionContext,
  validateJointAssignmentAction,
  verifyBotBuildManifest,
  verifyCluegiverBotBuildManifest,
  verifyCluegiverObservation,
  verifyCompiledJointAssignmentDecoderPrompt,
  verifyObservationV2,
  type CluegiverBotBuildManifest,
  type DecryptoCluegiverObservation,
  type DecryptoObservationV2,
} from "@shared/substrate";
import {
  CLUEGIVER_S1_C0_ARM,
  CLUEGIVER_S1_C0_POLICY,
  CLUEGIVER_S1_C0_SOURCE_INSTRUCTION,
  CLUEGIVER_S1_C0_SOURCE_INSTRUCTION_SHA256,
  CLUEGIVER_S1_C1_ARM,
  CLUEGIVER_S1_EXPLICIT_CANDIDATE_BLOCK,
  CLUEGIVER_S1_LEDGER_SOURCE,
  CLUEGIVER_S1_RESERVED_C2_ARM,
  CLUEGIVER_S1_RUNTIME_IMPLEMENTATION_SOURCE,
  CLUEGIVER_S1_SOURCE_RANGE_FIXTURE,
  assertCluegiverS1ProviderPayload,
  candidateBlockRemovedPromptSha256,
  compileCluegiverS1Prompt,
  composeCluegiverS1Carrier,
  cluegiverS1ProviderPayload,
  removeExplicitCandidateBlock,
  validateCluegiverS1Action,
  verifyCluegiverS1CompilerIdentity,
  type CluegiverS1ProviderPayload,
} from "./lib/decrypto-cluegiver-s1-policies";
import type { CluegiverS1PreparedDispatchArtifact } from "./lib/decrypto-cluegiver-s1-execution-preparation";

let assertions = 0;

function ok(value: unknown, message: string): asserts value {
  assert.ok(value, message);
  assertions += 1;
}

function equal<T>(actual: T, expected: T, message: string): void {
  assert.equal(actual, expected, message);
  assertions += 1;
}

function deepEqual(actual: unknown, expected: unknown, message: string): void {
  assert.deepEqual(actual, expected, message);
  assertions += 1;
}

function throws(
  action: () => unknown,
  expected: RegExp,
  message: string,
): void {
  assert.throws(action, expected, message);
  assertions += 1;
}

async function rejects(
  action: () => Promise<unknown>,
  expected: RegExp,
  message: string,
): Promise<void> {
  await assert.rejects(action, expected, message);
  assertions += 1;
}

function count(text: string, needle: string): number {
  return text.split(needle).length - 1;
}

function recomputeHash<T>(
  value: T,
  key: "contentHash" | "preregistrationContentHash",
): T {
  const record = value as Record<string, unknown>;
  const source = Object.fromEntries(
    Object.entries(record).filter(([entryKey]) => entryKey !== key),
  );
  record[key] = contentHash(source);
  return value;
}

function recomputeBotBuildHash<T>(value: T): T {
  const record = value as Record<string, unknown>;
  const source = Object.fromEntries(
    Object.entries(record).filter(
      ([entryKey]) => entryKey !== "id" && entryKey !== "contentHash",
    ),
  );
  record.contentHash = contentHash(source);
  return value;
}

const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(moduleDirectory, "..");
const fixturePath = resolve(
  moduleDirectory,
  "fixtures/decrypto-cluegiver-s1-positions-v0.2.json",
);
const receiptPath = resolve(
  moduleDirectory,
  "fixtures/decrypto-cluegiver-s1-prereg-dry-run-receipt-v0.4.json",
);
const historicalV02ReceiptPath = resolve(
  moduleDirectory,
  "fixtures/decrypto-cluegiver-s1-prereg-dry-run-receipt-v0.2.json",
);
const sourceRangePath = resolve(
  repositoryRoot,
  CLUEGIVER_S1_SOURCE_RANGE_FIXTURE.path,
);

const originalFetch = globalThis.fetch;
const originalCredentialSentinels = {
  openrouter: process.env.OPENROUTER_API_KEY,
  deepseek: process.env.DEEPSEEK_API_KEY,
  anthropic: process.env.ANTHROPIC_API_KEY,
  openai: process.env.OPENAI_API_KEY,
};
let networkInvocations = 0;
globalThis.fetch = (async () => {
  networkInvocations += 1;
  throw new Error("network/provider invocation is forbidden in this test");
}) as typeof fetch;
process.env.OPENROUTER_API_KEY = "sentinel-openrouter-never-read";
process.env.DEEPSEEK_API_KEY = "sentinel-deepseek-never-read";
process.env.ANTHROPIC_API_KEY = "sentinel-anthropic-never-read";
process.env.OPENAI_API_KEY = "sentinel-openai-never-read";

try {
  const bench = await import("./run-decrypto-cluegiver-s1-prereg");
  const fixture = await bench.loadCluegiverS1Fixture();
  const sources = await bench.loadCluegiverS1SourceIdentities();
  const manifest = await bench.buildCluegiverS1Preregistration(
    fixture,
    sources,
  );

  equal(
    networkInvocations,
    0,
    "imports, source reads, and manifest construction invoke no network",
  );
  deepEqual(
    bench.validateCluegiverS1Fixture(fixture),
    [],
    "role-complete fixed fixture validates",
  );
  equal(
    fixture.fixtureVersion,
    "decrypto-cluegiver-s1-positions@0.2.0",
    "fixture schema and truthful v0.2 filename align",
  );
  equal(
    fixture.contentHash,
    "53dd8478fb38e6dfbc4f158c53ae42dc09e32d56a04062211f0089245560aae1",
    "fixture canonical content hash is pinned",
  );
  const fixtureWithoutHash = Object.fromEntries(
    Object.entries(fixture).filter(([key]) => key !== "contentHash"),
  );
  equal(
    fixture.contentHash,
    contentHash(fixtureWithoutHash),
    "fixture self-hash binds every source field",
  );
  const tamperedFixture = structuredClone(fixture);
  tamperedFixture.positions[0]!.currentOpponent.clues[0] = "changed";
  ok(
    bench
      .validateCluegiverS1Fixture(tamperedFixture)
      .some((problem) => problem.includes("contentHash")),
    "fixture tampering fails the canonical hash",
  );
  const extraFieldFixture = structuredClone(fixture) as unknown as {
    positions: Array<Record<string, unknown>>;
  };
  extraFieldFixture.positions[0]!.inventedReasoning = "forbidden";
  ok(
    bench
      .validateCluegiverS1Fixture(extraFieldFixture)
      .some((problem) => problem.includes('unknown field "inventedReasoning"')),
    "fixture rejects invented fields",
  );

  equal(fixture.positions.length, 4, "fixture has exactly four positions");
  deepEqual(
    fixture.positions.map((position) => position.focal.team),
    ["red", "blue", "red", "blue"],
    "focal sides are balanced two red and two blue",
  );
  for (const [index, position] of fixture.positions.entries()) {
    equal(
      position.roundNumber,
      2,
      `position ${index + 1} is a complete round-two position`,
    );
    equal(
      position.focal.actor.seatRole,
      "agent_b",
      `position ${index + 1} uses the role-legal round-two cluegiver`,
    );
    equal(
      position.resolvedRoundOne.own.intercept,
      null,
      `position ${index + 1} own round-one intercept is null`,
    );
    equal(
      position.resolvedRoundOne.opponent.intercept,
      null,
      `position ${index + 1} opponent round-one intercept is null`,
    );
    deepEqual(
      position.transcript,
      [],
      `position ${index + 1} does not invent dialogue`,
    );
    equal(
      position.provenance.humanReasoningPathKnown,
      false,
      `position ${index + 1} does not invent human reasoning`,
    );
  }

  const production = fixture.positions[0]!;
  equal(
    production.gameId,
    CROSS_ROUND_PRODUCTION_SMOKE_EVENT_PROVENANCE_2026_08_01.gameId,
    "production anchor game ID is exact",
  );
  deepEqual(
    production.focal.ownKeywords,
    [...CROSS_ROUND_COLUMN_LEAK_2026_08_01.ownKeywords],
    "production Red keywords are exact shared-fixture fields",
  );
  deepEqual(
    production.resolvedRoundOne.own.clues,
    [...CROSS_ROUND_COLUMN_LEAK_2026_08_01.resolvedRounds[0].clues],
    "production Red round-one clues are exact",
  );
  deepEqual(
    production.resolvedRoundOne.own.code,
    [...CROSS_ROUND_COLUMN_LEAK_2026_08_01.resolvedRounds[0].code],
    "production Red round-one code is exact",
  );
  deepEqual(
    production.focal.code,
    [...CROSS_ROUND_COLUMN_LEAK_2026_08_01.leakingRound.code],
    "production Red focal round-two code is exact",
  );
  deepEqual(
    production.resolvedRoundOne.opponent.clues,
    [...CROSS_ROUND_COLUMN_LEAK_BLUE_2026_08_01.resolvedRounds[0].clues],
    "fixed Blue public round-one clue state is exact",
  );
  deepEqual(
    production.resolvedRoundOne.opponent.code,
    [...CROSS_ROUND_COLUMN_LEAK_BLUE_2026_08_01.resolvedRounds[0].code],
    "fixed Blue public round-one code is exact",
  );
  deepEqual(
    production.currentOpponent.clues,
    [...CROSS_ROUND_COLUMN_LEAK_BLUE_2026_08_01.leakingRound.clues],
    "fixed Blue current clue triple is exact",
  );
  deepEqual(
    production.currentOpponent.code,
    [...CROSS_ROUND_COLUMN_LEAK_BLUE_2026_08_01.leakingRound.code],
    "fixed Blue current code is exact",
  );
  deepEqual(
    production.provenance.fieldAuthorities.syntheticScaffoldFields,
    [
      "positionId",
      "roundNumber",
      "focal.actor",
      "focal.teammateDecoder",
      "opponent.currentCluegiverSeatId",
      "opponent.interceptor",
      "teamChatVisibility",
      "transcript",
    ],
    "synthetic actor, seat, and harness fields are explicitly labeled",
  );
  deepEqual(
    production.provenance.sourceRefs,
    [
      {
        id: "CROSS_ROUND_COLUMN_LEAK_2026_08_01",
        contentHash: contentHash(CROSS_ROUND_COLUMN_LEAK_2026_08_01),
      },
      {
        id: "CROSS_ROUND_COLUMN_LEAK_BLUE_2026_08_01",
        contentHash: contentHash(CROSS_ROUND_COLUMN_LEAK_BLUE_2026_08_01),
      },
      {
        id: "CROSS_ROUND_PRODUCTION_SMOKE_EVENT_PROVENANCE_2026_08_01",
        contentHash: contentHash(
          CROSS_ROUND_PRODUCTION_SMOKE_EVENT_PROVENANCE_2026_08_01,
        ),
      },
    ],
    "production named-source references are content-addressed",
  );

  const sourceRangeBytes = await readFile(sourceRangePath, "utf8");
  equal(
    sha256Hex(sourceRangeBytes),
    "6c0b3c37489e6b428b983b3bd18987cd1b915d77bc9001db1a37bfdcf0a5c645",
    "exact checked-in Table 7dde source-range bytes are pinned",
  );
  equal(
    Buffer.byteLength(sourceRangeBytes, "utf8"),
    3071,
    "exact source-range byte length is pinned",
  );
  const extractedInstruction =
    bench.extractTable7ddeInstructionFromSourceRange(sourceRangeBytes);
  equal(
    extractedInstruction,
    CLUEGIVER_S1_C0_SOURCE_INSTRUCTION,
    "mechanical source-range extraction reconstructs exact C0 instruction",
  );
  equal(
    sha256Hex(extractedInstruction),
    CLUEGIVER_S1_C0_SOURCE_INSTRUCTION_SHA256,
    "mechanically extracted instruction SHA is pinned",
  );
  throws(
    () =>
      bench.extractTable7ddeInstructionFromSourceRange(
        sourceRangeBytes.replace("Cipher Relay.", String.raw`Cipher\\ Relay.`),
      ),
    /rejects escaped string syntax/,
    "mechanical extractor fails closed on unreviewed escape syntax",
  );
  equal(
    sources.experimentCompilerImplementation.sha256,
    CLUEGIVER_S1_RUNTIME_IMPLEMENTATION_SOURCE.sha256,
    "cluegiver renderer/system/helper implementation bytes are pinned",
  );
  deepEqual(
    sources.experimentCompilerImplementation,
    CLUEGIVER_S1_RUNTIME_IMPLEMENTATION_SOURCE,
    "runner and compiler independently resolve the same loaded source bytes",
  );
  equal(
    sources.jointAssignmentCompilerImplementation.sha256,
    bench.CLUEGIVER_S1_EXPECTED_JOINT_ASSIGNMENT_SOURCE_SHA256,
    "shared assessor compiler implementation bytes are pinned",
  );
  equal(
    sources.sharedActionsImplementation.sha256,
    bench.CLUEGIVER_S1_EXPECTED_ACTIONS_SOURCE_SHA256,
    "shared action-validator implementation bytes are pinned",
  );
  equal(
    sources.sharedCluegiverObservationImplementation.sha256,
    bench.CLUEGIVER_S1_REVIEWED_CLUEGIVER_OBSERVATION_SHA256,
    "actual shared cluegiver observation implementation bytes are loaded and pinned",
  );
  equal(
    sources.sharedCluegiverBuildImplementation.sha256,
    bench.CLUEGIVER_S1_REVIEWED_CLUEGIVER_BUILD_SHA256,
    "actual shared cluegiver BotBuild implementation bytes are loaded and pinned",
  );
  deepEqual(
    sources.executionPreparationImplementation,
    bench.CLUEGIVER_S1_EXECUTION_PREPARATION_IMPLEMENTATION_SOURCE,
    "job IDs, terminal validation, dispatch preparation, artifact construction, and receipt bytes share one exact source identity",
  );
  deepEqual(
    sources.reviewedBotBuildIdentitySource,
    bench.CLUEGIVER_S1_REVIEWED_BOTBUILD_IDENTITY_SOURCE,
    "reviewed full BotBuild pins are loaded from their exact independently bound source bytes",
  );
  const historicalV02ReceiptBytes = await readFile(
    historicalV02ReceiptPath,
    "utf8",
  );
  equal(
    sha256Hex(historicalV02ReceiptBytes),
    "181fd6f3c1d40d7722018cecf181838d366f8c97062a7cbbe8484c4eb3c936b2",
    "historical v0.2 receipt raw bytes remain immutable",
  );
  deepEqual(
    sources.historicalReceiptV02,
    {
      path: "scripts/fixtures/decrypto-cluegiver-s1-prereg-dry-run-receipt-v0.2.json",
      sha256:
        "181fd6f3c1d40d7722018cecf181838d366f8c97062a7cbbe8484c4eb3c936b2",
      bytes: Buffer.byteLength(historicalV02ReceiptBytes, "utf8"),
    },
    "loaded source identities bind the historical receipt as raw bytes",
  );
  const forgedExecutionSources = structuredClone(sources);
  (
    forgedExecutionSources.executionPreparationImplementation as {
      sha256: string;
    }
  ).sha256 = "0".repeat(64);
  await rejects(
    () =>
      bench.buildCluegiverS1Preregistration(fixture, forgedExecutionSources),
    /exact execution-preparation implementation bytes/,
    "manifest construction rejects a forged execution-preparation source identity",
  );
  const forgedBotBuildPinSources = structuredClone(sources);
  (
    forgedBotBuildPinSources.reviewedBotBuildIdentitySource as {
      sha256: string;
    }
  ).sha256 = "0".repeat(64);
  await rejects(
    () =>
      bench.buildCluegiverS1Preregistration(fixture, forgedBotBuildPinSources),
    /exact implementation-bound preregistration/,
    "manifest construction rejects forged reviewed-BotBuild-pin source bytes",
  );
  const compilerBinding = bench.mintCluegiverS1CompilerBinding(sources);
  ok(
    verifyCluegiverS1CompilerIdentity(compilerBinding),
    "cluegiver compiler identity verifies its spec and exact implementation bytes",
  );
  const compilerWithoutHash = Object.fromEntries(
    Object.entries(compilerBinding).filter(([key]) => key !== "contentHash"),
  );
  equal(
    compilerBinding.contentHash,
    contentHash(compilerWithoutHash),
    "compiler content identity binds implementation bytes",
  );
  const forgedCompiler = structuredClone(compilerBinding);
  (
    forgedCompiler as unknown as {
      implementationSource: { sha256: string };
    }
  ).implementationSource.sha256 = "0".repeat(64);
  const { contentHash: _forgedCompilerHash, ...forgedCompilerSource } =
    forgedCompiler;
  (forgedCompiler as unknown as { contentHash: string }).contentHash =
    contentHash(forgedCompilerSource);
  equal(
    verifyCluegiverS1CompilerIdentity(forgedCompiler),
    false,
    "even a hash-consistent forged compiler implementation fails closed against loaded bytes",
  );

  equal(
    CLUEGIVER_S1_C0_POLICY.comparisonStatus,
    "not_claimed_synthetic_recombination",
    "C0 is truthfully labeled synthetic recombination",
  );
  ok(
    CLUEGIVER_S1_C0_SOURCE_INSTRUCTION.includes(
      "Silently generate and compare multiple candidates",
    ) &&
      CLUEGIVER_S1_C0_SOURCE_INSTRUCTION.includes(
        "inspect resolved history for number-pattern leakage",
      ),
    "C0 exact old instruction already contains implicit strategy/history language",
  );
  ok(
    !CLUEGIVER_S1_C0_SOURCE_INSTRUCTION.includes(
      "(d) once a round resolves its code is public",
    ),
    "b41 integrated instruction is not substituted for C0",
  );
  equal(
    CLUEGIVER_S1_LEDGER_SOURCE.provenanceRole,
    "metadata_only_not_runtime_byte_authority",
    "b41 ledger provenance pin is explicitly metadata-only",
  );
  equal(
    CLUEGIVER_S1_LEDGER_SOURCE.runtimeAuthority,
    "local_compiler_implementation_and_shared_buildPublicClueLedger",
    "local implementation bytes remain the ledger runtime authority",
  );
  const c0Carrier = composeCluegiverS1Carrier(CLUEGIVER_S1_C0_ARM);
  const c1Carrier = composeCluegiverS1Carrier(CLUEGIVER_S1_C1_ARM);
  equal(
    removeExplicitCandidateBlock(c1Carrier),
    c0Carrier,
    "removing exactly the shared candidate block makes C1 byte-identical to C0",
  );
  equal(
    count(c1Carrier, CLUEGIVER_S1_EXPLICIT_CANDIDATE_BLOCK),
    1,
    "C1 contains exactly one canonical explicit candidate block",
  );
  equal(
    count(c1Carrier, CIPHER_ENCRYPT_CANDIDATE_POLICY_ARTIFACT.instruction),
    1,
    "C1 contains exact shared four-check policy text once",
  );
  equal(
    count(c0Carrier, CIPHER_ENCRYPT_CANDIDATE_POLICY_ARTIFACT.instruction),
    0,
    "C0 contains no explicit shared candidate-policy artifact",
  );
  ok(
    c1Carrier.indexOf("OPERATIVE STRATEGY DIRECTIVES") <
      c1Carrier.indexOf("ACTOR-CALL CANDIDATE POLICY") &&
      c1Carrier.indexOf("ACTOR-CALL CANDIDATE POLICY") <
        c1Carrier.indexOf("AUTHORITATIVE GAME ACTION AND OUTPUT CONTRACT"),
    "C1 uses the real shared composer authority order",
  );
  for (const check of [
    "1. Teammate clarity",
    "2. Blind inversion",
    "3. Cross-keyword ambiguity",
    "4. History exposure",
  ]) {
    ok(
      CIPHER_ENCRYPT_CANDIDATE_POLICY_ARTIFACT.instruction.includes(check),
      `C1 exact shared artifact contains ${check}`,
    );
  }
  throws(
    () => removeExplicitCandidateBlock(c0Carrier),
    /exactly one canonical candidate-policy block/,
    "candidate neutralizer rejects a carrier without the exact treatment",
  );

  equal(
    manifest.preregistrationVersion,
    "decrypto-cluegiver-s1-preregistration@0.4.0",
    "executor-amended preregistration schema is v0.4",
  );
  equal(
    manifest.status,
    "provider_free_shared_contracts_satisfied",
    "manifest truthfully records shared-contract adoption",
  );
  equal(
    manifest.integrationGate.status,
    "satisfied_at_reviewed_integration_head",
    "reviewed shared-contract integration gate is satisfied",
  );
  equal(
    manifest.integrationGate.reviewedIntegrationHead,
    "6fe13f87fb97fa0fc27e0c3ef4ea588a92471110",
    "manifest pins the exact reviewed integration HEAD",
  );
  equal(
    manifest.baseCommit,
    "6fe13f87fb97fa0fc27e0c3ef4ea588a92471110",
    "underlying Herpetarium integration base remains distinct",
  );
  deepEqual(
    manifest.amendmentProvenance,
    {
      reviewedPreregistrationParentCommit:
        "e729624dff0c024a7ca152cc423392ca8ccbac0a",
      relationship: "reviewed_preregistration_scaffold_parent",
      amendmentCommit: "not_recorded_to_avoid_self_reference",
    },
    "execution amendment identifies its reviewed scaffold parent without a self-reference",
  );
  equal(
    manifest.integrationGate.reviewedContractCommit,
    "86207c58d10eb6ed0deb8830335249f936e11525",
    "manifest pins the exact reviewed cluegiver-contract commit",
  );
  deepEqual(
    manifest.integrationGate.registryAwareCompilationGates,
    {
      cluegiver: "load_bearing_before_every_cluegiver_compilation",
      guess: "load_bearing_before_every_guess_compilation_and_materialization",
    },
    "both registry-aware role/build gates are load-bearing",
  );
  equal(
    manifest.integrationGate.reviewedObservationContract.sourceSha256,
    bench.CLUEGIVER_S1_REVIEWED_CLUEGIVER_OBSERVATION_SHA256,
    "reviewed cluegiver observation source bytes are pinned",
  );
  equal(
    manifest.integrationGate.reviewedBuildContract.sourceSha256,
    bench.CLUEGIVER_S1_REVIEWED_CLUEGIVER_BUILD_SHA256,
    "reviewed cluegiver build source bytes are pinned",
  );
  equal(
    manifest.integrationGate.reviewedObservationContract.adoption,
    "actual_shared_mint_verify",
    "cluegiver observation uses the actual shared mint/verify contract",
  );
  equal(
    manifest.integrationGate.reviewedBuildContract.adoption,
    "actual_shared_mint_verify",
    "cluegiver build uses the actual shared mint/verify contract",
  );
  equal(
    manifest.execution.providerCallsThisRun,
    0,
    "dry run dispatches zero provider calls",
  );
  equal(
    manifest.execution.plannedProviderCallsAfterReview,
    56,
    "reviewed future DAG contains exactly 56 planned calls",
  );
  equal(
    manifest.execution.maximumAttemptsPerJob,
    1,
    "each planned job has one attempt",
  );
  equal(
    manifest.execution.maxTokensPerJob,
    65_536,
    "executor maxTokens is frozen at 65536",
  );
  equal(
    manifest.execution.concurrency,
    4,
    "executor concurrency is frozen at four workers",
  );
  equal(
    manifest.execution.concurrencyScope,
    "worker_limit_only",
    "concurrency is a worker limit, not a DAG relaxation",
  );
  const {
    executorContract: _executorContract,
    ...manifestExecutionControlPlan
  } = manifest.execution;
  deepEqual(
    manifestExecutionControlPlan,
    bench.CLUEGIVER_S1_EXECUTION_CONTROL_PLAN,
    "every top-level execution field exactly matches one canonical plan",
  );
  equal(
    manifest.execution.dependencyScheduling,
    "child_preparation_requires_one_hash_bound_succeeded_parent_terminal_record",
    "child preparation requires one hash-bound succeeded parent record",
  );
  equal(
    manifest.execution.executorContract.maxTokens,
    65_536,
    "executor identity binds maxTokens",
  );
  equal(
    manifest.execution.executorContract.concurrency,
    4,
    "executor identity binds concurrency",
  );
  equal(
    manifest.execution.executorContract.persistence.idempotencyKeyField,
    "jobId",
    "executor identity keys persistence on jobId",
  );
  equal(
    manifest.execution.executorContract.persistence.decisionIdMayKeyPersistence,
    false,
    "arm-neutral decisionId may never key persistence",
  );
  equal(
    manifest.execution.executorContract.persistence
      .logicalActionKeyMayKeyPersistence,
    false,
    "arm-neutral logicalActionKey may never key persistence",
  );
  deepEqual(
    manifest.execution.executorContract.providerAdapterInput,
    {
      only: "CluegiverS1PreparedDispatchArtifact",
      rawOrStoredPromptParallelInput: "forbidden",
      preparationEntrypoint: "prepareCluegiverS1Dispatch",
      mintCapability: "module_private_process_local_WeakSet_membership",
      rehydratedOrDeserializedArtifacts: "forbidden",
      verificationImmediatelyBeforeDispatch:
        "verifyCluegiverS1PreparedDispatchArtifact_required",
      samplingWireKeys: "omit_temperature_top_p_and_seed_keys",
    },
    "future provider adapter accepts only the fresh prepared artifact",
  );
  deepEqual(
    manifest.execution.executorContract.implementationSource,
    sources.executionPreparationImplementation,
    "executor contract binds the exact preparation implementation bytes",
  );
  deepEqual(
    manifest.execution.executorContract.reviewedBotBuildIdentitySource,
    sources.reviewedBotBuildIdentitySource,
    "executor contract binds the exact reviewed BotBuild-pin source bytes",
  );
  deepEqual(
    manifest.execution.executorContract.reviewedBotBuildIdentities,
    bench.CLUEGIVER_S1_REVIEWED_BOTBUILD_IDENTITIES,
    "executor contract binds all three exact reviewed full BotBuild identities",
  );
  deepEqual(
    {
      assessor: {
        id: manifest.botBuilds.assessor.id,
        contentHash: manifest.botBuilds.assessor.contentHash,
      },
      cluegiverByArm: Object.fromEntries(
        Object.entries(manifest.botBuilds.cluegiverByArm).map(
          ([arm, build]) => [
            arm,
            { id: build.id, contentHash: build.contentHash },
          ],
        ),
      ),
    },
    bench.CLUEGIVER_S1_REVIEWED_BOTBUILD_IDENTITIES,
    "manifest BotBuilds equal the independently source-bound reviewed pins",
  );
  equal(manifest.execution.retries, 0, "no retries are licensed");
  equal(manifest.execution.fallbacks, 0, "no fallbacks are licensed");
  equal(
    manifest.route.timeout.warningMs,
    300_000,
    "warning occurs at 300 seconds",
  );
  equal(
    manifest.route.timeout.hardStopMs,
    600_000,
    "hard stop occurs at 600 seconds",
  );
  equal(
    manifest.route.route.allowFallbacks,
    false,
    "route fails closed without fallback",
  );
  equal(
    manifest.route.route.maxTokens,
    65_536,
    "route identity freezes maxTokens",
  );
  deepEqual(
    manifest.route.sampling,
    bench.CLUEGIVER_S1_SAMPLING_CONTRACT,
    "route binds exact absence of temperature, top_p, and seed wire keys",
  );
  deepEqual(
    bench.CLUEGIVER_S1_SAMPLING_CONTRACT,
    {
      temperature: "wire_key_must_be_absent",
      top_p: "wire_key_must_be_absent",
      seed: "wire_key_must_be_absent",
      providerDefaultValues: "not_claimed",
      nondeterminism: "uncontrolled_provider_sampling",
      replicationInterpretation:
        "repeated_physical_draws_not_independent_positions",
      futureAdapterWireObligation: "omit_temperature_top_p_and_seed_keys",
    },
    "sampling contract controls omission without inventing provider defaults",
  );
  for (const wireKey of ["temperature", "top_p", "seed"]) {
    ok(
      !Object.hasOwn(
        manifest.botBuilds.assessor.requestedRoute.wireConfig.parameters,
        wireKey,
      ),
      `requested wire configuration omits ${wireKey}`,
    );
  }
  equal(
    manifest.botBuilds.assessor.requestedRoute.wireConfig.parameters.maxTokens,
    65_536,
    "wire identity freezes maxTokens",
  );
  const orchestrationIdentities = [
    manifest.botBuilds.assessor.execution.orchestrationPolicy,
    ...Object.values(manifest.botBuilds.cluegiverByArm).map(
      (build) => build.execution.orchestrationPolicy,
    ),
  ];
  equal(
    new Set(orchestrationIdentities.map((entry) => entry.contentHash)).size,
    1,
    "all roles share one exact orchestration identity",
  );
  equal(
    orchestrationIdentities[0]!.contentHash,
    contentHash({
      maximumAttempts: 1,
      maxTokens: 65_536,
      concurrency: 4,
      concurrencyScope: "worker_limit_only",
      warningMs: 300_000,
      hardStopMs: 600_000,
      dependenciesRequired: true,
      dependencyScheduling:
        "child_preparation_requires_hash_bound_succeeded_parent_terminal_record",
      durableLoadProof:
        "deferred_to_separately_reviewed_concrete_executor_persistence",
      persistenceIdempotencyKeyField: "jobId",
      dispatchPreparationEntrypoint: "prepareCluegiverS1Dispatch",
      providerAdapterInputOnly: "CluegiverS1PreparedDispatchArtifact",
      implementationSource: sources.executionPreparationImplementation,
    }),
    "orchestration identity mechanically binds maxTokens, worker concurrency, DAG, jobId, and compiler gate",
  );
  const providerAdapterIdentities = [
    manifest.botBuilds.assessor.execution.providerAdapter,
    ...Object.values(manifest.botBuilds.cluegiverByArm).map(
      (build) => build.execution.providerAdapter,
    ),
  ];
  equal(
    new Set(providerAdapterIdentities.map((entry) => entry.contentHash)).size,
    1,
    "all roles share one provider-adapter descriptor identity",
  );
  equal(
    providerAdapterIdentities[0]!.contentHash,
    contentHash({
      status: "descriptor_only_no_dispatcher_in_this_scaffold",
      routeHash: bench.CLUEGIVER_S1_ROUTE_PLAN_HASH,
      acceptedInputOnly: "CluegiverS1PreparedDispatchArtifact",
      samplingContract: bench.CLUEGIVER_S1_SAMPLING_CONTRACT,
      executionPreparationImplementation:
        sources.executionPreparationImplementation,
    }),
    "provider-adapter descriptor binds exact wire-key absence and focused implementation bytes",
  );

  ok(
    verifyBotBuildManifest(manifest.botBuilds.assessor),
    "shared decoder/interceptor assessor BotBuild verifies",
  );
  equal(
    manifest.botBuilds.assessor.scope,
    "decoder",
    "shared BotBuild has the frozen decoder/interceptor scope",
  );
  deepEqual(
    manifest.botBuilds.assessor.compilation.strategyCompiler,
    manifest.implementationBindings.jointAssignmentPromptCompilerContract,
    "assessor BotBuild binds the exact shared compiler contract",
  );
  deepEqual(
    manifest.botBuilds.assessor.compilation.contextCompiler,
    manifest.implementationBindings.jointAssignmentPromptCompilerImplementation,
    "assessor BotBuild binds source bytes containing renderer/system/helpers",
  );
  equal(
    manifest.botBuilds.cluegiverByArm[CLUEGIVER_S1_C0_ARM].scope,
    "cluegiver",
    "C0 shared build has reviewed cluegiver scope",
  );
  equal(
    manifest.botBuilds.cluegiverByArm[CLUEGIVER_S1_C1_ARM].scope,
    "cluegiver",
    "C1 shared build has reviewed cluegiver scope",
  );
  ok(
    verifyCluegiverBotBuildManifest(
      manifest.botBuilds.cluegiverByArm[CLUEGIVER_S1_C0_ARM],
    ),
    "C0 actual shared cluegiver BotBuild verifies",
  );
  ok(
    verifyCluegiverBotBuildManifest(
      manifest.botBuilds.cluegiverByArm[CLUEGIVER_S1_C1_ARM],
    ),
    "C1 actual shared cluegiver BotBuild verifies",
  );
  equal(
    manifest.botBuilds.cluegiverByArm[CLUEGIVER_S1_C0_ARM].compilation
      .candidatePolicy.id,
    "no-explicit-candidate-policy@0.1.0",
    "C0 build records absence of an explicit candidate artifact",
  );
  deepEqual(
    manifest.botBuilds.cluegiverByArm[CLUEGIVER_S1_C1_ARM].compilation
      .candidatePolicy,
    {
      id: CIPHER_ENCRYPT_CANDIDATE_POLICY_ARTIFACT.id,
      contentHash: CIPHER_ENCRYPT_CANDIDATE_POLICY_ARTIFACT.contentHash,
    },
    "C1 build binds the exact shared candidate policy",
  );

  equal(manifest.dag.cellCount, 8, "DAG has 4 positions x 2 arms");
  equal(manifest.dag.jobs.length, 56, "DAG enumerates all 56 jobs");
  deepEqual(
    manifest.dag.cells.map((cell) => cell.orderingKey),
    [...manifest.dag.cells.map((cell) => cell.orderingKey)].sort(
      bench.compareCodeUnits,
    ),
    "cell ordering uses deterministic code-unit comparison",
  );
  deepEqual(
    ["z", "ä", "a"].sort(bench.compareCodeUnits),
    ["a", "z", "ä"],
    "ordering comparator follows UTF-16 code units rather than locale",
  );
  equal(
    count(
      await readFile(
        resolve(moduleDirectory, "run-decrypto-cluegiver-s1-prereg.ts"),
        "utf8",
      ),
      "localeCompare",
    ),
    0,
    "runner contains no locale-dependent ordering",
  );
  deepEqual(
    manifest.dag.jobs.map((job) => job.ordinal),
    Array.from({ length: 56 }, (_, index) => index + 1),
    "job ordinals are complete and topological",
  );
  const ordinalByJobId = new Map(
    manifest.dag.jobs.map((job) => [job.jobId, job.ordinal]),
  );
  equal(
    new Set(manifest.dag.jobs.map((job) => job.jobId)).size,
    manifest.dag.jobs.length,
    "jobId is unique across the complete preregistered DAG",
  );
  equal(
    new Set(manifest.dag.jobs.map((job) => job.persistence.idempotencyKey))
      .size,
    manifest.dag.jobs.length,
    "persistence idempotency keys are unique across the complete DAG",
  );
  for (const job of manifest.dag.jobs) {
    for (const dependency of job.dependencies) {
      ok(
        (ordinalByJobId.get(dependency) ?? Number.POSITIVE_INFINITY) <
          job.ordinal,
        `${job.jobId} dependency is topologically earlier`,
      );
    }
    equal(job.execution.providerDispatches, 0, `${job.jobId} has no dispatch`);
    equal(job.execution.outcome, null, `${job.jobId} has no outcome`);
    equal(job.execution.maximumAttempts, 1, `${job.jobId} has one attempt`);
    equal(job.execution.maxTokens, 65_536, `${job.jobId} freezes maxTokens`);
    equal(job.execution.retries, 0, `${job.jobId} has no retry`);
    equal(job.execution.fallbacks, 0, `${job.jobId} has no fallback`);
    deepEqual(
      job.route.sampling,
      bench.CLUEGIVER_S1_SAMPLING_CONTRACT,
      `${job.jobId} carries the exact sampling-key omission contract`,
    );
    equal(
      job.persistence.idempotencyKey,
      job.jobId,
      `${job.jobId} uses unique jobId as its persistence key`,
    );
    equal(
      job.persistence.keySource,
      "jobId",
      `${job.jobId} forbids arm-neutral persistence keys`,
    );
  }

  for (const cell of manifest.dag.cells) {
    const jobs = manifest.dag.jobs.filter((job) => job.cellId === cell.cellId);
    equal(jobs.length, 7, `${cell.cellId} has seven jobs`);
    const parents = jobs.filter((job) => job.role === "cluegiver");
    const decoders = jobs.filter((job) => job.role === "teammate_decoder");
    const interceptors = jobs.filter(
      (job) => job.role === "opponent_interceptor",
    );
    equal(parents.length, 1, `${cell.cellId} has one cluegiver parent`);
    equal(decoders.length, 3, `${cell.cellId} has three decoders`);
    equal(interceptors.length, 3, `${cell.cellId} has three interceptors`);
    const parent = parents[0]!;
    equal(
      parent.assessorReplication,
      null,
      `${cell.cellId} cluegiver is not replicated`,
    );
    deepEqual(
      parent.dependencies,
      [],
      `${cell.cellId} cluegiver has no dependency`,
    );
    deepEqual(
      parent.promptCompiler,
      {
        id: manifest.implementationBindings.cluegiverPromptCompiler.id,
        contentHash:
          manifest.implementationBindings.cluegiverPromptCompiler.contentHash,
      },
      `${cell.cellId} binds the exact cluegiver compiler identity`,
    );
    ok(
      parent.persistence.idempotencyKey !== parent.observation.decisionId &&
        parent.persistence.idempotencyKey !==
          parent.observation.logicalActionKey,
      `${cell.cellId} never keys persistence on arm-neutral cluegiver identifiers`,
    );
    deepEqual(
      validateCluegiverObservation(parent.observation),
      [],
      `${cell.cellId} actual shared cluegiver observation is role-complete`,
    );
    ok(
      verifyCluegiverObservation(parent.observation),
      `${cell.cellId} actual shared cluegiver observation verifies`,
    );
    deepEqual(
      validateCluegiverDecisionContext(
        parent.observation,
        manifest.botBuilds.cluegiverByArm[parent.arm],
      ),
      [],
      `${cell.cellId} cluegiver observation resolves to its verified build`,
    );
    deepEqual(
      validateCluegiverS1Action(
        {
          rationale: "private",
          clues: [...bench.CLUEGIVER_S1_CLUE_PLACEHOLDERS],
        },
        parent.observation,
      ),
      [],
      `${cell.cellId} planned clue action contract accepts placeholders`,
    );
    for (const child of [...decoders, ...interceptors]) {
      ok(child.role !== "cluegiver", `${child.jobId} is a downstream assessor`);
      deepEqual(
        child.dependencies,
        [parent.jobId],
        `${child.jobId} depends only on the shared parent`,
      );
      ok(
        child.persistence.idempotencyKey !==
          child.blindedInput.observationTemplate.decisionId &&
          child.persistence.idempotencyKey !==
            child.blindedInput.observationTemplate.logicalActionKey,
        `${child.jobId} never keys persistence on arm-neutral assessor identifiers`,
      );
      equal(
        child.parentJobId,
        parent.jobId,
        `${child.jobId} names the shared parent`,
      );
      deepEqual(
        child.blindedInput.parentOutputProjection.include,
        ["clues"],
        `${child.jobId} includes only clues from parent`,
      );
      deepEqual(
        child.blindedInput.parentOutputProjection.exclude,
        ["rationale"],
        `${child.jobId} explicitly excludes parent rationale`,
      );
      ok(
        verifyObservationV2(child.blindedInput.observationTemplate),
        `${child.jobId} blinded Observation v0.2 verifies`,
      );
      deepEqual(
        child.blindedInput.parentOutputProjection.requiredBotBuildManifest,
        {
          id: manifest.botBuilds.assessor.id,
          contentHash: manifest.botBuilds.assessor.contentHash,
        },
        `${child.jobId} materializer names the exact required assessor build`,
      );
      deepEqual(
        validateGuessDecisionContext(
          child.blindedInput.observationTemplate,
          manifest.botBuilds.assessor,
        ),
        [],
        `${child.jobId} guess observation resolves to its verified build`,
      );
      const compiled = bench.compileCluegiverS1AssessorPrompt(
        child.blindedInput.observationTemplate,
        manifest.botBuilds.assessor,
      );
      ok(
        verifyCompiledJointAssignmentDecoderPrompt(
          compiled,
          child.blindedInput.observationTemplate,
        ),
        `${child.jobId} exact shared prompt verifies`,
      );
      equal(
        compiled.contentHash,
        child.compiledPromptTemplate.contentHash,
        `${child.jobId} binds exact compiled template`,
      );
      equal(
        child.compiledPromptTemplate.observationTemplateContentHash,
        child.blindedInput.observationTemplate.contentHash,
        `${child.jobId} binds the exact observation-template hash`,
      );
      equal(
        child.compiledPromptTemplate.placeholderIndependentContentHash,
        bench.cluegiverS1AssessorPlaceholderIndependentContentHash(compiled),
        `${child.jobId} binds the placeholder-independent compiler output`,
      );
      equal(
        child.compiledPromptTemplate.providerPayloadContentHash,
        contentHash(bench.cluegiverS1AssessorProviderPayload(compiled)),
        `${child.jobId} binds the exact provider payload template`,
      );
      deepEqual(
        child.templateBinding,
        {
          cellId: child.cellId,
          arm: child.arm,
          role: child.role,
          assessorReplication: child.assessorReplication,
          observationTemplateContentHash:
            child.blindedInput.observationTemplate.contentHash,
        },
        `${child.jobId} binds cell, arm, role, replication, and observation`,
      );
      deepEqual(
        child.promptCompiler,
        {
          contract:
            manifest.implementationBindings
              .jointAssignmentPromptCompilerContract,
          implementation:
            manifest.implementationBindings
              .jointAssignmentPromptCompilerImplementation,
        },
        `${child.jobId} binds shared compiler contract and source bytes`,
      );
      deepEqual(
        child.policy,
        {
          id: JOINT_ASSIGNMENT_DECODER_POLICY_ARTIFACT.id,
          contentHash: JOINT_ASSIGNMENT_DECODER_POLICY_ARTIFACT.contentHash,
        },
        `${child.jobId} binds exact shared joint-assignment policy`,
      );
      deepEqual(
        child.actionValidator,
        manifest.implementationBindings.jointAssignmentActionValidator,
        `${child.jobId} binds the shared source-byte action validator`,
      );
      if (child.role === "teammate_decoder") {
        ok(
          child.blindedInput.observationTemplate.ownKeywords !== null,
          `${child.jobId} decoder receives own keywords`,
        );
        deepEqual(
          child.blindedInput.observationTemplate.ownClues,
          bench.CLUEGIVER_S1_CLUE_PLACEHOLDERS,
          `${child.jobId} decoder target holds parent placeholders`,
        );
      } else {
        equal(
          child.blindedInput.observationTemplate.ownKeywords,
          null,
          `${child.jobId} interceptor never receives opponent keywords`,
        );
        deepEqual(
          child.blindedInput.observationTemplate.opponentClues,
          bench.CLUEGIVER_S1_CLUE_PLACEHOLDERS,
          `${child.jobId} interceptor target holds parent placeholders`,
        );
      }
    }
    deepEqual(
      decoders.map((job) => job.assessorReplication),
      [1, 2, 3],
      `${cell.cellId} decoder assessor replications are 1..3`,
    );
    deepEqual(
      interceptors.map((job) => job.assessorReplication),
      [1, 2, 3],
      `${cell.cellId} interceptor assessor replications are 1..3`,
    );
  }

  for (const position of fixture.positions) {
    const c0Cell = manifest.dag.cells.find(
      (cell) =>
        cell.positionId === position.positionId &&
        cell.arm === CLUEGIVER_S1_C0_ARM,
    )!;
    const c1Cell = manifest.dag.cells.find(
      (cell) =>
        cell.positionId === position.positionId &&
        cell.arm === CLUEGIVER_S1_C1_ARM,
    )!;
    const c0Parent = manifest.dag.jobs.find(
      (job) => job.jobId === c0Cell.parentJobId,
    )!;
    const c1Parent = manifest.dag.jobs.find(
      (job) => job.jobId === c1Cell.parentJobId,
    )!;
    ok(
      c0Parent.role === "cluegiver" && c1Parent.role === "cluegiver",
      `${position.positionId} matched parent roles are cluegiver`,
    );
    equal(
      c0Parent.observation.decisionId,
      c1Parent.observation.decisionId,
      `${position.positionId} parent decision ID is arm-neutral`,
    );
    equal(
      c0Parent.observation.logicalActionKey,
      c1Parent.observation.logicalActionKey,
      `${position.positionId} parent logical action key is arm-neutral`,
    );
    const compiledC0 = compileCluegiverS1Prompt({
      observation: c0Parent.observation,
      botBuild: manifest.botBuilds.cluegiverByArm[CLUEGIVER_S1_C0_ARM],
      arm: CLUEGIVER_S1_C0_ARM,
      compiler: manifest.implementationBindings.cluegiverPromptCompiler,
    });
    const compiledC1 = compileCluegiverS1Prompt({
      observation: c1Parent.observation,
      botBuild: manifest.botBuilds.cluegiverByArm[CLUEGIVER_S1_C1_ARM],
      arm: CLUEGIVER_S1_C1_ARM,
      compiler: manifest.implementationBindings.cluegiverPromptCompiler,
    });
    const payloadC0 = cluegiverS1ProviderPayload(compiledC0);
    const payloadC1 = cluegiverS1ProviderPayload(compiledC1);
    deepEqual(
      Object.keys(payloadC0).sort(),
      ["systemPrompt", "userPrompt"],
      `${position.positionId} provider boundary exposes only prompt strings`,
    );
    equal(
      payloadC0.systemPrompt,
      payloadC1.systemPrompt,
      `${position.positionId} parent system bytes match across arms`,
    );
    equal(
      removeExplicitCandidateBlock(payloadC1.userPrompt),
      payloadC0.userPrompt,
      `${position.positionId} full provider payload differs only by exact treatment block`,
    );
    equal(
      Buffer.byteLength(payloadC1.userPrompt, "utf8") -
        Buffer.byteLength(payloadC0.userPrompt, "utf8"),
      bench.CLUEGIVER_S1_C1_PROMPT_LENGTH_DELTA_UTF8_BYTES,
      `${position.positionId} prompt-length change is part of the treatment package`,
    );
    equal(
      count(
        payloadC1.userPrompt,
        CIPHER_ENCRYPT_CANDIDATE_POLICY_ARTIFACT.instruction,
      ),
      1,
      `${position.positionId} provider receives shared treatment exactly once`,
    );
    equal(
      count(
        payloadC0.userPrompt,
        CIPHER_ENCRYPT_CANDIDATE_POLICY_ARTIFACT.instruction,
      ),
      0,
      `${position.positionId} C0 provider prompt excludes treatment`,
    );

    for (const role of ["teammate_decoder", "opponent_interceptor"] as const) {
      for (const replication of [1, 2, 3] as const) {
        const c0Child = manifest.dag.jobs.find(
          (job) =>
            job.cellId === c0Cell.cellId &&
            job.role === role &&
            job.assessorReplication === replication,
        )!;
        const c1Child = manifest.dag.jobs.find(
          (job) =>
            job.cellId === c1Cell.cellId &&
            job.role === role &&
            job.assessorReplication === replication,
        )!;
        ok(
          c0Child.role !== "cluegiver" && c1Child.role !== "cluegiver",
          `${position.positionId} matched assessor jobs resolve`,
        );
        deepEqual(
          c0Child.blindedInput.observationTemplate,
          c1Child.blindedInput.observationTemplate,
          `${position.positionId} ${role} rep ${replication} provider-visible template is arm-neutral`,
        );
        deepEqual(
          c0Child.compiledPromptTemplate,
          c1Child.compiledPromptTemplate,
          `${position.positionId} ${role} rep ${replication} compiled template bytes are arm-neutral`,
        );
      }
    }
  }

  equal(
    bench.cluegiverS1ProviderVisiblePromptProjectionHash(manifest),
    bench.CLUEGIVER_S1_REVIEWED_PROVIDER_VISIBLE_PROMPT_PROJECTION_HASH,
    "executor amendment preserves the reviewed provider-visible prompt projection",
  );
  equal(
    bench.CLUEGIVER_S1_REVIEWED_PROVIDER_VISIBLE_PROMPT_PROJECTION_HASH,
    "56989a03e8482f2df20ef9cc112584f2408a5693006c58131ba95d4bf4019b40",
    "provider-visible projection hash is pinned to the pre-amendment bytes",
  );

  const firstAssessor = manifest.dag.jobs.find(
    (job) => job.role === "teammate_decoder",
  )!;
  ok(firstAssessor.role !== "cluegiver", "first assessor fixture resolves");
  const rationaleSentinel = "RATIONAL_SENTINEL_NEVER_DOWNSTREAM";
  const materialized = bench.materializeAssessorObservationFromParentAction(
    firstAssessor.blindedInput.observationTemplate,
    {
      rationale: rationaleSentinel,
      clues: ["quartz", "feather", "summit"],
    },
    manifest.botBuilds.assessor,
  );
  ok(verifyObservationV2(materialized), "materialized observation verifies");
  ok(
    !canonicalJson(materialized).includes(rationaleSentinel),
    "parent rationale cannot enter materialized child observation",
  );
  deepEqual(
    materialized.ownClues,
    ["quartz", "feather", "summit"],
    "decoder materializer inserts only parent clue triple",
  );
  const materializedPrompt = bench.compileCluegiverS1AssessorPrompt(
    materialized,
    manifest.botBuilds.assessor,
  );
  ok(
    !canonicalJson(materializedPrompt).includes(rationaleSentinel),
    "parent rationale cannot enter downstream compiled prompt",
  );
  throws(
    () =>
      bench.materializeAssessorObservationFromParentAction(
        firstAssessor.blindedInput.observationTemplate,
        { rationale: rationaleSentinel },
        manifest.botBuilds.assessor,
      ),
    /exactly one three-clue array/,
    "downstream materializer fails closed without a clue triple",
  );
  throws(
    () =>
      bench.compileCluegiverS1AssessorPrompt(
        firstAssessor.blindedInput.observationTemplate,
        undefined as unknown as typeof manifest.botBuilds.assessor,
      ),
    /BotBuild manifest is unresolved/,
    "guess compiler rejects an unresolved BotBuild manifest",
  );
  throws(
    () =>
      bench.compileCluegiverS1AssessorPrompt(
        firstAssessor.blindedInput.observationTemplate,
        manifest.botBuilds.cluegiverByArm[CLUEGIVER_S1_C0_ARM],
      ),
    /decoder decision requires a decoder-scope BotBuild/,
    "guess compiler rejects a cluegiver-scope BotBuild",
  );
  const tamperedAssessorBuild = structuredClone(manifest.botBuilds.assessor);
  (tamperedAssessorBuild as unknown as { contentHash: string }).contentHash =
    "f".repeat(64);
  throws(
    () =>
      bench.compileCluegiverS1AssessorPrompt(
        firstAssessor.blindedInput.observationTemplate,
        tamperedAssessorBuild,
      ),
    /BotBuild manifest must verify/,
    "guess compiler rejects a tampered decoder BotBuild",
  );
  throws(
    () =>
      bench.materializeAssessorObservationFromParentAction(
        firstAssessor.blindedInput.observationTemplate,
        { rationale: "private", clues: ["quartz", "feather", "summit"] },
        undefined as unknown as typeof manifest.botBuilds.assessor,
      ),
    /BotBuild manifest is unresolved/,
    "assessor materializer rejects an unresolved BotBuild before projection",
  );
  throws(
    () =>
      bench.materializeAssessorObservationFromParentAction(
        firstAssessor.blindedInput.observationTemplate,
        { rationale: "private", clues: ["quartz", "feather", "summit"] },
        manifest.botBuilds.cluegiverByArm[CLUEGIVER_S1_C0_ARM],
      ),
    /decoder decision requires a decoder-scope BotBuild/,
    "assessor materializer rejects a wrong-scope BotBuild before projection",
  );
  throws(
    () =>
      bench.materializeAssessorObservationFromParentAction(
        firstAssessor.blindedInput.observationTemplate,
        { rationale: "private", clues: ["quartz", "feather", "summit"] },
        tamperedAssessorBuild,
      ),
    /BotBuild manifest must verify/,
    "assessor materializer rejects a tampered BotBuild before projection",
  );

  const firstParent = manifest.dag.jobs.find(
    (job) => job.jobId === firstAssessor.parentJobId,
  )!;
  ok(firstParent.role === "cluegiver", "first parent resolves");
  const parentArtifact = bench.prepareCluegiverS1Dispatch({
    preregistration: manifest,
    jobId: firstParent.jobId,
  });
  ok(
    parentArtifact.artifactKind === "cluegiver_parent_dispatch",
    "parent preparation returns the cluegiver discriminant",
  );
  ok(
    Object.isFrozen(parentArtifact) &&
      Object.isFrozen(parentArtifact.providerRequest) &&
      Object.isFrozen(parentArtifact.providerRequest.payload),
    "prepared parent artifact and exact request payload are deeply frozen",
  );
  ok(
    bench.verifyCluegiverS1PreparedDispatchArtifact(parentArtifact),
    "prepared parent artifact verifies its content address and route",
  );
  const freshlyCompiledParent = compileCluegiverS1Prompt({
    observation: firstParent.observation,
    botBuild: manifest.botBuilds.cluegiverByArm[firstParent.arm],
    arm: firstParent.arm,
    compiler: manifest.implementationBindings.cluegiverPromptCompiler,
  });
  const freshParentPayload = cluegiverS1ProviderPayload(freshlyCompiledParent);
  deepEqual(
    parentArtifact.providerRequest.payload,
    freshParentPayload,
    "parent artifact carries the exact freshly compiled provider payload",
  );
  deepEqual(
    {
      provider: parentArtifact.providerRequest.provider,
      model: parentArtifact.providerRequest.model,
      upstream: parentArtifact.providerRequest.upstream,
      upstreamOrder: parentArtifact.providerRequest.upstreamOrder,
      allowFallbacks: parentArtifact.providerRequest.allowFallbacks,
      requireParameters: parentArtifact.providerRequest.requireParameters,
      applicationEffort: parentArtifact.providerRequest.applicationEffort,
      wireEffort: parentArtifact.providerRequest.wireEffort,
      sampling: parentArtifact.providerRequest.sampling,
      maxTokens: parentArtifact.providerRequest.maxTokens,
      maximumAttempts: parentArtifact.providerRequest.maximumAttempts,
      warningMs: parentArtifact.providerRequest.warningMs,
      hardStopMs: parentArtifact.providerRequest.hardStopMs,
    },
    {
      provider: manifest.route.requestedModel.provider,
      model: manifest.route.requestedModel.model,
      upstream: manifest.route.requestedModel.upstream ?? null,
      upstreamOrder: manifest.route.route.upstreamOrder,
      allowFallbacks: false,
      requireParameters: true,
      applicationEffort: "xhigh",
      wireEffort: "max",
      sampling: bench.CLUEGIVER_S1_SAMPLING_CONTRACT,
      maxTokens: 65_536,
      maximumAttempts: 1,
      warningMs: 300_000,
      hardStopMs: 600_000,
    },
    "prepared request carries the exact canonical route and execution values",
  );
  for (const wireKey of ["temperature", "top_p", "seed"]) {
    ok(
      !Object.hasOwn(parentArtifact.providerRequest, wireKey),
      `prepared parent request omits ${wireKey} as a direct wire parameter`,
    );
  }
  const futureProviderAdapter = (
    artifact: CluegiverS1PreparedDispatchArtifact,
  ) => {
    if (!bench.verifyCluegiverS1PreparedDispatchArtifact(artifact)) {
      throw new Error(
        "future provider adapter requires mint verification immediately before dispatch",
      );
    }
    return artifact.providerRequest;
  };
  deepEqual(
    futureProviderAdapter(parentArtifact),
    parentArtifact.providerRequest,
    "future adapter boundary consumes the prepared artifact itself",
  );
  if (false) {
    // @ts-expect-error Raw or independently stored payloads are forbidden.
    futureProviderAdapter(freshParentPayload);
  }

  const projectionBypassManifest = structuredClone(manifest);
  const projectionBypassParent = projectionBypassManifest.dag.jobs.find(
    (job) => job.jobId === firstParent.jobId,
  )!;
  ok(
    projectionBypassParent.role === "cluegiver",
    "provider-projection bypass parent resolves",
  );
  (projectionBypassParent.observation.ownKeywords as unknown as string[])[0] =
    "CITADEL";
  recomputeHash(projectionBypassParent.observation, "contentHash");
  const projectionBypassCompiled = compileCluegiverS1Prompt({
    observation: projectionBypassParent.observation,
    botBuild:
      projectionBypassManifest.botBuilds.cluegiverByArm[
        projectionBypassParent.arm
      ],
    arm: projectionBypassParent.arm,
    compiler:
      projectionBypassManifest.implementationBindings.cluegiverPromptCompiler,
  });
  const projectionBypassPayload = cluegiverS1ProviderPayload(
    projectionBypassCompiled,
  );
  Object.assign(
    projectionBypassParent.compiledPrompt as unknown as Record<string, unknown>,
    {
      id: projectionBypassCompiled.carrier.id,
      contentHash: projectionBypassCompiled.contentHash,
      systemPromptSha256: sha256Hex(projectionBypassPayload.systemPrompt),
      userPromptSha256: sha256Hex(projectionBypassPayload.userPrompt),
      candidateBlockRemovedUserPromptSha256: candidateBlockRemovedPromptSha256(
        projectionBypassCompiled,
      ),
    },
  );
  recomputeHash(projectionBypassManifest, "preregistrationContentHash");
  equal(
    projectionBypassManifest.invariants.providerVisiblePromptProjectionHash,
    bench.CLUEGIVER_S1_REVIEWED_PROVIDER_VISIBLE_PROMPT_PROJECTION_HASH,
    "self-rehashed bypass retains the copied reviewed invariant",
  );
  ok(
    projectionBypassPayload.userPrompt !==
      parentArtifact.providerRequest.payload.userPrompt,
    "self-consistent bypass really changes provider-visible parent bytes",
  );
  throws(
    () =>
      bench.prepareCluegiverS1Dispatch({
        preregistration: projectionBypassManifest,
        jobId: projectionBypassParent.jobId,
      }),
    /canonical assessor observation semantics drifted|freshly recomputed provider-visible prompt projection drifted/,
    "preparation rejects self-rehashed observation and prompt metadata via the parent/child semantic binding or fresh full projection",
  );

  function refreshParentObservationDependents(
    candidate: typeof manifest,
    jobId: string,
  ): void {
    const job = candidate.dag.jobs.find((entry) => entry.jobId === jobId)!;
    if (job.role !== "cluegiver") {
      throw new Error("parent observation refresh requires a cluegiver job");
    }
    recomputeHash(job.observation, "contentHash");
    const compiled = compileCluegiverS1Prompt({
      observation: job.observation,
      botBuild: candidate.botBuilds.cluegiverByArm[job.arm],
      arm: job.arm,
      compiler: candidate.implementationBindings.cluegiverPromptCompiler,
    });
    const payload = cluegiverS1ProviderPayload(compiled);
    Object.assign(job.compiledPrompt as unknown as Record<string, unknown>, {
      id: compiled.carrier.id,
      contentHash: compiled.contentHash,
      systemPromptSha256: sha256Hex(payload.systemPrompt),
      userPromptSha256: sha256Hex(payload.userPrompt),
      candidateBlockRemovedUserPromptSha256:
        candidateBlockRemovedPromptSha256(compiled),
    });
    recomputeHash(candidate, "preregistrationContentHash");
  }

  function refreshAssessorObservationDependents(
    candidate: typeof manifest,
    jobId: string,
  ): void {
    const job = candidate.dag.jobs.find((entry) => entry.jobId === jobId)!;
    if (job.role === "cluegiver") {
      throw new Error("assessor observation refresh requires a child job");
    }
    recomputeHash(job.blindedInput.observationTemplate, "contentHash");
    (
      job.templateBinding as unknown as {
        observationTemplateContentHash: string;
      }
    ).observationTemplateContentHash =
      job.blindedInput.observationTemplate.contentHash;
    const compiled = bench.compileCluegiverS1AssessorPrompt(
      job.blindedInput.observationTemplate,
      candidate.botBuilds.assessor,
    );
    const payload = bench.cluegiverS1AssessorProviderPayload(compiled);
    Object.assign(
      job.compiledPromptTemplate as unknown as Record<string, unknown>,
      {
        id: `compiled:${job.blindedInput.observationTemplate.decisionId}`,
        contentHash: compiled.contentHash,
        observationTemplateContentHash:
          job.blindedInput.observationTemplate.contentHash,
        placeholderIndependentContentHash:
          bench.cluegiverS1AssessorPlaceholderIndependentContentHash(compiled),
        providerPayloadContentHash: contentHash(payload),
        systemPromptSha256: sha256Hex(payload.systemPrompt),
        taskPromptSha256: sha256Hex(payload.taskPrompt),
        actionContractSha256: sha256Hex(payload.actionContract),
      },
    );
    recomputeHash(candidate, "preregistrationContentHash");
  }

  const parentObservationSemanticCases: readonly [
    label: string,
    mutateObservation: (observation: DecryptoCluegiverObservation) => void,
  ][] = [
    [
      "actor.actorId",
      (observation) => {
        (
          observation.actor as unknown as {
            actorId: string;
          }
        ).actorId = "self-rehashed-unreviewed-cluegiver";
      },
    ],
    [
      "actor.seatId and activeCluegiverSeatId",
      (observation) => {
        (
          observation.actor as unknown as {
            seatId: string;
          }
        ).seatId = "self-rehashed-unreviewed-cluegiver-seat";
        (
          observation as unknown as {
            activeCluegiverSeatId: string;
          }
        ).activeCluegiverSeatId = "self-rehashed-unreviewed-cluegiver-seat";
      },
    ],
    [
      "decisionFocus",
      (observation) => {
        (
          observation as unknown as {
            decisionFocus: string;
          }
        ).decisionFocus = "An unreviewed but structurally legal focus.";
      },
    ],
  ];
  for (const [label, mutateObservation] of parentObservationSemanticCases) {
    const tamperedManifest = structuredClone(manifest);
    const tamperedParent = tamperedManifest.dag.jobs.find(
      (job) => job.jobId === firstParent.jobId,
    )!;
    ok(
      tamperedParent.role === "cluegiver",
      `parent ${label} semantic attack resolves`,
    );
    mutateObservation(tamperedParent.observation);
    refreshParentObservationDependents(tamperedManifest, tamperedParent.jobId);
    ok(
      verifyCluegiverObservation(tamperedParent.observation),
      `self-rehashed parent ${label} observation remains structurally valid`,
    );
    equal(
      bench.cluegiverS1ProviderVisiblePromptProjectionHash(tamperedManifest),
      bench.CLUEGIVER_S1_REVIEWED_PROVIDER_VISIBLE_PROMPT_PROJECTION_HASH,
      `parent ${label} rewrite leaves every provider-visible prompt byte unchanged`,
    );
    throws(
      () =>
        bench.prepareCluegiverS1Dispatch({
          preregistration: tamperedManifest,
          jobId: firstParent.jobId,
        }),
      /canonical parent observation semantics drifted/,
      `source-derived canonical semantics reject self-rehashed parent ${label}`,
    );
  }

  const assessorObservationSemanticCases: readonly [
    label: string,
    providerProjection: "unchanged" | "changed",
    mutateObservation: (observation: DecryptoObservationV2) => void,
  ][] = [
    [
      "actor.actorId",
      "unchanged",
      (observation) => {
        (
          observation.actor as unknown as {
            actorId: string;
          }
        ).actorId = "self-rehashed-unreviewed-assessor";
      },
    ],
    [
      "actor.seatId",
      "unchanged",
      (observation) => {
        (
          observation.actor as unknown as {
            seatId: string;
          }
        ).seatId = "self-rehashed-unreviewed-assessor-seat";
      },
    ],
    [
      "activeCluegiverSeatId",
      "unchanged",
      (observation) => {
        (
          observation as unknown as {
            activeCluegiverSeatId: string;
          }
        ).activeCluegiverSeatId =
          "self-rehashed-unreviewed-active-cluegiver-seat";
      },
    ],
    [
      "decisionFocus",
      "changed",
      (observation) => {
        (
          observation as unknown as {
            decisionFocus: string;
          }
        ).decisionFocus = "An unreviewed but structurally legal focus.";
      },
    ],
    [
      "role-hidden resolved history clues",
      "unchanged",
      (observation) => {
        const round = observation.resolvedRounds[0]!;
        const hiddenSide =
          observation.role === "decoder" ? round.opponent : round.own;
        (hiddenSide.clues as unknown as string[])[0] =
          "self-rehashed-hidden-history";
      },
    ],
    [
      "resolved outcome and matching token tuple",
      "unchanged",
      (observation) => {
        const own = observation.resolvedRounds[0]!.own;
        const replacement =
          canonicalJson(own.code) === canonicalJson([1, 2, 3])
            ? ([1, 2, 4] as const)
            : ([1, 2, 3] as const);
        (own.ownDecode as unknown as number[]).splice(
          0,
          own.ownDecode.length,
          ...replacement,
        );
        (
          own as unknown as {
            decodedCorrectly: boolean;
          }
        ).decodedCorrectly = false;
        (
          observation.tokens.own as unknown as {
            miscommunications: number;
          }
        ).miscommunications += 1;
      },
    ],
  ];
  for (const role of ["teammate_decoder", "opponent_interceptor"] as const) {
    const sourceJob = manifest.dag.jobs.find((job) => job.role === role)!;
    ok(sourceJob.role === role, `${role} semantic-attack source resolves`);
    for (const [
      label,
      expectedProjection,
      mutateObservation,
    ] of assessorObservationSemanticCases) {
      const tamperedManifest = structuredClone(manifest);
      const tamperedJob = tamperedManifest.dag.jobs.find(
        (job) => job.jobId === sourceJob.jobId,
      )!;
      ok(
        tamperedJob.role === role,
        `${role} ${label} semantic attack resolves`,
      );
      mutateObservation(tamperedJob.blindedInput.observationTemplate);
      refreshAssessorObservationDependents(tamperedManifest, tamperedJob.jobId);
      ok(
        verifyObservationV2(tamperedJob.blindedInput.observationTemplate),
        `self-rehashed ${role} ${label} observation remains structurally valid`,
      );
      const projectionHash =
        bench.cluegiverS1ProviderVisiblePromptProjectionHash(tamperedManifest);
      if (expectedProjection === "unchanged") {
        equal(
          projectionHash,
          bench.CLUEGIVER_S1_REVIEWED_PROVIDER_VISIBLE_PROMPT_PROJECTION_HASH,
          `${role} ${label} rewrite leaves every provider-visible prompt byte unchanged`,
        );
      } else {
        ok(
          projectionHash !==
            bench.CLUEGIVER_S1_REVIEWED_PROVIDER_VISIBLE_PROMPT_PROJECTION_HASH,
          `${role} ${label} is provider-visible and changes the full prompt projection`,
        );
      }
      throws(
        () =>
          bench.prepareCluegiverS1Dispatch({
            preregistration: tamperedManifest,
            jobId: firstParent.jobId,
          }),
        /canonical assessor observation semantics drifted/,
        `source-derived canonical semantics reject self-rehashed ${role} ${label}`,
      );
    }
  }

  for (const [label, mutateInvariants] of [
    [
      "recorded projection",
      (invariants: Record<string, unknown>) => {
        invariants.providerVisiblePromptProjectionHash = "f".repeat(64);
      },
    ],
    [
      "unknown invariant",
      (invariants: Record<string, unknown>) => {
        invariants.inventedInvariant = true;
      },
    ],
  ] as const) {
    const tamperedManifest = structuredClone(manifest);
    mutateInvariants(
      tamperedManifest.invariants as unknown as Record<string, unknown>,
    );
    recomputeHash(tamperedManifest, "preregistrationContentHash");
    throws(
      () =>
        bench.prepareCluegiverS1Dispatch({
          preregistration: tamperedManifest,
          jobId: firstParent.jobId,
        }),
      /exact reviewed dispatch invariants/,
      `preparation rejects hash-consistent ${label} drift`,
    );
  }

  function refreshAssessorBotBuildDependents(candidate: typeof manifest): void {
    const build = candidate.botBuilds.assessor;
    recomputeBotBuildHash(build);
    for (const job of candidate.dag.jobs) {
      if (job.role === "cluegiver") continue;
      (
        job.blindedInput.observationTemplate.identities.botBuild as unknown as {
          contentHash: string;
        }
      ).contentHash = build.contentHash;
      recomputeHash(job.blindedInput.observationTemplate, "contentHash");
      (
        job.blindedInput.parentOutputProjection
          .requiredBotBuildManifest as unknown as {
          contentHash: string;
        }
      ).contentHash = build.contentHash;
      (
        job.templateBinding as unknown as {
          observationTemplateContentHash: string;
        }
      ).observationTemplateContentHash =
        job.blindedInput.observationTemplate.contentHash;
      const compiled = bench.compileCluegiverS1AssessorPrompt(
        job.blindedInput.observationTemplate,
        build,
      );
      const payload = bench.cluegiverS1AssessorProviderPayload(compiled);
      Object.assign(
        job.compiledPromptTemplate as unknown as Record<string, unknown>,
        {
          id: `compiled:${job.blindedInput.observationTemplate.decisionId}`,
          contentHash: compiled.contentHash,
          observationTemplateContentHash:
            job.blindedInput.observationTemplate.contentHash,
          placeholderIndependentContentHash:
            bench.cluegiverS1AssessorPlaceholderIndependentContentHash(
              compiled,
            ),
          providerPayloadContentHash: contentHash(payload),
          systemPromptSha256: sha256Hex(payload.systemPrompt),
          taskPromptSha256: sha256Hex(payload.taskPrompt),
          actionContractSha256: sha256Hex(payload.actionContract),
        },
      );
    }
    recomputeHash(candidate, "preregistrationContentHash");
  }

  function refreshCluegiverBotBuildDependents(
    candidate: typeof manifest,
    arm: typeof CLUEGIVER_S1_C0_ARM | typeof CLUEGIVER_S1_C1_ARM,
  ): void {
    const build = candidate.botBuilds.cluegiverByArm[arm];
    recomputeBotBuildHash(build);
    for (const job of candidate.dag.jobs) {
      if (job.role !== "cluegiver" || job.arm !== arm) continue;
      (
        job.observation.identities.botBuild as unknown as {
          contentHash: string;
        }
      ).contentHash = build.contentHash;
      recomputeHash(job.observation, "contentHash");
      const compiled = compileCluegiverS1Prompt({
        observation: job.observation,
        botBuild: build,
        arm,
        compiler: candidate.implementationBindings.cluegiverPromptCompiler,
      });
      const payload = cluegiverS1ProviderPayload(compiled);
      Object.assign(job.compiledPrompt as unknown as Record<string, unknown>, {
        id: compiled.carrier.id,
        contentHash: compiled.contentHash,
        systemPromptSha256: sha256Hex(payload.systemPrompt),
        userPromptSha256: sha256Hex(payload.userPrompt),
        candidateBlockRemovedUserPromptSha256:
          candidateBlockRemovedPromptSha256(compiled),
      });
    }
    recomputeHash(candidate, "preregistrationContentHash");
  }

  const assessorBotBuildRewriteCases: readonly [
    label: string,
    mutateBuild: (build: Record<string, unknown>) => void,
  ][] = [
    [
      "context compiler",
      (build) => {
        (
          build.compilation as { contextCompiler: { id: string } }
        ).contextCompiler.id = "unreviewed";
      },
    ],
    [
      "action validator",
      (build) => {
        (
          build.execution as { actionValidator: { id: string } }
        ).actionValidator.id = "unreviewed";
      },
    ],
    [
      "provider adapter",
      (build) => {
        (
          build.execution as { providerAdapter: { id: string } }
        ).providerAdapter.id = "unreviewed";
      },
    ],
    [
      "orchestration policy",
      (build) => {
        (
          build.execution as { orchestrationPolicy: { id: string } }
        ).orchestrationPolicy.id = "unreviewed";
      },
    ],
    [
      "strategy artifact",
      (build) => {
        (build.strategyArtifact as { id: string }).id = "unreviewed";
      },
    ],
  ];
  for (const [label, mutateBuild] of assessorBotBuildRewriteCases) {
    const tamperedManifest = structuredClone(manifest);
    mutateBuild(
      tamperedManifest.botBuilds.assessor as unknown as Record<string, unknown>,
    );
    refreshAssessorBotBuildDependents(tamperedManifest);
    ok(
      verifyBotBuildManifest(tamperedManifest.botBuilds.assessor),
      `self-consistently rewritten assessor ${label} build still self-verifies`,
    );
    equal(
      bench.cluegiverS1ProviderVisiblePromptProjectionHash(tamperedManifest),
      bench.CLUEGIVER_S1_REVIEWED_PROVIDER_VISIBLE_PROMPT_PROJECTION_HASH,
      `assessor ${label} rewrite retains the provider-visible projection`,
    );
    throws(
      () =>
        bench.prepareCluegiverS1Dispatch({
          preregistration: tamperedManifest,
          jobId: firstParent.jobId,
        }),
      /exact reviewed full BotBuild identities before compilation/,
      `hard full-identity pin rejects self-consistent assessor ${label} rewrite`,
    );
  }

  const cluegiverBotBuildRewriteCases: readonly [
    label: string,
    mutateBuild: (build: Record<string, unknown>) => void,
  ][] = [
    [
      "context compiler",
      (build) => {
        (
          build.compilation as { contextCompiler: { id: string } }
        ).contextCompiler.id = "unreviewed";
      },
    ],
    [
      "action validator",
      (build) => {
        (
          build.execution as { actionValidator: { id: string } }
        ).actionValidator.id = "unreviewed";
      },
    ],
    [
      "provider adapter",
      (build) => {
        (
          build.execution as { providerAdapter: { id: string } }
        ).providerAdapter.id = "unreviewed";
      },
    ],
    [
      "orchestration policy",
      (build) => {
        (
          build.execution as { orchestrationPolicy: { id: string } }
        ).orchestrationPolicy.id = "unreviewed";
      },
    ],
    [
      "strategy artifact",
      (build) => {
        (build.strategyArtifact as { id: string }).id = "unreviewed";
      },
    ],
  ];
  for (const arm of [CLUEGIVER_S1_C0_ARM, CLUEGIVER_S1_C1_ARM] as const) {
    for (const [label, mutateBuild] of cluegiverBotBuildRewriteCases) {
      const tamperedManifest = structuredClone(manifest);
      mutateBuild(
        tamperedManifest.botBuilds.cluegiverByArm[arm] as unknown as Record<
          string,
          unknown
        >,
      );
      refreshCluegiverBotBuildDependents(tamperedManifest, arm);
      ok(
        verifyCluegiverBotBuildManifest(
          tamperedManifest.botBuilds.cluegiverByArm[arm],
        ),
        `self-consistently rewritten ${arm} ${label} build still self-verifies`,
      );
      equal(
        bench.cluegiverS1ProviderVisiblePromptProjectionHash(tamperedManifest),
        bench.CLUEGIVER_S1_REVIEWED_PROVIDER_VISIBLE_PROMPT_PROJECTION_HASH,
        `${arm} ${label} rewrite retains the provider-visible projection`,
      );
      throws(
        () =>
          bench.prepareCluegiverS1Dispatch({
            preregistration: tamperedManifest,
            jobId: firstParent.jobId,
          }),
        /exact reviewed full BotBuild identities before compilation/,
        `hard full-identity pin rejects self-consistent ${arm} ${label} rewrite`,
      );
    }
  }

  const mutatedParentArtifact = structuredClone(parentArtifact);
  (
    mutatedParentArtifact.providerRequest.payload as {
      userPrompt: string;
    }
  ).userPrompt += "\nforged stored bytes";
  ok(
    !bench.verifyCluegiverS1PreparedDispatchArtifact(
      mutatedParentArtifact as unknown as CluegiverS1PreparedDispatchArtifact,
    ),
    "artifact verifier rejects provider-payload mutation",
  );

  const parentAction = {
    rationale: "RATIONAL_SENTINEL_NEVER_DOWNSTREAM",
    clues: ["ocean", "velvet", "meadow"] as [string, string, string],
  };
  const parentTerminalRecord = bench.mintCluegiverS1ParentTerminalRecord({
    jobId: firstParent.jobId,
    cellId: firstParent.cellId,
    arm: firstParent.arm,
    observation: firstParent.observation,
    action: parentAction,
  });
  equal(
    parentTerminalRecord.actionContentHash,
    contentHash(parentTerminalRecord.action),
    "terminal record binds the exact validated parent action",
  );
  equal(
    parentTerminalRecord.contentHash,
    contentHash(
      Object.fromEntries(
        Object.entries(parentTerminalRecord).filter(
          ([key]) => key !== "contentHash",
        ),
      ),
    ),
    "terminal record binds job, cell, arm, status, validation, and action hash",
  );
  throws(
    () =>
      bench.prepareCluegiverS1Dispatch({
        preregistration: manifest,
        jobId: firstAssessor.jobId,
      }),
    /one hash-bound parent terminal record/,
    "child preparation cannot bypass the single terminal-record gate",
  );
  const childArtifact = bench.prepareCluegiverS1Dispatch({
    preregistration: manifest,
    jobId: firstAssessor.jobId,
    parentTerminalRecord,
  });
  ok(
    childArtifact.artifactKind === "assessor_child_dispatch",
    "child preparation returns the assessor discriminant",
  );
  ok(
    bench.verifyCluegiverS1PreparedDispatchArtifact(childArtifact),
    "prepared assessor artifact verifies",
  );
  deepEqual(
    futureProviderAdapter(childArtifact),
    childArtifact.providerRequest,
    "future adapter boundary re-verifies the minted child immediately before dispatch",
  );
  for (const artifact of [parentArtifact, childArtifact]) {
    const unchangedStructuredClone = cloneAndDeepFreeze(
      structuredClone(artifact),
    ) as unknown as CluegiverS1PreparedDispatchArtifact;
    ok(
      !bench.verifyCluegiverS1PreparedDispatchArtifact(
        unchangedStructuredClone,
      ),
      `${artifact.artifactKind} unchanged structured clone lacks the private process-local mint capability`,
    );
    throws(
      () => futureProviderAdapter(unchangedStructuredClone),
      /mint verification immediately before dispatch/,
      `${artifact.artifactKind} future adapter boundary rejects an unchanged clone immediately before dispatch`,
    );
    const deserializedClone = cloneAndDeepFreeze(
      JSON.parse(JSON.stringify(artifact)) as unknown,
    ) as unknown as CluegiverS1PreparedDispatchArtifact;
    ok(
      !bench.verifyCluegiverS1PreparedDispatchArtifact(deserializedClone),
      `${artifact.artifactKind} JSON-rehydrated artifact is explicitly forbidden`,
    );
  }
  const artifactCapabilityTamperCases: readonly [
    label: string,
    source: CluegiverS1PreparedDispatchArtifact,
    mutateArtifact: (artifact: Record<string, unknown>) => void,
  ][] = [
    [
      "parent payload",
      parentArtifact,
      (artifact) => {
        const request = artifact.providerRequest as {
          payload: { userPrompt: string };
          payloadContentHash: string;
        };
        request.payload.userPrompt += "\nself-consistent forgery";
        request.payloadContentHash = contentHash(request.payload);
      },
    ],
    [
      "parent jobId",
      parentArtifact,
      (artifact) => {
        artifact.jobId = "forged-parent-job";
      },
    ],
    [
      "parent cellId",
      parentArtifact,
      (artifact) => {
        artifact.cellId = "forged-parent-cell";
      },
    ],
    [
      "parent arm",
      parentArtifact,
      (artifact) => {
        artifact.arm =
          parentArtifact.arm === CLUEGIVER_S1_C0_ARM
            ? CLUEGIVER_S1_C1_ARM
            : CLUEGIVER_S1_C0_ARM;
      },
    ],
    [
      "parent role",
      parentArtifact,
      (artifact) => {
        artifact.role = "opponent_interceptor";
      },
    ],
    [
      "parent compiledPromptContentHash",
      parentArtifact,
      (artifact) => {
        artifact.compiledPromptContentHash = "f".repeat(64);
      },
    ],
    [
      "parent parentTerminalRecord",
      parentArtifact,
      (artifact) => {
        artifact.parentTerminalRecord = {
          jobId: "forged",
          actionContentHash: "f".repeat(64),
          terminalRecordContentHash: "e".repeat(64),
        };
      },
    ],
    [
      "child payload",
      childArtifact,
      (artifact) => {
        const request = artifact.providerRequest as {
          payload: { taskPrompt: string };
          payloadContentHash: string;
        };
        request.payload.taskPrompt += "\nself-consistent forgery";
        request.payloadContentHash = contentHash(request.payload);
      },
    ],
    [
      "child jobId",
      childArtifact,
      (artifact) => {
        artifact.jobId = "forged-child-job";
      },
    ],
    [
      "child cellId",
      childArtifact,
      (artifact) => {
        artifact.cellId = "forged-child-cell";
      },
    ],
    [
      "child arm",
      childArtifact,
      (artifact) => {
        artifact.arm =
          childArtifact.arm === CLUEGIVER_S1_C0_ARM
            ? CLUEGIVER_S1_C1_ARM
            : CLUEGIVER_S1_C0_ARM;
      },
    ],
    [
      "child role",
      childArtifact,
      (artifact) => {
        artifact.role = "teammate_decoder";
      },
    ],
    [
      "child compiledPromptContentHash",
      childArtifact,
      (artifact) => {
        artifact.compiledPromptContentHash = "f".repeat(64);
      },
    ],
    [
      "child materializedObservationContentHash",
      childArtifact,
      (artifact) => {
        artifact.materializedObservationContentHash = "f".repeat(64);
      },
    ],
    [
      "child placeholderIndependentContentHash",
      childArtifact,
      (artifact) => {
        artifact.placeholderIndependentContentHash = "f".repeat(64);
      },
    ],
    [
      "child parentTerminalRecord",
      childArtifact,
      (artifact) => {
        (
          artifact.parentTerminalRecord as {
            jobId: string;
          }
        ).jobId = "forged-parent-job";
      },
    ],
  ];
  for (const [
    label,
    sourceArtifact,
    mutateArtifact,
  ] of artifactCapabilityTamperCases) {
    const forgedArtifact = structuredClone(sourceArtifact);
    mutateArtifact(forgedArtifact as unknown as Record<string, unknown>);
    recomputeHash(forgedArtifact, "contentHash");
    const refrozenArtifact = cloneAndDeepFreeze(
      forgedArtifact,
    ) as unknown as CluegiverS1PreparedDispatchArtifact;
    ok(
      !bench.verifyCluegiverS1PreparedDispatchArtifact(refrozenArtifact),
      `${label} structuredClone remains invalid after nested and outer rehash without private mint capability`,
    );
  }
  for (const artifact of [parentArtifact, childArtifact]) {
    deepEqual(
      artifact.providerRequest.sampling,
      bench.CLUEGIVER_S1_SAMPLING_CONTRACT,
      `${artifact.artifactKind} binds the complete sampling-key absence contract`,
    );
    for (const wireKey of ["temperature", "top_p", "seed"]) {
      ok(
        !Object.hasOwn(artifact.providerRequest, wireKey),
        `${artifact.artifactKind} omits ${wireKey} as a direct wire parameter`,
      );
    }
  }
  for (const [label, mutateArtifact] of [
    [
      "role",
      (artifact: Record<string, unknown>) => {
        artifact.role = "bogus";
      },
    ],
    [
      "kind",
      (artifact: Record<string, unknown>) => {
        artifact.artifactKind = "bogus_dispatch";
      },
    ],
  ] as const) {
    const forgedArtifact = structuredClone(childArtifact);
    mutateArtifact(forgedArtifact as unknown as Record<string, unknown>);
    recomputeHash(forgedArtifact, "contentHash");
    const refrozenArtifact = cloneAndDeepFreeze(
      forgedArtifact,
    ) as unknown as CluegiverS1PreparedDispatchArtifact;
    ok(
      !bench.verifyCluegiverS1PreparedDispatchArtifact(refrozenArtifact),
      `artifact verifier rejects hash-consistent noncanonical assessor ${label}`,
    );
  }
  for (const wireKey of ["temperature", "top_p", "seed"]) {
    const forgedArtifact = structuredClone(childArtifact);
    (forgedArtifact.providerRequest as unknown as Record<string, unknown>)[
      wireKey
    ] = 0;
    recomputeHash(forgedArtifact, "contentHash");
    const refrozenArtifact = cloneAndDeepFreeze(
      forgedArtifact,
    ) as unknown as CluegiverS1PreparedDispatchArtifact;
    ok(
      !bench.verifyCluegiverS1PreparedDispatchArtifact(refrozenArtifact),
      `artifact verifier rejects a hash-consistent direct ${wireKey} wire parameter`,
    );
  }
  for (const samplingField of Object.keys(
    bench.CLUEGIVER_S1_SAMPLING_CONTRACT,
  )) {
    const forgedArtifact = structuredClone(childArtifact);
    (
      forgedArtifact.providerRequest.sampling as unknown as Record<
        string,
        unknown
      >
    )[samplingField] = "forged_sampling_contract";
    recomputeHash(forgedArtifact, "contentHash");
    const refrozenArtifact = cloneAndDeepFreeze(
      forgedArtifact,
    ) as unknown as CluegiverS1PreparedDispatchArtifact;
    ok(
      !bench.verifyCluegiverS1PreparedDispatchArtifact(refrozenArtifact),
      `artifact verifier rejects hash-consistent ${samplingField} sampling-contract drift`,
    );
  }
  const independentlyMaterialized =
    bench.materializeAssessorObservationFromParentAction(
      firstAssessor.blindedInput.observationTemplate,
      parentTerminalRecord.action,
      manifest.botBuilds.assessor,
    );
  const independentlyCompiledChild = bench.compileCluegiverS1AssessorPrompt(
    independentlyMaterialized,
    manifest.botBuilds.assessor,
  );
  deepEqual(
    childArtifact.providerRequest.payload,
    bench.cluegiverS1AssessorProviderPayload(independentlyCompiledChild),
    "child artifact carries the exact freshly materialized and compiled payload",
  );
  equal(
    childArtifact.materializedObservationContentHash,
    independentlyMaterialized.contentHash,
    "child artifact binds the verified materialized observation",
  );
  ok(
    !canonicalJson(childArtifact).includes(parentAction.rationale),
    "parent rationale cannot enter the prepared child artifact",
  );
  throws(
    () =>
      bench.prepareCluegiverS1Dispatch({
        preregistration: manifest,
        jobId: firstParent.jobId,
        parentTerminalRecord,
      }),
    /parent preparation cannot consume/,
    "parent preparation cannot consume a child-only terminal record",
  );

  const otherParent = manifest.dag.jobs.find(
    (job) => job.role === "cluegiver" && job.jobId !== firstParent.jobId,
  )!;
  ok(otherParent.role === "cluegiver", "cross-parent fixture resolves");
  const otherParentRecord = bench.mintCluegiverS1ParentTerminalRecord({
    jobId: otherParent.jobId,
    cellId: otherParent.cellId,
    arm: otherParent.arm,
    observation: otherParent.observation,
    action: {
      rationale: "private",
      clues: [...bench.CLUEGIVER_S1_CLUE_PLACEHOLDERS],
    },
  });
  throws(
    () =>
      bench.prepareCluegiverS1Dispatch({
        preregistration: manifest,
        jobId: firstAssessor.jobId,
        parentTerminalRecord: otherParentRecord,
      }),
    /exact hash-bound succeeded parent terminal record/,
    "child preparation rejects a valid record from another parent and cell",
  );

  for (const [label, mutateRecord] of [
    [
      "cell",
      (record: Record<string, unknown>) => {
        record.cellId = otherParent.cellId;
      },
    ],
    [
      "arm",
      (record: Record<string, unknown>) => {
        record.arm =
          firstParent.arm === CLUEGIVER_S1_C0_ARM
            ? CLUEGIVER_S1_C1_ARM
            : CLUEGIVER_S1_C0_ARM;
      },
    ],
    [
      "terminal status",
      (record: Record<string, unknown>) => {
        record.terminalStatus = "failed";
      },
    ],
    [
      "action hash",
      (record: Record<string, unknown>) => {
        record.actionContentHash = "f".repeat(64);
      },
    ],
  ] as const) {
    const tamperedRecord = structuredClone(parentTerminalRecord);
    mutateRecord(tamperedRecord as unknown as Record<string, unknown>);
    recomputeHash(tamperedRecord, "contentHash");
    throws(
      () =>
        bench.prepareCluegiverS1Dispatch({
          preregistration: manifest,
          jobId: firstAssessor.jobId,
          parentTerminalRecord: tamperedRecord,
        }),
      /exact hash-bound succeeded parent terminal record/,
      `child preparation rejects ${label} tampering even with a recomputed record hash`,
    );
  }
  const recordHashTamper = structuredClone(parentTerminalRecord);
  (recordHashTamper as unknown as { contentHash: string }).contentHash =
    "f".repeat(64);
  throws(
    () =>
      bench.prepareCluegiverS1Dispatch({
        preregistration: manifest,
        jobId: firstAssessor.jobId,
        parentTerminalRecord: recordHashTamper,
      }),
    /exact hash-bound succeeded parent terminal record/,
    "child preparation rejects terminal-record content-hash tampering",
  );

  const roundTrippedManifest = JSON.parse(
    JSON.stringify(manifest),
  ) as typeof manifest;
  const roundTripArtifact = bench.prepareCluegiverS1Dispatch({
    preregistration: roundTrippedManifest,
    jobId: firstParent.jobId,
  });
  ok(
    bench.verifyCluegiverS1PreparedDispatchArtifact(roundTripArtifact),
    "canonical route and execution copies survive an ordinary JSON round trip",
  );

  for (const [label, mutateManifest] of [
    [
      "top-level route",
      (candidate: typeof manifest) => {
        (
          candidate as unknown as {
            route: { route: { maxTokens: number } };
          }
        ).route.route.maxTokens = 1;
      },
    ],
    [
      "per-job route",
      (candidate: typeof manifest) => {
        (
          candidate.dag.jobs[0] as unknown as {
            route: { route: { maxTokens: number } };
          }
        ).route.route.maxTokens = 1;
      },
    ],
  ] as const) {
    const tamperedManifest = structuredClone(manifest);
    mutateManifest(tamperedManifest);
    recomputeHash(tamperedManifest, "preregistrationContentHash");
    throws(
      () =>
        bench.prepareCluegiverS1Dispatch({
          preregistration: tamperedManifest,
          jobId: firstParent.jobId,
        }),
      /exact round-trippable|route\/execution copy/,
      `dispatch preparation rejects ${label} drift after manifest rehash`,
    );
  }

  for (const scope of ["top-level", "per-job"] as const) {
    for (const samplingField of Object.keys(
      bench.CLUEGIVER_S1_SAMPLING_CONTRACT,
    )) {
      const tamperedManifest = JSON.parse(
        JSON.stringify(manifest),
      ) as typeof manifest;
      const route =
        scope === "top-level"
          ? tamperedManifest.route
          : tamperedManifest.dag.jobs[0]!.route;
      (route.sampling as unknown as Record<string, unknown>)[samplingField] =
        "forged_sampling_contract";
      recomputeHash(tamperedManifest, "preregistrationContentHash");
      throws(
        () =>
          bench.prepareCluegiverS1Dispatch({
            preregistration: tamperedManifest,
            jobId: firstParent.jobId,
          }),
        /exact round-trippable|route\/execution copy/,
        `dispatch preparation rejects hash-consistent ${scope} ${samplingField} drift`,
      );
    }
  }

  const topLevelExecutionTamperCases: readonly [
    label: string,
    field: string,
    replacement: unknown,
  ][] = [
    ["mode", "mode", "live"],
    ["provider dispatch", "providerDispatch", "allowed"],
    ["database access", "databaseAccess", "allowed"],
    ["network access", "networkAccess", "allowed"],
    ["provider calls this run", "providerCallsThisRun", 1],
    ["planned provider calls", "plannedProviderCallsAfterReview", 55],
    ["maximum attempts per job", "maximumAttemptsPerJob", 2],
    ["top-level max tokens", "maxTokensPerJob", 1],
    ["concurrency", "concurrency", 5],
    ["concurrency scope", "concurrencyScope", "dag_relaxation"],
    ["dependency scheduling", "dependencyScheduling", "caller_attested_ids"],
    ["top-level retries", "retries", 1],
    ["top-level fallbacks", "fallbacks", 1],
    ["provider call license", "providerCallLicense", "licensed"],
    ["executor contract", "executorContract", {}],
    ["unknown execution field", "inventedExecutionControl", true],
  ];
  for (const [label, field, replacement] of topLevelExecutionTamperCases) {
    const tamperedManifest = JSON.parse(
      JSON.stringify(manifest),
    ) as typeof manifest;
    (tamperedManifest.execution as unknown as Record<string, unknown>)[field] =
      replacement;
    recomputeHash(tamperedManifest, "preregistrationContentHash");
    throws(
      () =>
        bench.prepareCluegiverS1Dispatch({
          preregistration: tamperedManifest,
          jobId: firstParent.jobId,
        }),
      /exact round-trippable top-level route and execution plan|exact implementation-bound preregistration/,
      `dispatch preparation rejects hash-consistent top-level ${label} drift`,
    );
  }

  const jobExecutionTamperCases: readonly [
    label: string,
    field: string,
    replacement: unknown,
  ][] = [
    ["status", "status", "completed"],
    ["provider dispatch count", "providerDispatches", 1],
    ["outcome", "outcome", { unexpected: true }],
    ["maximum attempts", "maximumAttempts", 2],
    ["max tokens", "maxTokens", 1],
    ["retries", "retries", 1],
    ["fallbacks", "fallbacks", 1],
    ["warning", "warningMs", 1],
    ["hard stop", "hardStopMs", 1],
  ];
  for (const scope of ["top-level", "per-job"] as const) {
    for (const [label, field, replacement] of jobExecutionTamperCases) {
      const tamperedManifest = JSON.parse(
        JSON.stringify(manifest),
      ) as typeof manifest;
      const plan =
        scope === "top-level"
          ? tamperedManifest.execution.jobExecutionPlan
          : tamperedManifest.dag.jobs[0]!.execution;
      (plan as unknown as Record<string, unknown>)[field] = replacement;
      recomputeHash(tamperedManifest, "preregistrationContentHash");
      throws(
        () =>
          bench.prepareCluegiverS1Dispatch({
            preregistration: tamperedManifest,
            jobId: firstParent.jobId,
          }),
        /exact round-trippable|route\/execution copy/,
        `dispatch preparation rejects hash-consistent ${scope} job execution ${label} drift`,
      );
    }
  }

  for (const field of [
    "observationTemplateContentHash",
    "contentHash",
    "placeholderIndependentContentHash",
    "providerPayloadContentHash",
    "systemPromptSha256",
    "taskPromptSha256",
    "actionContractSha256",
  ] as const) {
    const tamperedManifest = structuredClone(manifest);
    const tamperedChild = tamperedManifest.dag.jobs.find(
      (job) => job.jobId === firstAssessor.jobId,
    )!;
    ok(tamperedChild.role !== "cluegiver", `${field} tamper child resolves`);
    (
      tamperedChild.compiledPromptTemplate as unknown as Record<string, unknown>
    )[field] = "f".repeat(64);
    recomputeHash(tamperedManifest, "preregistrationContentHash");
    throws(
      () =>
        bench.prepareCluegiverS1Dispatch({
          preregistration: tamperedManifest,
          jobId: firstAssessor.jobId,
          parentTerminalRecord,
        }),
      /template hash drifted/,
      `dispatch preparation recomputes and rejects ${field}`,
    );
  }

  for (const [label, mutateManifest] of [
    [
      "cell",
      (candidate: typeof manifest) => {
        (
          candidate.dag.jobs.find(
            (job) => job.jobId === firstAssessor.jobId,
          ) as unknown as { cellId: string }
        ).cellId = otherParent.cellId;
      },
    ],
    [
      "arm",
      (candidate: typeof manifest) => {
        const child = candidate.dag.jobs.find(
          (job) => job.jobId === firstAssessor.jobId,
        )!;
        (child as unknown as { arm: string }).arm =
          child.arm === CLUEGIVER_S1_C0_ARM
            ? CLUEGIVER_S1_C1_ARM
            : CLUEGIVER_S1_C0_ARM;
      },
    ],
    [
      "role",
      (candidate: typeof manifest) => {
        const child = candidate.dag.jobs.find(
          (job) => job.jobId === firstAssessor.jobId,
        )!;
        (child as unknown as { role: string }).role = "bogus";
        (
          child as unknown as {
            templateBinding: { role: string };
          }
        ).templateBinding.role = "bogus";
      },
    ],
    [
      "replication",
      (candidate: typeof manifest) => {
        (
          candidate.dag.jobs.find(
            (job) => job.jobId === firstAssessor.jobId,
          ) as unknown as { assessorReplication: number }
        ).assessorReplication = firstAssessor.assessorReplication === 1 ? 2 : 1;
      },
    ],
    [
      "template binding",
      (candidate: typeof manifest) => {
        const child = candidate.dag.jobs.find(
          (job) => job.jobId === firstAssessor.jobId,
        )!;
        if (child.role !== "cluegiver") {
          (child.templateBinding as unknown as { cellId: string }).cellId =
            otherParent.cellId;
        }
      },
    ],
  ] as const) {
    const tamperedManifest = structuredClone(manifest);
    mutateManifest(tamperedManifest);
    recomputeHash(tamperedManifest, "preregistrationContentHash");
    throws(
      () =>
        bench.prepareCluegiverS1Dispatch({
          preregistration: tamperedManifest,
          jobId: firstAssessor.jobId,
          parentTerminalRecord,
        }),
      /canonical cell graph|canonical cell\/job binding|canonical assessor template binding|exact assessor role/,
      `dispatch preparation rejects canonical ${label} drift`,
    );
  }

  const exactManifestTamperCases: readonly [
    label: string,
    mutateManifest: (candidate: typeof manifest) => void,
  ][] = [
    [
      "persistence uniqueness scope",
      (candidate) => {
        (
          candidate.dag.jobs[0]!.persistence as unknown as {
            uniquenessScope: string;
          }
        ).uniquenessScope = "cell_only";
      },
    ],
    [
      "unknown persistence field",
      (candidate) => {
        (
          candidate.dag.jobs[0]!.persistence as unknown as Record<
            string,
            unknown
          >
        ).futurePersistenceMode = "unreviewed";
      },
    ],
    [
      "unknown parent-job field",
      (candidate) => {
        (
          candidate.dag.jobs.find(
            (job) => job.role === "cluegiver",
          ) as unknown as Record<string, unknown>
        ).futureExecutorOverride = "unreviewed";
      },
    ],
    [
      "cell position hash",
      (candidate) => {
        (
          candidate.dag.cells[0] as unknown as { positionHash: string }
        ).positionHash = "f".repeat(64);
      },
    ],
    [
      "cell history strata",
      (candidate) => {
        (
          candidate.dag.cells[0] as unknown as {
            historyStrata: string[];
          }
        ).historyStrata[0] = "history_free";
      },
    ],
    [
      "unknown cell field",
      (candidate) => {
        (
          candidate.dag.cells[0] as unknown as Record<string, unknown>
        ).futureCellPolicy = "unreviewed";
      },
    ],
    [
      "child materializer label",
      (candidate) => {
        const child = candidate.dag.jobs.find(
          (job) => job.role === "opponent_interceptor",
        )!;
        ok(child.role !== "cluegiver", "materializer tamper child resolves");
        (
          child.blindedInput.parentOutputProjection as unknown as {
            materializer: string;
          }
        ).materializer = "unreviewed";
      },
    ],
    [
      "unknown parent-output projection field",
      (candidate) => {
        const child = candidate.dag.jobs.find(
          (job) => job.role === "opponent_interceptor",
        )!;
        ok(child.role !== "cluegiver", "projection tamper child resolves");
        (
          child.blindedInput.parentOutputProjection as unknown as Record<
            string,
            unknown
          >
        ).futureProjection = true;
      },
    ],
    [
      "assessor policy id",
      (candidate) => {
        const child = candidate.dag.jobs.find(
          (job) => job.role === "opponent_interceptor",
        )!;
        ok(child.role !== "cluegiver", "policy tamper child resolves");
        (child.policy as unknown as { id: string }).id = "unreviewed";
      },
    ],
    [
      "assessor prompt-compiler implementation",
      (candidate) => {
        const child = candidate.dag.jobs.find(
          (job) => job.role === "opponent_interceptor",
        )!;
        ok(child.role !== "cluegiver", "compiler tamper child resolves");
        (child.promptCompiler.implementation as unknown as { id: string }).id =
          "unreviewed";
      },
    ],
    [
      "assessor action-validator identity",
      (candidate) => {
        const child = candidate.dag.jobs.find(
          (job) => job.role === "opponent_interceptor",
        )!;
        ok(child.role !== "cluegiver", "validator tamper child resolves");
        (child.actionValidator as unknown as { id: string }).id = "unreviewed";
      },
    ],
    [
      "parent action-contract identity",
      (candidate) => {
        const parent = candidate.dag.jobs.find(
          (job) => job.role === "cluegiver",
        )!;
        ok(parent.role === "cluegiver", "action-contract parent resolves");
        (parent.actionContract as unknown as { id: string }).id = "unreviewed";
      },
    ],
    [
      "parent output contract",
      (candidate) => {
        const parent = candidate.dag.jobs.find(
          (job) => job.role === "cluegiver",
        )!;
        ok(parent.role === "cluegiver", "output-contract parent resolves");
        (
          parent.outputContract as unknown as {
            publishToChildren: string;
          }
        ).publishToChildren = "everything";
      },
    ],
    [
      "unknown parent output-contract field",
      (candidate) => {
        const parent = candidate.dag.jobs.find(
          (job) => job.role === "cluegiver",
        )!;
        ok(parent.role === "cluegiver", "output-contract parent resolves");
        (
          parent.outputContract as unknown as Record<string, unknown>
        ).futureVisibility = "unreviewed";
      },
    ],
    [
      "unknown assessor-job field",
      (candidate) => {
        const child = candidate.dag.jobs.find(
          (job) => job.role === "opponent_interceptor",
        )!;
        (child as unknown as Record<string, unknown>).futureAssessorOverride =
          "unreviewed";
      },
    ],
  ];
  for (const [label, mutateManifest] of exactManifestTamperCases) {
    const tamperedManifest = structuredClone(manifest);
    mutateManifest(tamperedManifest);
    recomputeHash(tamperedManifest, "preregistrationContentHash");
    throws(
      () =>
        bench.prepareCluegiverS1Dispatch({
          preregistration: tamperedManifest,
          jobId: firstAssessor.jobId,
          parentTerminalRecord,
        }),
      /canonical cell|exact canonical parent job contract|exact canonical assessor job contract/,
      `dispatch preparation rejects hash-consistent ${label}`,
    );
  }

  const extraNestedField = structuredClone(
    firstParent.observation,
  ) as unknown as {
    resolvedRounds: Array<{
      own: Record<string, unknown>;
    }>;
    contentHash: string;
  };
  extraNestedField.resolvedRounds[0]!.own.decodedCorrectly = true;
  const { contentHash: _oldObservationHash, ...extraNestedFieldSource } =
    extraNestedField;
  (extraNestedField as unknown as { contentHash: string }).contentHash =
    contentHash(extraNestedFieldSource);
  ok(
    validateCluegiverObservation(
      extraNestedField as unknown as DecryptoCluegiverObservation,
    ).some((problem) => problem.includes('unknown field "decodedCorrectly"')),
    "strict shared cluegiver observation rejects extra resolved-round fields",
  );
  throws(
    () =>
      compileCluegiverS1Prompt({
        observation:
          extraNestedField as unknown as DecryptoCluegiverObservation,
        botBuild: manifest.botBuilds.cluegiverByArm[firstParent.arm],
        arm: CLUEGIVER_S1_C0_ARM,
        compiler: manifest.implementationBindings.cluegiverPromptCompiler,
      }),
    /cluegiver observation must verify/,
    "cluegiver compiler rejects ad-hoc nested observation shapes",
  );
  const firstCluegiverBuild =
    manifest.botBuilds.cluegiverByArm[firstParent.arm];
  throws(
    () =>
      compileCluegiverS1Prompt({
        observation: firstParent.observation,
        botBuild: undefined as unknown as CluegiverBotBuildManifest,
        arm: firstParent.arm,
        compiler: manifest.implementationBindings.cluegiverPromptCompiler,
      }),
    /BotBuild manifest is unresolved/,
    "cluegiver compiler rejects an unresolved BotBuild manifest",
  );
  throws(
    () =>
      compileCluegiverS1Prompt({
        observation: firstParent.observation,
        botBuild: manifest.botBuilds.assessor,
        arm: firstParent.arm,
        compiler: manifest.implementationBindings.cluegiverPromptCompiler,
      }),
    /cluegiver decision requires a cluegiver-scope BotBuild/,
    "cluegiver compiler rejects a decoder-scope BotBuild",
  );
  const tamperedCluegiverBuild = structuredClone(firstCluegiverBuild);
  (tamperedCluegiverBuild as unknown as { contentHash: string }).contentHash =
    "f".repeat(64);
  throws(
    () =>
      compileCluegiverS1Prompt({
        observation: firstParent.observation,
        botBuild: tamperedCluegiverBuild,
        arm: firstParent.arm,
        compiler: manifest.implementationBindings.cluegiverPromptCompiler,
      }),
    /BotBuild manifest must verify/,
    "cluegiver compiler rejects a tampered cluegiver BotBuild",
  );
  const forgedCompilerForCall = structuredClone(
    manifest.implementationBindings.cluegiverPromptCompiler,
  );
  (forgedCompilerForCall as unknown as { contentHash: string }).contentHash =
    "f".repeat(64);
  throws(
    () =>
      compileCluegiverS1Prompt({
        observation: firstParent.observation,
        botBuild: firstCluegiverBuild,
        arm: CLUEGIVER_S1_C0_ARM,
        compiler: forgedCompilerForCall,
      }),
    /structurally verified implementation-byte binding/,
    "cluegiver compiler rejects ad-hoc caller-supplied compiler hashes",
  );

  const firstPayload = cluegiverS1ProviderPayload(
    compileCluegiverS1Prompt({
      observation: firstParent.observation,
      botBuild: firstCluegiverBuild,
      arm: firstParent.arm,
      compiler: manifest.implementationBindings.cluegiverPromptCompiler,
    }),
  );
  throws(
    () =>
      assertCluegiverS1ProviderPayload({
        ...firstPayload,
        arm: CLUEGIVER_S1_C0_ARM,
      } as unknown as CluegiverS1ProviderPayload),
    /unknown field "arm"/,
    "provider payload rejects control-plane fields",
  );
  throws(
    () =>
      assertCluegiverS1ProviderPayload({
        ...firstPayload,
        userPrompt: `${firstPayload.userPrompt}\n${CLUEGIVER_S1_C0_ARM}`,
      }),
    /control-plane cue/,
    "provider payload rejects visible arm names",
  );

  deepEqual(
    bench.validatePlannedJobGroundTruthActions(fixture),
    [],
    "future decode and intercept scoring truths are action-legal",
  );
  deepEqual(
    validateJointAssignmentAction(
      { kind: "guess", role: "decode", guess: [1, 3, 4] },
      "decoder",
    ),
    [],
    "shared decoder action validator is bound and usable",
  );
  deepEqual(
    validateJointAssignmentAction(
      { kind: "guess", role: "intercept", guess: [1, 3, 4] },
      "interceptor",
    ),
    [],
    "shared interceptor action validator is bound and usable",
  );
  ok(
    manifest.dag.jobs.every(
      (job) => job.arm !== (CLUEGIVER_S1_RESERVED_C2_ARM as string),
    ),
    "reserved C2 has no scheduled jobs",
  );
  equal(
    manifest.treatment.reservedC2.scheduledJobs,
    0,
    "manifest explicitly records zero C2 jobs",
  );
  equal(
    manifest.treatment.c1.comparison,
    "full_explicit_four_check_package_over_implicit_old_instruction",
    "C1-C0 estimand is the full explicit four-check package",
  );
  deepEqual(
    manifest.treatment.promptLength,
    {
      includedInTreatmentPackage: true,
      heldConstant: false,
      c1MinusC0UserPromptUtf8Bytes:
        bench.CLUEGIVER_S1_C1_PROMPT_LENGTH_DELTA_UTF8_BYTES,
    },
    "treatment explicitly includes the prompt-length increase",
  );
  equal(
    manifest.treatment.reservedC2.futureContrast,
    "only_future_C1_minus_C2_may_isolate_item_4",
    "item-4 isolation is reserved for future C1-C2",
  );

  equal(
    manifest.outcomeSpec.independentUnit,
    "position",
    "position is the independent unit",
  );
  equal(
    manifest.outcomeSpec.matchedCellMetrics.net,
    "decodeRate_minus_interceptRate",
    "cell net estimand is decode minus intercept",
  );
  equal(
    manifest.outcomeSpec.descriptivePairedContrast.contrast,
    "C1_minus_C0",
    "paired descriptive contrast is C1-C0",
  );
  deepEqual(
    manifest.outcomeSpec.interceptorSlotDescription.strata,
    ["history_bearing", "history_free"],
    "interceptor per-slot results stratify by history bearing",
  );
  equal(
    manifest.outcomeSpec.teammateDecodeGuardrail.minimumAbsoluteC1DecodeRate,
    0.75,
    "absolute C1 decode floor is 0.75",
  );
  equal(
    manifest.outcomeSpec.teammateDecodeGuardrail
      .maximumC1DecodeRateDeficitVersusC0,
    0.1,
    "maximum C1 decode deficit is 0.10",
  );
  equal(
    manifest.outcomeSpec.assessorReplication.clustering,
    "three assessor calls share one clue set and are not independent units",
    "assessor replications are explicitly clustered",
  );
  deepEqual(
    manifest.outcomeSpec.assessorReplication.sampling,
    bench.CLUEGIVER_S1_SAMPLING_CONTRACT,
    "assessor replication binds uncontrolled provider sampling and repeated physical draws",
  );
  equal(
    manifest.outcomeSpec.assessorReplication.sampling.replicationInterpretation,
    "repeated_physical_draws_not_independent_positions",
    "same-prompt assessor calls are repeated draws, not independent positions",
  );
  equal(
    manifest.outcomeSpec.interpretation.inference,
    "forbidden",
    "mechanism canary makes no inference",
  );
  equal(
    manifest.outcomeSpec.interpretation.promotion,
    "forbidden",
    "mechanism canary makes no promotion",
  );
  equal(
    manifest.outcomeSpec.mechanismCanaryLimitations.notBalancedForEfficacy,
    true,
    "digit/slot/history imbalance is disclosed",
  );
  deepEqual(
    manifest.outcomeSpec.mechanismCanaryLimitations.historyStratumSlotCounts,
    {
      slot1: { historyBearing: 2, historyFree: 2 },
      slot2: { historyBearing: 3, historyFree: 1 },
      slot3: { historyBearing: 4, historyFree: 0 },
      overall: { historyBearing: 9, historyFree: 3 },
    },
    "exact history-stratum imbalance is preregistered",
  );
  equal(
    manifest.outcomeSpec.mechanismCanaryLimitations.derivation,
    "computed_from_fixture_focal_codes_and_resolved_round_one_codes",
    "imbalance disclosure identifies its fixture derivation",
  );
  const derivedFixtureBalance = bench.deriveCluegiverS1FixtureBalance(
    fixture.positions,
  );
  deepEqual(
    {
      focalCodeDigitCounts:
        manifest.outcomeSpec.mechanismCanaryLimitations.focalCodeDigitCounts,
      historyStratumSlotCounts:
        manifest.outcomeSpec.mechanismCanaryLimitations
          .historyStratumSlotCounts,
    },
    derivedFixtureBalance,
    "all disclosed digit/history counts are mechanically derived from the fixture",
  );
  const alteredPositions = structuredClone(fixture.positions);
  alteredPositions[0]!.focal.code[0] =
    alteredPositions[0]!.focal.code[0] === 4 ? 1 : 4;
  ok(
    canonicalJson(bench.deriveCluegiverS1FixtureBalance(alteredPositions)) !==
      canonicalJson(derivedFixtureBalance),
    "fixture-derived imbalance changes when the fixture changes",
  );

  const secondManifest = await bench.buildCluegiverS1Preregistration(
    fixture,
    sources,
  );
  deepEqual(secondManifest, manifest, "full 56-job manifest is deterministic");
  equal(
    manifest.preregistrationContentHash,
    contentHash(
      Object.fromEntries(
        Object.entries(manifest).filter(
          ([key]) => key !== "preregistrationContentHash",
        ),
      ),
    ),
    "manifest canonical self-hash verifies",
  );

  const receiptBytes = await readFile(receiptPath, "utf8");
  const receipt = JSON.parse(receiptBytes) as Record<string, unknown>;
  const expectedReceipt = bench.buildCluegiverS1DryRunReceipt(
    manifest,
    sources,
  );
  equal(
    receipt.receiptVersion,
    "decrypto-cluegiver-s1-prereg-dry-run-receipt@0.4.0",
    "receipt schema and truthful v0.4 filename align",
  );
  deepEqual(
    receipt,
    expectedReceipt,
    "every checked-in receipt field is mechanically regenerated",
  );
  equal(
    receiptBytes,
    bench.renderCluegiverS1DryRunReceipt(expectedReceipt),
    "--emit-receipt rendering exactly regenerates the checked-in bytes",
  );
  equal(
    receipt.contentHash,
    contentHash(
      Object.fromEntries(
        Object.entries(receipt).filter(([key]) => key !== "contentHash"),
      ),
    ),
    "receipt self-hash verifies",
  );
  equal(
    receipt.fixtureContentHash,
    fixture.contentHash,
    "receipt binds the exact role-complete fixture",
  );
  equal(
    receipt.baseCommit,
    manifest.baseCommit,
    "receipt baseCommit is computed from the manifest",
  );
  equal(
    receipt.reviewedPreregistrationParentCommit,
    manifest.amendmentProvenance.reviewedPreregistrationParentCommit,
    "receipt binds the reviewed preregistration scaffold parent",
  );
  equal(
    receipt.preregistrationContentHash,
    manifest.preregistrationContentHash,
    "receipt binds the full deterministic manifest",
  );
  equal(
    receipt.cellsContentHash,
    contentHash(manifest.dag.cells),
    "receipt binds all eight ordered cell descriptors",
  );
  equal(
    receipt.jobsContentHash,
    contentHash(manifest.dag.jobs),
    "receipt binds all 56 ordered job descriptors",
  );
  equal(
    receipt.jobIdsContentHash,
    contentHash(manifest.dag.jobs.map((job) => job.jobId)),
    "receipt binds exact topological job-id order",
  );
  equal(
    receipt.firstJobId,
    manifest.dag.jobs[0]!.jobId,
    "receipt derives the first topological job ID",
  );
  equal(
    receipt.lastJobId,
    manifest.dag.jobs[manifest.dag.jobs.length - 1]!.jobId,
    "receipt derives the last topological job ID",
  );
  equal(
    receipt.cellCount,
    manifest.dag.cells.length,
    "receipt derives the exact cell count",
  );
  equal(
    receipt.jobCount,
    manifest.dag.jobs.length,
    "receipt derives the exact job count",
  );
  equal(
    receipt.compilerImplementationSha256,
    sources.experimentCompilerImplementation.sha256,
    "receipt binds cluegiver compiler implementation bytes",
  );
  equal(
    receipt.compilerIdentityHash,
    manifest.implementationBindings.cluegiverPromptCompiler.contentHash,
    "receipt binds the computed cluegiver compiler identity",
  );
  equal(
    receipt.executionPreparationImplementationSha256,
    sources.executionPreparationImplementation.sha256,
    "receipt binds job-ID, terminal-record, preparation, artifact, and receipt implementation bytes",
  );
  equal(
    receipt.reviewedBotBuildIdentitySourceSha256,
    sources.reviewedBotBuildIdentitySource.sha256,
    "receipt binds the independently source-bound reviewed BotBuild pins",
  );
  equal(
    receipt.assessorBotBuildContentHash,
    manifest.botBuilds.assessor.contentHash,
    "receipt pins the full assessor BotBuild identity",
  );
  equal(
    receipt.cluegiverC0BotBuildContentHash,
    manifest.botBuilds.cluegiverByArm[CLUEGIVER_S1_C0_ARM].contentHash,
    "receipt pins the full C0 cluegiver BotBuild identity",
  );
  equal(
    receipt.cluegiverC1BotBuildContentHash,
    manifest.botBuilds.cluegiverByArm[CLUEGIVER_S1_C1_ARM].contentHash,
    "receipt pins the full C1 cluegiver BotBuild identity",
  );
  equal(
    receipt.historicalReceiptV02BytesSha256,
    bench.CLUEGIVER_S1_HISTORICAL_V02_RECEIPT_BYTES_SHA256,
    "v0.4 receipt binds the immutable historical v0.2 raw-byte hash",
  );
  equal(
    receipt.jointAssignmentImplementationSha256,
    sources.jointAssignmentCompilerImplementation.sha256,
    "receipt binds assessor compiler implementation bytes",
  );
  equal(
    receipt.jointAssignmentCompilerContractHash,
    manifest.implementationBindings.jointAssignmentPromptCompilerContract
      .contentHash,
    "receipt binds the computed shared assessor compiler contract",
  );
  equal(receipt.maxTokens, 65_536, "receipt freezes executor maxTokens");
  equal(receipt.concurrency, 4, "receipt freezes executor concurrency");
  equal(
    receipt.routePlanHash,
    bench.CLUEGIVER_S1_ROUTE_PLAN_HASH,
    "receipt binds the exact route identity",
  );
  equal(
    receipt.executorContractHash,
    manifest.execution.executorContract.contentHash,
    "receipt binds the exact executor contract identity",
  );
  equal(
    receipt.providerVisiblePromptProjectionHash,
    bench.CLUEGIVER_S1_REVIEWED_PROVIDER_VISIBLE_PROMPT_PROJECTION_HASH,
    "receipt binds the unchanged provider-visible prompt projection",
  );
  equal(receipt.providerCallsThisRun, 0, "receipt records zero provider calls");
  equal(
    receipt.integrationGate,
    "satisfied_at_reviewed_integration_head",
    "receipt records satisfied shared-contract integration",
  );
  equal(
    receipt.reviewedCluegiverObservationSourceSha256,
    bench.CLUEGIVER_S1_REVIEWED_CLUEGIVER_OBSERVATION_SHA256,
    "receipt pins the adopted shared cluegiver observation source",
  );
  equal(
    receipt.reviewedCluegiverBuildSourceSha256,
    bench.CLUEGIVER_S1_REVIEWED_CLUEGIVER_BUILD_SHA256,
    "receipt pins the adopted shared cluegiver build source",
  );

  const [runnerSource, policySource, executionPreparationSource] =
    await Promise.all([
      readFile(
        resolve(moduleDirectory, "run-decrypto-cluegiver-s1-prereg.ts"),
        "utf8",
      ),
      readFile(
        resolve(moduleDirectory, "lib/decrypto-cluegiver-s1-policies.ts"),
        "utf8",
      ),
      readFile(
        resolve(
          moduleDirectory,
          "lib/decrypto-cluegiver-s1-execution-preparation.ts",
        ),
        "utf8",
      ),
    ]);
  for (const [label, source] of [
    ["runner", runnerSource],
    ["policy/compiler", policySource],
    ["execution preparation", executionPreparationSource],
  ] as const) {
    ok(!/\bfetch\s*\(/.test(source), `${label} has no fetch call`);
    ok(
      !/\bprocess\.env\b/.test(source),
      `${label} reads no environment credentials`,
    );
    ok(!/https?:\/\//.test(source), `${label} contains no network endpoint`);
    ok(
      !/from\s+["'](?:openai|@anthropic-ai|openrouter|axios|undici)/.test(
        source,
      ),
      `${label} imports no provider or network SDK`,
    );
  }
  ok(
    !runnerSource.includes("persistedDependencyJobIds") &&
      !runnerSource.includes("assertCluegiverS1ExecutorDispatchReady"),
    "obsolete caller-attested dependency IDs and void readiness API are absent",
  );
  for (const loadBearingExport of [
    "makeCluegiverS1ParentJobId",
    "makeCluegiverS1AssessorJobId",
    "verifyParentTerminalRecord",
    "prepareCluegiverS1Dispatch",
    "mintPreparedDispatchArtifact",
    "buildCluegiverS1DryRunReceipt",
  ]) {
    ok(
      executionPreparationSource.includes(loadBearingExport),
      `bound execution source contains ${loadBearingExport}`,
    );
  }
  equal(
    networkInvocations,
    0,
    "entire adversarial suite completed without network invocation",
  );

  console.log(`cluegiver S1 preregistration: ${assertions} assertions passed`);
} finally {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries({
    OPENROUTER_API_KEY: originalCredentialSentinels.openrouter,
    DEEPSEEK_API_KEY: originalCredentialSentinels.deepseek,
    ANTHROPIC_API_KEY: originalCredentialSentinels.anthropic,
    OPENAI_API_KEY: originalCredentialSentinels.openai,
  })) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}
