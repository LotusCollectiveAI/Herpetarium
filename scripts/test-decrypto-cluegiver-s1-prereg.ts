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
  compileJointAssignmentDecoderPrompt,
  contentHash,
  sha256Hex,
  validateJointAssignmentAction,
  verifyBotBuildManifest,
  verifyCompiledJointAssignmentDecoderPrompt,
  verifyObservationV2,
  type DecryptoObservationV2,
} from "@shared/substrate";
import {
  CLUEGIVER_S1_C0_ARM,
  CLUEGIVER_S1_C0_POLICY,
  CLUEGIVER_S1_C0_SOURCE_INSTRUCTION,
  CLUEGIVER_S1_C0_SOURCE_INSTRUCTION_SHA256,
  CLUEGIVER_S1_C1_ARM,
  CLUEGIVER_S1_EXPLICIT_CANDIDATE_BLOCK,
  CLUEGIVER_S1_RESERVED_C2_ARM,
  CLUEGIVER_S1_RUNTIME_IMPLEMENTATION_SOURCE,
  CLUEGIVER_S1_SOURCE_RANGE_FIXTURE,
  assertCluegiverS1ProviderPayload,
  compileCluegiverS1Prompt,
  composeCluegiverS1Carrier,
  cluegiverS1ProviderPayload,
  removeExplicitCandidateBlock,
  validatePlannedCluegiverAction,
  validatePlannedCluegiverObservationDescriptor,
  verifyCluegiverS1CompilerIdentity,
  type CluegiverS1ProviderPayload,
  type PlannedCluegiverObservationDescriptor,
} from "./lib/decrypto-cluegiver-s1-policies";

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

function count(text: string, needle: string): number {
  return text.split(needle).length - 1;
}

const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(moduleDirectory, "..");
const fixturePath = resolve(
  moduleDirectory,
  "fixtures/decrypto-cluegiver-s1-positions-v0.2.json",
);
const receiptPath = resolve(
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
    "decrypto-cluegiver-s1-preregistration@0.2.0",
    "corrected preregistration schema is v0.2",
  );
  equal(
    manifest.integrationGate.dispatchStatus,
    "blocked_pending_shared_cluegiver_contract_integration",
    "spend remains blocked until reviewed cluegiver contracts are integrated",
  );
  equal(
    manifest.integrationGate.requiredIntegrationCommit,
    "86207c5",
    "integration gate names the reviewed integration commit",
  );
  deepEqual(
    manifest.integrationGate.requiredRegistryAwareCompilationGates,
    [
      "validateCluegiverDecisionContext(observation, cluegiverBuild)",
      "validateGuessDecisionContext(observation, assessorBuild)",
    ],
    "post-rebase compilation requires both registry-aware role/build gates",
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
    "C0 build descriptor has reviewed cluegiver scope",
  );
  equal(
    manifest.botBuilds.cluegiverByArm[CLUEGIVER_S1_C1_ARM].scope,
    "cluegiver",
    "C1 build descriptor has reviewed cluegiver scope",
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
    equal(job.execution.retries, 0, `${job.jobId} has no retry`);
    equal(job.execution.fallbacks, 0, `${job.jobId} has no fallback`);
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
      validatePlannedCluegiverObservationDescriptor(parent.observation),
      [],
      `${cell.cellId} cluegiver descriptor is strict and role-complete`,
    );
    deepEqual(
      validatePlannedCluegiverAction(
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
      const compiled = compileJointAssignmentDecoderPrompt(
        child.blindedInput.observationTemplate,
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
      arm: CLUEGIVER_S1_C0_ARM,
      compiler: manifest.implementationBindings.cluegiverPromptCompiler,
    });
    const compiledC1 = compileCluegiverS1Prompt({
      observation: c1Parent.observation,
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
  const materializedPrompt = compileJointAssignmentDecoderPrompt(materialized);
  ok(
    !canonicalJson(materializedPrompt).includes(rationaleSentinel),
    "parent rationale cannot enter downstream compiled prompt",
  );
  throws(
    () =>
      bench.materializeAssessorObservationFromParentAction(
        firstAssessor.blindedInput.observationTemplate,
        { rationale: rationaleSentinel },
      ),
    /exactly one three-clue array/,
    "downstream materializer fails closed without a clue triple",
  );

  const firstParent = manifest.dag.jobs.find(
    (job) => job.role === "cluegiver",
  )!;
  ok(firstParent.role === "cluegiver", "first parent resolves");
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
    validatePlannedCluegiverObservationDescriptor(
      extraNestedField as unknown as PlannedCluegiverObservationDescriptor,
    ).some((problem) => problem.includes('unknown field "decodedCorrectly"')),
    "strict local cluegiver descriptor rejects extra resolved-round fields",
  );
  throws(
    () =>
      compileCluegiverS1Prompt({
        observation:
          extraNestedField as unknown as PlannedCluegiverObservationDescriptor,
        arm: CLUEGIVER_S1_C0_ARM,
        compiler: manifest.implementationBindings.cluegiverPromptCompiler,
      }),
    /invalid planned cluegiver observation/,
    "cluegiver compiler rejects ad-hoc nested observation shapes",
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
        arm: CLUEGIVER_S1_C0_ARM,
        compiler: forgedCompilerForCall,
      }),
    /structurally verified implementation-byte binding/,
    "cluegiver compiler rejects ad-hoc caller-supplied compiler hashes",
  );

  const firstPayload = cluegiverS1ProviderPayload(
    compileCluegiverS1Prompt({
      observation: firstParent.observation,
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

  const receipt = JSON.parse(await readFile(receiptPath, "utf8")) as Record<
    string,
    unknown
  >;
  equal(
    receipt.receiptVersion,
    "decrypto-cluegiver-s1-prereg-dry-run-receipt@0.2.0",
    "receipt schema and truthful v0.2 filename align",
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
    receipt.preregistrationContentHash,
    manifest.preregistrationContentHash,
    "receipt binds the full deterministic manifest",
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
    receipt.compilerImplementationSha256,
    sources.experimentCompilerImplementation.sha256,
    "receipt binds cluegiver compiler implementation bytes",
  );
  equal(
    receipt.jointAssignmentImplementationSha256,
    sources.jointAssignmentCompilerImplementation.sha256,
    "receipt binds assessor compiler implementation bytes",
  );
  equal(receipt.providerCallsThisRun, 0, "receipt records zero provider calls");
  equal(
    receipt.integrationGate,
    "blocked_pending_shared_cluegiver_contract_integration",
    "receipt preserves the no-spend integration gate",
  );

  const [runnerSource, policySource] = await Promise.all([
    readFile(
      resolve(moduleDirectory, "run-decrypto-cluegiver-s1-prereg.ts"),
      "utf8",
    ),
    readFile(
      resolve(moduleDirectory, "lib/decrypto-cluegiver-s1-policies.ts"),
      "utf8",
    ),
  ]);
  for (const [label, source] of [
    ["runner", runnerSource],
    ["policy/compiler", policySource],
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
