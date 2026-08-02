/**
 * Provider-free tests for the static-position decoder mechanism bench.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

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

const originalDatabaseUrl = process.env.DATABASE_URL;
const originalFetch = globalThis.fetch;
let providerInvocations = 0;

delete process.env.DATABASE_URL;
globalThis.fetch = (async () => {
  providerInvocations += 1;
  throw new Error("network/provider invocation is forbidden in this test");
}) as typeof fetch;

try {
  const substrate = await import("@shared/substrate");
  const {
    JOINT_ASSIGNMENT_DECODER_COMPILER_HASH,
    JOINT_ASSIGNMENT_DECODER_POLICY_ARTIFACT,
    JOINT_ASSIGNMENT_DECODER_POLICY_HASH,
    JOINT_ASSIGNMENT_TRANSCRIPT_TREATMENT_HASH,
    JOINT_ASSIGNMENT_TRANSCRIPT_TREATMENT_ID,
    contentHash,
    sha256Hex,
    solveGlobalInjectiveAssignment,
    validateJointAssignmentAction,
  } = substrate;
  const experimentPolicies =
    await import("./lib/decrypto-static-decoder-policies");
  const {
    PAIRED_DECODER_POLICY_ACTION_CONTRACT,
    PAIRED_DECODER_POLICY_COMPILER_HASH,
    PAIRED_DECODER_POLICY_COMPILER_ID,
    PAIRED_DECODER_POLICY_SECTION_HEADINGS,
    TABLE_GREEDY_DECODER_POLICY_ARTIFACT,
    TABLE_GREEDY_DECODER_POLICY_HASH,
    TABLE_GREEDY_DECODER_STRATEGY_EXCERPT,
    assertNeutralPairedDecoderProviderPayload,
    compilePairedDecoderPolicyPrompt,
    pairedDecoderProviderPayload,
    verifyCompiledPairedDecoderPolicyPrompt,
  } = experimentPolicies;
  const bench = await import("./run-decrypto-static-position-bench");
  equal(
    process.env.DATABASE_URL,
    undefined,
    "DATABASE_URL guard is installed before substrate and bench imports",
  );
  equal(
    providerInvocations,
    0,
    "throwing fetch guard observes no substrate or bench import side effect",
  );
  const fixture = await bench.loadSanitizedStaticPositionFixture();

  equal(
    JOINT_ASSIGNMENT_DECODER_POLICY_HASH,
    "c428d5339e3ec24cb3e82866f257ea35f8a1b853205282539857a123fc917c24",
    "existing joint-assignment policy identity is preserved",
  );
  equal(
    JOINT_ASSIGNMENT_DECODER_COMPILER_HASH,
    "327afb8a447095b5879716a7a396697cc1af5c04defa57e83811d5f3801e294d",
    "existing joint-assignment compiler identity is preserved",
  );
  equal(
    JOINT_ASSIGNMENT_TRANSCRIPT_TREATMENT_HASH,
    "5db9d6e93b428e3067dfc57ffce3438e1e80d0b254ab7b7aa10409a05c367878",
    "shared transcript treatment identity is directly pinned",
  );
  equal(
    TABLE_GREEDY_DECODER_POLICY_HASH,
    "a4ea1e077ea7322978ada4d16f0de05606b18dcd0063abaa624eeb3f1989b4cd",
    "Table greedy comparison carrier identity is pinned",
  );
  equal(
    PAIRED_DECODER_POLICY_COMPILER_HASH,
    "3e81778bde358e93cc40979aa5b696c4fbcd9ec9e153aaea21d236c73ab40b0d",
    "neutral paired compiler identity is pinned",
  );
  equal(
    PAIRED_DECODER_POLICY_COMPILER_ID,
    "paired-decoder-policy-compiler@0.2.0",
    "experiment compiler is versioned independently of shared substrate",
  );
  equal(
    PAIRED_DECODER_POLICY_SECTION_HEADINGS.policy,
    "## Operative decoder policy",
    "provider-visible policy heading is pinned to neutral text",
  );
  equal(
    TABLE_GREEDY_DECODER_STRATEGY_EXCERPT,
    [
      "Strategy:",
      "- For each clue in order, walk through your four keywords and",
      "  pick the one with the strongest associative match. The",
      "  encryptor is a teammate trying to lead you — favour the",
      "  most natural fit, not a clever alternative reading.",
      "- Your guess MUST contain three DISTINCT digits. If your best",
      "  reading produces a duplicate, try the second-best match for",
      "  the weakest of the two clues.",
      "- Use earlier resolved rounds for any encryptor habits, but",
      "  trust this round's clue first.",
    ].join(" "),
    "Table greedy carrier preserves the exact runtime strategy excerpt",
  );
  equal(
    TABLE_GREEDY_DECODER_POLICY_ARTIFACT.source.runtimeCommit,
    "6a70fd2202e71681ae581c00ce8a6c407aa9a509",
    "greedy carrier names the live-runtime base commit",
  );
  equal(
    TABLE_GREEDY_DECODER_POLICY_ARTIFACT.source.substrateIntegrationCommit,
    "b41e514d097ee20494710a82a07f1e7954da52df",
    "greedy carrier distinguishes the later substrate integration commit",
  );

  deepEqual(
    bench.validateSanitizedStaticPositionFixture(fixture),
    [],
    "sanitized four-position fixture validates",
  );
  equal(fixture.positions.length, 4, "fixture has exactly four positions");
  equal(
    fixture.source.uncommittedSourceArtifactSha256,
    "54f1f34c61246b5a4042a86a276ea51587ddfccd7023f2239492e512a8f8d9ff",
    "fixture provenance records the successful all-bot source artifact hash",
  );
  deepEqual(
    {
      availability: fixture.source.sourceArtifactAvailability,
      dependency: fixture.source.sourceArtifactDependency,
      reconstructionAuthority: fixture.source.reconstructionAuthority,
    },
    {
      availability: "uncommitted_provenance_only",
      dependency: "none",
      reconstructionAuthority: "content_hashed_sanitized_fixture",
    },
    "fixture truthfully treats the uncommitted source as provenance, never a runtime dependency",
  );
  equal(
    fixture.contentHash,
    "a0f8c89ca38ea3e020d3abaf2a7942a8e45faf56243cd4f42777dc6d8c4c1134",
    "fixture identity remains pinned",
  );
  equal(
    fixture.contentHash,
    contentHash({
      fixtureVersion: fixture.fixtureVersion,
      source: fixture.source,
      evidenceLimitations: fixture.evidenceLimitations,
      positions: fixture.positions,
    }),
    "fixture content hash binds every allowlisted byte",
  );
  equal(
    fixture.source.allBot,
    true,
    "fixture explicitly asserts all-bot source",
  );
  equal(
    fixture.source.noHumanSource,
    true,
    "fixture explicitly asserts no-human source",
  );
  deepEqual(
    fixture.evidenceLimitations,
    bench.STATIC_POSITION_EVIDENCE_LIMITATIONS,
    "fixture machine-records the canonical one-game evidence ceiling",
  );
  deepEqual(
    fixture.positions.map((position) => position.sourceCluegiverArm),
    ["treatment", "control", "treatment", "control"],
    "every position records its neutral nonhuman source cluegiver arm",
  );

  const firstObservation = bench.mintNeutralDecoderObservation(
    fixture.positions[0]!,
    0,
  );
  const firstVisibleProjection = bench.observationVisiblePositionProjection(
    fixture.positions[0]!,
  );
  equal(
    firstObservation.decisionId,
    `bench-decision:${contentHash(firstVisibleProjection).slice(0, 24)}`,
    "provider-visible decisionId derives only from the visible projection",
  );
  equal(
    firstObservation.logicalActionKey,
    `bench-action:${contentHash(firstVisibleProjection).slice(0, 24)}`,
    "provider-visible logicalActionKey derives only from the visible projection",
  );
  ok(
    !Object.hasOwn(firstVisibleProjection, "outcome") &&
      !Object.hasOwn(firstVisibleProjection, "sourceCluegiverArm"),
    "visible projection excludes historical ground truth and source arm",
  );
  const withDifferentGroundTruth = structuredClone(
    fixture.positions[0]!,
  ) as (typeof fixture.positions)[0];
  (
    withDifferentGroundTruth as unknown as {
      outcome: {
        code: [number, number, number];
        ownDecode: [number, number, number];
        decodedCorrectly: boolean;
      };
      sourceCluegiverArm: "treatment" | "control";
    }
  ).outcome = {
    code: [1, 2, 3],
    ownDecode: [1, 2, 3],
    decodedCorrectly: true,
  };
  (
    withDifferentGroundTruth as unknown as {
      sourceCluegiverArm: "treatment" | "control";
    }
  ).sourceCluegiverArm = "control";
  const observationWithDifferentGroundTruth =
    bench.mintNeutralDecoderObservation(withDifferentGroundTruth, 0);
  deepEqual(
    observationWithDifferentGroundTruth,
    firstObservation,
    "ground truth and source-arm tampering cannot affect provider-visible observation bytes",
  );
  const greedyPrompt = compilePairedDecoderPolicyPrompt(
    firstObservation,
    TABLE_GREEDY_DECODER_POLICY_ARTIFACT,
  );
  const jointPrompt = compilePairedDecoderPolicyPrompt(
    firstObservation,
    JOINT_ASSIGNMENT_DECODER_POLICY_ARTIFACT,
  );
  ok(
    verifyCompiledPairedDecoderPolicyPrompt(
      greedyPrompt,
      firstObservation,
      TABLE_GREEDY_DECODER_POLICY_ARTIFACT,
    ),
    "greedy prompt verifies against the neutral observation",
  );
  ok(
    verifyCompiledPairedDecoderPolicyPrompt(
      jointPrompt,
      firstObservation,
      JOINT_ASSIGNMENT_DECODER_POLICY_ARTIFACT,
    ),
    "joint prompt verifies against the same neutral observation",
  );
  equal(
    greedyPrompt.systemPrompt,
    jointPrompt.systemPrompt,
    "both arms receive byte-identical system prompts",
  );
  equal(
    greedyPrompt.actionContract,
    jointPrompt.actionContract,
    "both arms receive byte-identical action contracts",
  );
  equal(
    greedyPrompt.taskPrompt.split(PAIRED_DECODER_POLICY_SECTION_HEADINGS.policy)
      .length - 1,
    1,
    "greedy prompt has exactly one neutral carrier heading",
  );
  equal(
    jointPrompt.taskPrompt.split(PAIRED_DECODER_POLICY_SECTION_HEADINGS.policy)
      .length - 1,
    1,
    "joint prompt has exactly one neutral carrier heading",
  );
  const neutralPolicyText = "[POLICY INSTRUCTION]";
  equal(
    greedyPrompt.taskPrompt.replace(
      TABLE_GREEDY_DECODER_POLICY_ARTIFACT.instruction,
      neutralPolicyText,
    ),
    jointPrompt.taskPrompt.replace(
      JOINT_ASSIGNMENT_DECODER_POLICY_ARTIFACT.instruction,
      neutralPolicyText,
    ),
    "all provider-visible task bytes outside policy text are identical",
  );
  for (const prompt of [greedyPrompt, jointPrompt]) {
    const providerVisibleHeadings = prompt.taskPrompt
      .split("\n")
      .filter((line) => line.startsWith("## "));
    ok(
      providerVisibleHeadings.every(
        (heading) =>
          !heading.includes("@") && !/\b[0-9a-f]{32,}\b/i.test(heading),
      ),
      "provider-visible headings expose no artifact ids or hashes",
    );
  }
  ok(
    greedyPrompt.actionContract === PAIRED_DECODER_POLICY_ACTION_CONTRACT &&
      jointPrompt.actionContract === PAIRED_DECODER_POLICY_ACTION_CONTRACT,
    "both arms use the local experiment contract validated by the canonical action validator",
  );
  const providerVisiblePrompts = [
    greedyPrompt.systemPrompt,
    greedyPrompt.taskPrompt,
    greedyPrompt.actionContract,
    jointPrompt.systemPrompt,
    jointPrompt.taskPrompt,
    jointPrompt.actionContract,
  ].join("\n");
  const greedyProviderPayload = pairedDecoderProviderPayload(greedyPrompt);
  const jointProviderPayload = pairedDecoderProviderPayload(jointPrompt);
  deepEqual(
    Object.keys(greedyProviderPayload).sort(),
    ["actionContract", "systemPrompt", "taskPrompt"],
    "provider accessor excludes every control-plane identity field",
  );
  assertNeutralPairedDecoderProviderPayload(jointProviderPayload);
  throws(
    () =>
      assertNeutralPairedDecoderProviderPayload({
        ...greedyProviderPayload,
        taskPrompt: `${greedyProviderPayload.taskPrompt}\ncontrol`,
      }),
    /provider-visible prompt exposes assignment cue "control"/,
    "neutrality gate is exported, load-bearing, and covers arm-language drift",
  );
  for (const forbiddenAssignmentCue of [
    TABLE_GREEDY_DECODER_POLICY_ARTIFACT.id,
    TABLE_GREEDY_DECODER_POLICY_ARTIFACT.contentHash,
    TABLE_GREEDY_DECODER_POLICY_ARTIFACT.source.runtimeCommit,
    TABLE_GREEDY_DECODER_POLICY_ARTIFACT.source.substrateIntegrationCommit,
    JOINT_ASSIGNMENT_DECODER_POLICY_ARTIFACT.id,
    JOINT_ASSIGNMENT_DECODER_POLICY_ARTIFACT.contentHash,
    JOINT_ASSIGNMENT_TRANSCRIPT_TREATMENT_ID,
    JOINT_ASSIGNMENT_TRANSCRIPT_TREATMENT_HASH,
    "table_greedy",
    "joint_assignment",
    "treatment",
    "control",
    "arm-a",
    "arm-b",
  ]) {
    ok(
      !providerVisiblePrompts
        .toLowerCase()
        .includes(forbiddenAssignmentCue.toLowerCase()),
      `provider-visible prompt excludes assignment cue ${forbiddenAssignmentCue}`,
    );
  }
  const historicalGroundTruthAction = {
    kind: "guess" as const,
    role: "decode" as const,
    guess: [...fixture.positions[0]!.outcome.ownDecode] as [
      number,
      number,
      number,
    ],
  };
  deepEqual(
    validateJointAssignmentAction(historicalGroundTruthAction, "decoder"),
    [],
    "greedy arm historical ground truth uses the shared strict action validator",
  );
  deepEqual(
    validateJointAssignmentAction(historicalGroundTruthAction, "decoder"),
    [],
    "joint arm historical ground truth uses the same strict action validator",
  );

  const collisionScores = [
    [9, 8, 0, 0],
    [9, 1, 0, 0],
    [0, 0, 9, 8],
  ] as const satisfies import("@shared/substrate").JointAssignmentScoreMatrix;
  const marginalGreedy = collisionScores.map(
    (row: readonly number[]) => row.indexOf(Math.max(...row)) + 1,
  );
  const globalJoint = solveGlobalInjectiveAssignment({
    primaryScores: collisionScores,
  });
  equal(
    marginalGreedy.join(","),
    "1,1,3",
    "greedy marginal decisions collide at [1,1,3]",
  );
  equal(
    globalJoint.winner.guess.join(","),
    "2,1,3",
    "global injective assignment resolves the adversary at [2,1,3]",
  );

  const tampered = structuredClone(fixture) as unknown as Record<
    string,
    unknown
  >;
  (
    (tampered.positions as Array<Record<string, unknown>>)[0]!
      .ownClues as string[]
  )[0] = "different";
  ok(
    bench
      .validateSanitizedStaticPositionFixture(tampered)
      .some((problem) => problem.includes("contentHash")),
    "fixture byte tampering is rejected by the self-hash",
  );
  const withMalformedPosition = structuredClone(fixture) as unknown as {
    positions: unknown[];
  };
  withMalformedPosition.positions[0] = null;
  ok(
    bench.validateSanitizedStaticPositionFixture(withMalformedPosition).length >
      0,
    "malformed positions fail closed without reaching derived-limit checks",
  );

  deepEqual(
    bench.sanitizedFixturePrivacyProblems({ playerName: "forbidden" }),
    ["fixture.playerName is forbidden in the sanitized fixture"],
    "camelCase playerName is rejected directly by the privacy allowlist",
  );
  deepEqual(
    bench.sanitizedFixturePrivacyProblems({ humanName: "forbidden" }),
    ["fixture.humanName is forbidden in the sanitized fixture"],
    "camelCase humanName is rejected directly by the privacy allowlist",
  );
  deepEqual(
    bench.sanitizedFixturePrivacyProblems({
      rawResponse: "forbidden",
    }),
    ["fixture.rawResponse is forbidden in the sanitized fixture"],
    "camelCase rawResponse is rejected directly by the privacy allowlist",
  );
  deepEqual(
    bench.sanitizedFixturePrivacyProblems({
      privateNotes: "forbidden",
    }),
    ["fixture.privateNotes is forbidden in the sanitized fixture"],
    "camelCase privateNotes is rejected directly by the privacy allowlist",
  );
  deepEqual(
    bench.sanitizedFixturePrivacyProblems(
      { noHumanSource: true },
      "fixture.source",
    ),
    [],
    "the exact true noHumanSource assertion is the sole human-key exemption",
  );

  const withHumanField = structuredClone(fixture) as unknown as {
    positions: Array<Record<string, unknown>>;
  };
  withHumanField.positions[0]!.humanName = "forbidden";
  ok(
    bench
      .validateSanitizedStaticPositionFixture(withHumanField)
      .includes(
        "fixture.positions[0].humanName is forbidden in the sanitized fixture",
      ),
    "fixture validation invokes the camelCase privacy allowlist",
  );

  const withRawResponse = structuredClone(fixture) as unknown as {
    positions: Array<Record<string, unknown>>;
  };
  withRawResponse.positions[0]!.rawResponse =
    "private provider-visible response bytes";
  ok(
    bench
      .validateSanitizedStaticPositionFixture(withRawResponse)
      .includes(
        "fixture.positions[0].rawResponse is forbidden in the sanitized fixture",
      ),
    "fixture validation specifically rejects raw response fields",
  );

  const withReasoningReceipt = structuredClone(fixture) as unknown as {
    positions: Array<Record<string, unknown>>;
  };
  withReasoningReceipt.positions[0]!.reasoning = {
    receipt: "private",
  };
  ok(
    bench
      .validateSanitizedStaticPositionFixture(withReasoningReceipt)
      .includes(
        "fixture.positions[0].reasoning is forbidden in the sanitized fixture",
      ),
    "fixture validation specifically rejects reasoning bodies",
  );

  const withPrivateProse = structuredClone(fixture) as unknown as {
    positions: Array<{ ownClues: string[] }>;
  };
  withPrivateProse.positions[0]!.ownClues[0] = "ANSWER: private response prose";
  ok(
    bench
      .validateSanitizedStaticPositionFixture(withPrivateProse)
      .some((problem) => problem.includes("private response bytes")),
    "response-shaped prose cannot hide inside an allowlisted clue field",
  );

  const withEvidenceInflation = structuredClone(fixture) as unknown as {
    evidenceLimitations: { independentGames: number };
  };
  withEvidenceInflation.evidenceLimitations.independentGames = 2;
  ok(
    bench
      .validateSanitizedStaticPositionFixture(withEvidenceInflation)
      .includes("fixture evidence is exactly one independent game"),
    "evidence inflation is rejected independently of the fixture self-hash",
  );

  const withArmRelabel = structuredClone(fixture) as unknown as {
    positions: Array<{ sourceCluegiverArm: "treatment" | "control" }>;
  };
  withArmRelabel.positions[0]!.sourceCluegiverArm = "control";
  ok(
    bench
      .validateSanitizedStaticPositionFixture(withArmRelabel)
      .includes(
        "fixture source cluegiver arms must remain treatment,control,treatment,control",
      ),
    "source arm relabeling is rejected independently of the fixture self-hash",
  );

  const firstPreregistration =
    bench.buildStaticPositionPreregistration(fixture);
  const secondPreregistration =
    bench.buildStaticPositionPreregistration(fixture);
  deepEqual(
    firstPreregistration,
    secondPreregistration,
    "preregistration ordering and hashes are deterministic",
  );
  equal(
    firstPreregistration.preregistrationContentHash,
    "19706b719f0f0a4837c7dbad2fa405744c89fbb8c4b2112d6fda44d0659dd0f3",
    "preregistration identity remains pinned",
  );
  equal(
    firstPreregistration.preregistrationContentHash,
    contentHash(
      Object.fromEntries(
        Object.entries(firstPreregistration).filter(
          ([key]) => key !== "preregistrationContentHash",
        ),
      ),
    ),
    "preregistration self-hash verifies",
  );
  equal(
    firstPreregistration.jobs.length,
    8,
    "four positions by two arms creates exactly eight maximum jobs",
  );
  deepEqual(
    firstPreregistration.jobs.map((job) => job.ordinal),
    [1, 2, 3, 4, 5, 6, 7, 8],
    "job ordinals are deterministic",
  );
  deepEqual(
    firstPreregistration.jobs.map((job) => job.arm),
    [
      "table_greedy",
      "joint_assignment",
      "table_greedy",
      "joint_assignment",
      "table_greedy",
      "joint_assignment",
      "table_greedy",
      "joint_assignment",
    ],
    "arm ordering is deterministic within each position",
  );
  equal(
    firstPreregistration.execution.maximumProviderCalls,
    8,
    "maximum call ceiling is exactly eight",
  );
  equal(
    firstPreregistration.execution.plannedProviderCalls,
    0,
    "dry run plans zero provider calls",
  );
  equal(firstPreregistration.execution.retries, 0, "retries are fixed at zero");
  equal(
    firstPreregistration.execution.fallbacks,
    0,
    "fallbacks are fixed at zero",
  );
  equal(
    firstPreregistration.execution.providerCallLicense,
    "unlicensed",
    "provider calls remain explicitly unlicensed",
  );
  deepEqual(
    firstPreregistration.compiler,
    {
      id: "paired-decoder-policy-compiler@0.2.0",
      contentHash:
        "3e81778bde358e93cc40979aa5b696c4fbcd9ec9e153aaea21d236c73ab40b0d",
      kind: "neutral_experiment_only",
      productionCompilerParity: "not_claimed",
    },
    "preregistration disclaims production compiler parity",
  );
  deepEqual(
    firstPreregistration.evidenceLimitations,
    {
      independentGames: 1,
      sourceMatchCount: 1,
      historicalDecodeCeiling: {
        correct: 4,
        total: 4,
        notation: "4/4",
      },
      mirroredSides: 2,
      sourceRounds: 2,
      positionsWithPriorHistory: 2,
      effectiveIndependentUnit: "one_game",
      conclusionPermissions: {
        parity: "forbidden",
        strategy: "forbidden",
      },
    },
    "preregistration exposes the complete one-game evidence ceiling",
  );
  deepEqual(
    firstPreregistration.fixture.sourceCluegiverArmsByPosition,
    ["treatment", "control", "treatment", "control"],
    "preregistration preserves neutral source cluegiver arms by position",
  );
  deepEqual(
    {
      sha256: firstPreregistration.fixture.uncommittedSourceArtifactSha256,
      availability: firstPreregistration.fixture.sourceArtifactAvailability,
      dependency: firstPreregistration.fixture.sourceArtifactDependency,
      reconstructionAuthority:
        firstPreregistration.fixture.reconstructionAuthority,
    },
    {
      sha256:
        "54f1f34c61246b5a4042a86a276ea51587ddfccd7023f2239492e512a8f8d9ff",
      availability: "uncommitted_provenance_only",
      dependency: "none",
      reconstructionAuthority: "content_hashed_sanitized_fixture",
    },
    "preregistration carries truthful self-contained fixture provenance",
  );
  deepEqual(
    firstPreregistration.claims,
    {
      efficacy: "none",
      providerResult: "none",
      purpose: "plumbing-parity-smoke-only",
    },
    "preregistration makes no efficacy or provider-result claim",
  );
  ok(
    firstPreregistration.jobs.every(
      (job) =>
        job.actionValidation === "historical_ground_truth_accepted" &&
        Object.hasOwn(job, "historicalGroundTruthActionHash") &&
        !Object.hasOwn(job, "expectedActionHash") &&
        !Object.hasOwn(job, "result"),
    ),
    "jobs label fixture actions only as historical ground truth, never results",
  );
  for (let index = 0; index < firstPreregistration.jobs.length; index += 2) {
    const greedy = firstPreregistration.jobs[index]!;
    const joint = firstPreregistration.jobs[index + 1]!;
    equal(
      greedy.observationHash,
      joint.observationHash,
      `position ${index / 2 + 1} shares one exact observation`,
    );
    equal(
      greedy.policyTextNeutralizedPromptSha256,
      joint.policyTextNeutralizedPromptSha256,
      `position ${index / 2 + 1} differs only in policy instruction text`,
    );
    equal(
      greedy.historicalGroundTruthActionHash,
      joint.historicalGroundTruthActionHash,
      `position ${index / 2 + 1} shares one historical ground-truth action`,
    );
  }

  const runnerSource = await readFile(
    new URL("./run-decrypto-static-position-bench.ts", import.meta.url),
    "utf8",
  );
  ok(
    !/from\s+["'][^"']*server\//.test(runnerSource),
    "runner source imports no application server module",
  );
  ok(
    !/\b(?:fetch|callAI|generateGuess|headlessRunner|processGuesses)\s*\(/.test(
      runnerSource,
    ),
    "runner source has no provider or headless dispatch call",
  );
  ok(
    !runnerSource.includes("/private/tmp") &&
      !runnerSource.includes("herp-decrypto-ab-canary"),
    "runner has no private temporary source-artifact dependency",
  );
  const experimentPolicySource = await readFile(
    new URL("./lib/decrypto-static-decoder-policies.ts", import.meta.url),
    "utf8",
  );
  ok(
    !/\bcompileJointAssignmentDecoderPrompt\s*\(/.test(
      experimentPolicySource,
    ) &&
      !/\b(?:buildColumnLedger|renderComparisonTargets|ACTION_CONTRACTS)\b/.test(
        experimentPolicySource,
      ),
    "experiment compiler neither invokes production compilation nor duplicates its private helpers",
  );
  const canonicalJointSource = await readFile(
    new URL("../shared/substrate/jointAssignmentDecoder.ts", import.meta.url),
    "utf8",
  );
  const canonicalIndexSource = await readFile(
    new URL("../shared/substrate/index.ts", import.meta.url),
    "utf8",
  );
  equal(
    sha256Hex(canonicalJointSource),
    "d12e079c4dd9fd8e770ec51c74508b7f477d3f32cd4b8aa46ff4ec045517e63e",
    "jointAssignmentDecoder remains byte-identical to both canonical twins",
  );
  equal(
    sha256Hex(canonicalIndexSource),
    "2758439569362b451915359516e3c8d9cbc798f903dc317d7426f4a32cd1c5ab",
    "shared substrate index remains byte-identical to both canonical twins",
  );
  ok(
    !canonicalJointSource.includes("PAIRED_DECODER_POLICY") &&
      !canonicalIndexSource.includes("PAIRED_DECODER_POLICY"),
    "experiment-only paired compiler does not enter canonical shared substrate",
  );
  equal(
    providerInvocations,
    0,
    "import, fixture load, compilation, validation, and preregistration invoke no provider",
  );

  process.stdout.write(
    `static-position bench: ${assertions} provider-free assertions passed\n`,
  );
} finally {
  globalThis.fetch = originalFetch;
  if (originalDatabaseUrl === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = originalDatabaseUrl;
  }
}
