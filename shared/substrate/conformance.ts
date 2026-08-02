/**
 * Deterministic conformance suite. Runs identically in both vendored
 * copies; passing in both repos (same EXPECTED_HASHES) proves the copies
 * agree byte-for-byte on behavior. No I/O, no clock, no randomness.
 */
import {
  compileStrategyArtifact,
  evaluateSeating,
  findRegistryConflicts,
  mintEvaluationRecord,
  mintStrategyArtifact,
  verifyEvaluationRecord,
  verifyStrategyArtifact,
  type EvaluationRecordSource,
} from "./artifact";
import { COMPILER_VERSION, compiledPromptsHash } from "./compile";
import { contentHash } from "./hash";
import {
  CIPHER_ENCRYPT_CANDIDATE_POLICY,
  CIPHER_ENCRYPT_CANDIDATE_POLICY_ARTIFACT,
  CIPHER_ENCRYPT_CANDIDATE_POLICY_HASH,
  CIPHER_ENCRYPT_CANDIDATE_POLICY_ID,
  composeCandidatePolicyTaskInstruction,
} from "./candidatePolicy";
import {
  HERPETARIUM_CLUE_RULES,
  TABLE_CLUE_RULES,
  validateClue,
  validateClueSubmission,
  validateCodeGuess,
} from "./actions";
import {
  BASELINE_GAME_CLUES,
  BASELINE_INVERSION_PROBE,
  BASELINE_KEYWORDS,
  BLIND_INVERSION_CALIBRATION_2026_08_01,
  CROSS_ROUND_COLUMN_ASSIGNMENT_VETO_POLICY,
  CROSS_ROUND_COLUMN_ASSIGNMENT_VETO_POLICY_RETIREMENT_2026_08_01,
  CROSS_ROUND_COLUMN_LEAK_BLUE_2026_08_01,
  CROSS_ROUND_COLUMN_LEAK_2026_08_01,
  CROSS_ROUND_COLUMN_VETO_POLICY,
  CROSS_ROUND_PRODUCTION_SMOKE_EVENT_PROVENANCE_2026_08_01,
  CROSS_ROUND_REFERENT_EVIDENCE_POLICY_ERRATA_2026_08_02,
  CROSS_ROUND_REFERENT_EVIDENCE_VETO_POLICY,
  CROSS_ROUND_RUNTIME_ENFORCEMENT_RELEASED,
  CROSS_ROUND_V01_BLUE_TRACE_2026_08_01,
  CROSS_ROUND_V01_LIVE_TRACE_2026_08_01,
  CROSS_ROUND_V02_LIVE_TRACE_2026_08_01,
  CROSS_ROUND_V03_LIVE_BOUNDARY_2026_08_02,
  EXPECTED_HASHES,
  INTERMEDIATE_HOPS_SOURCE,
  PROVISIONAL_INVERSION_VETO_POLICY,
  SENSORY_ANCHOR_SOURCE,
} from "./fixtures";
import {
  DEEPSEEK_V4_FLASH_CANONICAL,
  aliasEpochFor,
  validateModelRef,
} from "./modelRef";
import {
  BLIND_INVERSION_PROTOCOL_VERSION,
  PROVISIONAL_INVERSION_VETO_POLICY_HASH,
  PROVISIONAL_INVERSION_VETO_POLICY_ID,
  conceptRecoversTarget,
  evaluateBlindInversion,
  normalizeInversionTokens,
  type BlindInversionAudit,
  type InversionVetoOutcome,
} from "./inversion";
import {
  CLUE_COLUMN_NUMBERS,
  CROSS_ROUND_AUDITOR_BATCH_SIZE,
  CROSS_ROUND_AUDITOR_PROMPT_HASH,
  CROSS_ROUND_AUDITOR_SYSTEM_PROMPT,
  CROSS_ROUND_COLUMN_VETO_POLICY_HASH,
  CROSS_ROUND_COLUMN_VETO_POLICY_ID,
  CROSS_ROUND_INVERSION_PROTOCOL_VERSION,
  LEGAL_CODE_TRIPLES,
  HYPOTHESIS_SUPPORTS,
  MAX_CODE_HYPOTHESES,
  buildPublicClueLedger,
  combineInversionOutcomes,
  composeCrossRoundAuditorTask,
  evaluateCrossRoundInversion,
  ledgerColumnHasHistory,
  parseCrossRoundAuditorReply,
  publicLedgerClueCount,
  publicLedgerHasHistory,
  type CrossRoundAuditorReply,
  type CrossRoundClueAudit,
  type PublicClueLedger,
  type HypothesisSupport,
  type ReferentStrength,
} from "./crossRoundInversion";
import { assertRoleLegal, type DecryptoObservation } from "./observation";
import {
  mintObservationV2,
  validateObservationV2,
  verifyObservationV2,
  type DecryptoObservationV2Source,
} from "./observation";
import {
  mintTraceEnvelopeV2,
  validateDecisionChain,
  validateTraceEnvelope,
  validateTraceEnvelopeV2,
  verifyTraceEnvelopeV2,
  type TraceEnvelope,
  type TraceEnvelopeV2Source,
} from "./trace";
import {
  findBotBuildRegistryConflicts,
  mintBotBuildManifest,
  mintWireConfig,
  validateBotBuildManifestSource,
  verifyBotBuildManifest,
  type BotBuildManifestSource,
} from "./botBuild";
import {
  TABLE_COMPETITIVE_PROTOCOL_ID,
  TABLE_COMPETITIVE_V1,
  TABLE_COMPETITIVE_V1_SOURCE,
  mintCompetitiveProtocol,
  tableCompetitiveIdentitySet,
  validateTableCompetitiveIdentities,
  verifyCompetitiveProtocol,
} from "./protocol";
import { identityRef } from "./identity";

export interface ConformanceCheck {
  name: string;
  ok: boolean;
  detail?: string;
}

export interface ConformanceReport {
  passed: boolean;
  checks: ConformanceCheck[];
  hashes: {
    sensoryAnchorContentHash: string;
    sensoryAnchorCompiledHash: string;
    intermediateHopsContentHash: string;
    tableCompetitiveProtocolHash: string;
    conformanceBotBuildHash: string;
    conformanceObservationV2Hash: string;
    conformanceTraceV2Hash: string;
  };
}

function check(
  checks: ConformanceCheck[],
  name: string,
  ok: boolean,
  detail?: string,
): void {
  checks.push({ name, ok, ...(detail !== undefined ? { detail } : {}) });
}

/**
 * The pinned instrument-text hash. Kept adjacent to the check that asserts it
 * so a prompt edit forces an explicit, reviewable line change here rather than
 * silently redefining what the id means.
 */
const EXPECTED_CROSS_ROUND_PROMPT_HASH =
  "fe2b98f44292ddd2b212837340b58d7528f839a4babbc19b9b2ddec047e8c476";
const EXPECTED_CROSS_ROUND_POLICY_HASH =
  "0dde8a93748fea551eb4ea79ae60e6a02733d65719d687a5f2ec4fb94e958be7";
const EXPECTED_TABLE_COMPETITIVE_PROTOCOL_HASH =
  "17e20ef1ee3367d53bb3cb11699c51522ace8df7abeeb4c244e6c103ab4f08e4";
const EXPECTED_CONFORMANCE_BOT_BUILD_HASH =
  "e81a7caa7c6a07e75ec3bb8dc83f6e19ef8b6c0bb76e07b7272cd4a59c8fa083";
const EXPECTED_CONFORMANCE_OBSERVATION_V2_HASH =
  "2820c1acbb29f23ac1564dead906ebca0af6d78f7c7ebc62980efec9d1160988";
const EXPECTED_CONFORMANCE_TRACE_V2_HASH =
  "5e8be20491a31fdf92ce706da0e943b8cfb6938d19a30b8cc296ceb605647f0d";

/** Runtime identity comparison that literal types cannot short-circuit. */
function distinctIds(left: string, right: string): boolean {
  return left !== right;
}

export function runConformance(): ConformanceReport {
  const checks: ConformanceCheck[] = [];

  // 1. Artifact minting: deterministic, verifiable, tamper-evident.
  const sensory = mintStrategyArtifact(SENSORY_ANCHOR_SOURCE);
  const sensoryAgain = mintStrategyArtifact(SENSORY_ANCHOR_SOURCE);
  const hops = mintStrategyArtifact(INTERMEDIATE_HOPS_SOURCE);
  check(
    checks,
    "mint is deterministic",
    sensory.contentHash === sensoryAgain.contentHash,
  );
  check(
    checks,
    "artifact id is name@version",
    sensory.id === "sensory-anchor@0.1.0",
  );
  check(checks, "minted artifact verifies", verifyStrategyArtifact(sensory));
  const tampered = {
    ...sensory,
    genome: { ...sensory.genome, riskTolerance: "maximum recklessness" },
  };
  check(
    checks,
    "tampered artifact fails verification",
    !verifyStrategyArtifact(tampered),
  );
  const rewrittenSameId = mintStrategyArtifact({
    ...SENSORY_ANCHOR_SOURCE,
    genome: {
      ...SENSORY_ANCHOR_SOURCE.genome,
      riskTolerance: "rewritten under the same id",
    },
  });
  check(
    checks,
    "registry immutability guard catches id reuse",
    findRegistryConflicts([sensory, rewrittenSameId]).length === 1 &&
      findRegistryConflicts([sensory, hops]).length === 0,
  );

  // 2. Compilation parity with the golden hashes.
  const compiled = compileStrategyArtifact(sensory);
  const compiledHash = compiledPromptsHash(compiled.compiled);
  check(
    checks,
    "sensory-anchor content hash matches golden",
    sensory.contentHash === EXPECTED_HASHES.sensoryAnchorContentHash,
    sensory.contentHash,
  );
  check(
    checks,
    "sensory-anchor compiled hash matches golden",
    compiledHash === EXPECTED_HASHES.sensoryAnchorCompiledHash,
    compiledHash,
  );
  check(
    checks,
    "intermediate-hops content hash matches golden",
    hops.contentHash === EXPECTED_HASHES.intermediateHopsContentHash,
    hops.contentHash,
  );
  const cluegiver = compiled.compiled.prompts.cluegiver;
  check(
    checks,
    "cluegiver prompt carries compiler v2.0.0 structure",
    cluegiver.systemPrompt.startsWith("## Cluegiver Strategy") &&
      cluegiver.systemPrompt.includes("### Clue Philosophy") &&
      cluegiver.taskDirectives !== null &&
      cluegiver.taskDirectives.includes(
        "Generate one clue each for smell, sound, and texture.",
      ),
  );
  check(
    checks,
    "coach prompt includes character count summary",
    compiled.compiled.prompts.coach.systemPrompt.includes(
      "### Character Count Summary",
    ),
  );
  check(
    checks,
    "Table candidate policy has the canonical immutable id, text, and hash",
    // 0.3.0 replaces item 4's TAUTOLOGY. 0.2.0 said an opponent can match two
    // clues "if both are natural clues for the same hidden keyword" — true of
    // every legitimate reuse of a slot, so it forbade all cluegiving after
    // round 1. The test is now blind public discoverability. A
    // treatment-identity change: do not pool across this boundary.
    CIPHER_ENCRYPT_CANDIDATE_POLICY_ID ===
      "within-call-blind-inversion-selection@0.3.0" &&
      distinctIds(
        CIPHER_ENCRYPT_CANDIDATE_POLICY_ID,
        "within-call-blind-inversion-selection@0.2.0",
      ) &&
      CIPHER_ENCRYPT_CANDIDATE_POLICY_HASH ===
        "cbaa877a34ae392be36a3cbd11e9b6d3cf1574433bfed34adbe0d5282792b068" &&
      distinctIds(
        CIPHER_ENCRYPT_CANDIDATE_POLICY_HASH,
        "02a07609a6ac6bdd8f87ea064c5521b22d55aa58547b87720b66ec8e176e1a77",
      ) &&
      // All four checks must reject, not merely score. Item 4's verb was the
      // one that did not, and the 2026-08-01 actor complied with the policy
      // as written while shipping the leak.
      !CIPHER_ENCRYPT_CANDIDATE_POLICY.includes("Penalize") &&
      // The rule must be BLIND and therefore satisfiable. The tautological
      // form is banned by name, and the feasibility clause that makes ordinary
      // play possible is required.
      CIPHER_ENCRYPT_CANDIDATE_POLICY.includes(
        "readily propose one salient ordinary shared referent or route",
      ) &&
      !CIPHER_ENCRYPT_CANDIDATE_POLICY.includes(
        "if both are natural clues for the same hidden",
      ) &&
      CIPHER_ENCRYPT_CANDIDATE_POLICY.includes(
        "is NOT by itself a reason to reject",
      ) &&
      CIPHER_ENCRYPT_CANDIDATE_POLICY.includes(
        "A genuinely different route to the same keyword, with no salient public bridge to the old clue, is exactly what you are looking for.",
      ) &&
      CIPHER_ENCRYPT_CANDIDATE_POLICY.includes(
        "repeat BOTH the blind inversion test and the blind history-exposure test",
      ) &&
      CIPHER_ENCRYPT_CANDIDATE_POLICY_ARTIFACT.id ===
        CIPHER_ENCRYPT_CANDIDATE_POLICY_ID &&
      CIPHER_ENCRYPT_CANDIDATE_POLICY_ARTIFACT.instruction ===
        CIPHER_ENCRYPT_CANDIDATE_POLICY &&
      CIPHER_ENCRYPT_CANDIDATE_POLICY_ARTIFACT.contentHash ===
        CIPHER_ENCRYPT_CANDIDATE_POLICY_HASH &&
      Object.isFrozen(CIPHER_ENCRYPT_CANDIDATE_POLICY_ARTIFACT),
  );
  const composedCandidateTreatment = composeCandidatePolicyTaskInstruction({
    compiledTaskDirectives: "COMPILED CLUEGIVER DIRECTIVES",
    authoritativeActionContract: "FINAL ACTION CONTRACT",
  });
  check(
    checks,
    "candidate-policy composition preserves strategy → policy → contract authority",
    composedCandidateTreatment.indexOf("COMPILED CLUEGIVER DIRECTIVES") <
      composedCandidateTreatment.indexOf(CIPHER_ENCRYPT_CANDIDATE_POLICY) &&
      composedCandidateTreatment.indexOf(CIPHER_ENCRYPT_CANDIDATE_POLICY) <
        composedCandidateTreatment.indexOf(
          "AUTHORITATIVE GAME ACTION AND OUTPUT CONTRACT:",
        ) &&
      composedCandidateTreatment.endsWith("FINAL ACTION CONTRACT"),
  );

  // 3. Promotion gate: typed immutable evaluation records, not pointer lists.
  const evaluationSource: EvaluationRecordSource = {
    recordVersion: "0.1",
    artifact: { id: sensory.id, contentHash: sensory.contentHash },
    compilerVersion: COMPILER_VERSION,
    modelRoute: DEEPSEEK_V4_FLASH_CANONICAL,
    candidatePolicy: {
      description:
        "generate 3 candidates per digit; blind-inversion self-check at 0.6; pick lowest-transparency decodable candidate",
    },
    protocol: { name: "baseline-20610f90", version: "0.1" },
    heldOutTests: {
      games: 12,
      opponents: ["intermediate-hops@0.1.0"],
      matched: true,
      fixtureRef: "seeded-fixture-set-1",
    },
    metrics: { transparencyFlagged: 0, interceptedAgainstRate: 0.17 },
    verdict: "pass",
    scope:
      "cipher-relay, phrase rules, vs seed opposition; not a family-play guarantee",
    evaluatedAt: "2026-08-01",
    runRef: "example-run-0",
  };
  const record = mintEvaluationRecord(evaluationSource);
  check(
    checks,
    "evaluation record mints and verifies",
    verifyEvaluationRecord(record),
  );
  check(
    checks,
    "doctored evaluation record fails verification",
    !verifyEvaluationRecord({
      ...record,
      verdict: "pass",
      metrics: { transparencyFlagged: 6 },
    }),
  );
  const gateNoRecords = evaluateSeating(sensory, [], {
    allowUnvalidated: false,
  });
  const gateExplicit = evaluateSeating(sensory, [], { allowUnvalidated: true });
  const gateLicensed = evaluateSeating(sensory, [record], {
    allowUnvalidated: false,
  });
  const gateWrongProtocol = evaluateSeating(sensory, [record], {
    allowUnvalidated: false,
    requiredProtocol: "family-play-rc",
  });
  const failedRecord = mintEvaluationRecord({
    ...evaluationSource,
    verdict: "fail",
  });
  const gateFailedVerdict = evaluateSeating(sensory, [failedRecord], {
    allowUnvalidated: false,
  });
  const gateWrongArtifact = evaluateSeating(hops, [record], {
    allowUnvalidated: false,
  });
  check(
    checks,
    "no records → unseatable unless explicitly unvalidated",
    !gateNoRecords.seatable && gateExplicit.seatable && !gateExplicit.validated,
  );
  check(
    checks,
    "passing record licenses seating with scope attached",
    gateLicensed.seatable &&
      gateLicensed.validated &&
      gateLicensed.license?.recordHash === record.contentHash,
  );
  check(
    checks,
    "gate enforces protocol, verdict, and exact artifact binding",
    !gateWrongProtocol.validated &&
      !gateFailedVerdict.validated &&
      !gateWrongArtifact.validated,
  );

  // 4. Action validation.
  check(
    checks,
    "valid guess passes",
    validateCodeGuess([3, 1, 4]).length === 0,
  );
  check(
    checks,
    "guess validation rejects repeats and range",
    validateCodeGuess([1, 1, 2]).length > 0 &&
      validateCodeGuess([0, 2, 3]).length > 0,
  );
  const clueContext = {
    ownKeywords: ["FACTORY", "WINDMILL", "FALCON", "JASMINE"] as [
      string,
      string,
      string,
      string,
    ],
    previousOwnClues: ["assembly"],
  };
  check(
    checks,
    "keyword echo is illegal",
    validateClue("factory", clueContext, TABLE_CLUE_RULES).length > 0,
  );
  check(
    checks,
    "4-letter stem derivative is illegal",
    validateClue("windy paddles", clueContext, TABLE_CLUE_RULES).length > 0,
  );
  check(
    checks,
    "keyword hidden across separators is illegal",
    validateClue("fal con artist", clueContext, TABLE_CLUE_RULES).length > 0,
  );
  check(
    checks,
    "repeated clue is illegal",
    validateClue("Assembly", clueContext, TABLE_CLUE_RULES).length > 0,
  );
  check(
    checks,
    "phrase clue legal at the table, illegal in single-word regime",
    validateClue("night sky harvest", clueContext, TABLE_CLUE_RULES).length ===
      0 &&
      validateClue("night sky harvest", clueContext, HERPETARIUM_CLUE_RULES)
        .length > 0,
  );

  // 5. Baseline game: every definition clue is RULE-legal (legality is not
  // safety — the inversion evaluator, not the validator, must catch these).
  const baselineAllLegal = BASELINE_GAME_CLUES.every((record_) => {
    const keywords = BASELINE_KEYWORDS[record_.encryptorSeat];
    return (
      validateClue(
        record_.clue,
        { ownKeywords: keywords, previousOwnClues: [] },
        TABLE_CLUE_RULES,
      ).length === 0
    );
  });
  check(checks, "baseline 20610f90 clues are all rule-legal", baselineAllLegal);
  const submissionProblems = validateClueSubmission(
    {
      kind: "clues",
      clues: [
        BASELINE_GAME_CLUES[0].clue,
        BASELINE_GAME_CLUES[1].clue,
        BASELINE_GAME_CLUES[2].clue,
      ],
    },
    { ownKeywords: BASELINE_KEYWORDS.DOpus, previousOwnClues: [] },
    TABLE_CLUE_RULES,
  );
  check(
    checks,
    "baseline clue submission passes as a set",
    submissionProblems.length === 0,
  );

  // 6. Inversion probe (live probe, not a validated benchmark): recorded
  // consistently — six results covering the six baseline clues, every
  // reconstruction at or above the provisional flag threshold.
  const probeCluesMatch =
    BASELINE_INVERSION_PROBE.results.length === BASELINE_GAME_CLUES.length &&
    BASELINE_GAME_CLUES.every((r) =>
      BASELINE_INVERSION_PROBE.results.some((p) => p.clue === r.clue),
    );
  check(
    checks,
    "inversion probe covers exactly the baseline clues",
    probeCluesMatch,
  );
  check(
    checks,
    "inversion probe flags every baseline clue at the provisional threshold",
    BASELINE_INVERSION_PROBE.results.every(
      (p) =>
        p.matchesTarget &&
        p.confidence >= BASELINE_INVERSION_PROBE.provisionalFlagThreshold &&
        p.confidence <= 1,
    ),
  );
  check(
    checks,
    "inversion probe route is pinned and epoch-free (dated slug)",
    validateModelRef(
      BASELINE_INVERSION_PROBE.modelRoute,
      BASELINE_INVERSION_PROBE.probedAt,
    ).length === 0 && BASELINE_INVERSION_PROBE.status === "live_probe",
  );
  const calibration = BLIND_INVERSION_CALIBRATION_2026_08_01;
  check(
    checks,
    "calibration record is probe-grade and internally consistent",
    calibration.status === "calibration_probe" &&
      calibration.baseline.clueCount === BASELINE_GAME_CLUES.length &&
      calibration.baseline.recovered >=
        calibration.baseline.flaggedAtThreshold &&
      calibration.baseline.knownMiss.confidence <
        calibration.baseline.threshold &&
      calibration.controls.recovered >= calibration.controls.flagged &&
      calibration.controls.clueCount === calibration.controls.tripleCount * 3 &&
      BLIND_INVERSION_PROTOCOL_VERSION === calibration.protocolVersion &&
      PROVISIONAL_INVERSION_VETO_POLICY_ID ===
        "provisional-inversion-veto@2026-08-01" &&
      PROVISIONAL_INVERSION_VETO_POLICY_HASH ===
        "eb2c5141cbf771e4d701bcfbb34644f55f64b4da4cc19ea4d1947558ef7b3c57" &&
      PROVISIONAL_INVERSION_VETO_POLICY.confidenceThreshold ===
        BASELINE_INVERSION_PROBE.provisionalFlagThreshold &&
      PROVISIONAL_INVERSION_VETO_POLICY.status === "probe" &&
      validateModelRef(calibration.modelRoute, calibration.auditedAt).length ===
        0,
  );
  check(
    checks,
    "inversion target recovery normalizes case, separators, and narrow plurals",
    normalizeInversionTokens("Atlanta FALCONS").join("|") ===
      "atlanta|falcon" &&
      conceptRecoversTarget("Atlanta Falcons", "FALCON") &&
      conceptRecoversTarget("celebrity red-carpet", "CARPET") &&
      !conceptRecoversTarget("wind", "WINDMILL"),
  );
  const inversionPolicyVectors: BlindInversionAudit[] = [
    {
      clue: "rank-two high confidence",
      concepts: [
        { concept: "warehouse", confidence: 0.2 },
        { concept: "factory", confidence: 0.7 },
      ],
      definitionShaped: false,
      directness: 0.1,
    },
    {
      clue: "definition-shaped direct clue",
      concepts: [{ concept: "building", confidence: 0.2 }],
      definitionShaped: true,
      directness: 0.7,
    },
    {
      clue: "rank-one low confidence",
      concepts: [{ concept: "windmill", confidence: 0.2 }],
      definitionShaped: false,
      directness: 0.1,
    },
    {
      clue: "definition-shaped rank-two recovery",
      concepts: [
        { concept: "turbine", confidence: 0.2 },
        { concept: "windmill", confidence: 0.3 },
      ],
      definitionShaped: true,
      directness: 0.1,
    },
    {
      clue: "rank-two low confidence",
      concepts: [
        { concept: "turbine", confidence: 0.2 },
        { concept: "windmill", confidence: 0.3 },
      ],
      definitionShaped: false,
      directness: 0.1,
    },
    {
      clue: "no target recovery",
      concepts: [{ concept: "turbine", confidence: 0.2 }],
      definitionShaped: false,
      directness: 0.1,
    },
  ];
  const inversionPolicyResults = evaluateBlindInversion(
    inversionPolicyVectors,
    ["factory", "factory", "windmill", "windmill", "windmill", "windmill"],
  );
  check(
    checks,
    "inversion vectors execute the shared hard-veto, soft-once, and pass tiers",
    inversionPolicyResults.map((result) => result.outcome).join("|") ===
      "hard_veto|hard_veto|soft_regenerate_once|soft_regenerate_once|pass|pass" &&
      inversionPolicyResults
        .map((result) => String(result.matchingConceptRank))
        .join("|") === "2|null|1|2|2|null" &&
      inversionPolicyResults.map((result) => String(result.flag)).join("|") ===
        "true|true|false|false|false|false",
  );

  // 6b. Cross-round referent evidence: the accumulated-history channel that a
  // single-clue audit cannot see, on its THIRD instrument. Two earlier ones
  // scored the 2026-08-01 Red incident `pass` against the exact dated model;
  // both raw traces are fixtures here and every check below is driven by them
  // or by the incidents themselves.
  const leak = CROSS_ROUND_COLUMN_LEAK_2026_08_01;
  const smokeEvents = CROSS_ROUND_PRODUCTION_SMOKE_EVENT_PROVENANCE_2026_08_01;
  check(
    checks,
    "production incident fixtures bind both observed human interceptions without claiming a reasoning path",
    smokeEvents.gameId === "884e2eac-0088-4cbc-8f23-54cd67d1712d" &&
      smokeEvents.events.redBotClues.sequence === 31 &&
      smokeEvents.events.redBotClues.eventId ===
        "3497a08f-fb42-4576-912b-45e6bf4dd2f7" &&
      smokeEvents.events.redBotClues.actorKind === "ai" &&
      smokeEvents.events.blueBotClues.sequence === 35 &&
      smokeEvents.events.blueBotClues.eventId ===
        "5665f360-7c81-41ce-a90e-63e5f0fda6c4" &&
      smokeEvents.events.blueBotClues.actorKind === "ai" &&
      smokeEvents.events.redHumanInterceptedBlue.sequence === 40 &&
      smokeEvents.events.redHumanInterceptedBlue.eventId ===
        "7c6e9772-a5f3-4a4d-bf4c-27fc224fd54f" &&
      smokeEvents.events.redHumanInterceptedBlue.actorKind === "human" &&
      smokeEvents.events.blueHumanInterceptedRed.sequence === 41 &&
      smokeEvents.events.blueHumanInterceptedRed.eventId ===
        "b4f8fb5f-2ab5-4985-a0bb-32bc4b3d2c42" &&
      smokeEvents.events.blueHumanInterceptedRed.actorKind === "human" &&
      smokeEvents.events.roundResolved.sequence === 44 &&
      smokeEvents.events.roundResolved.eventId ===
        "6e83de43-7a65-4708-85f0-140dbec95491" &&
      smokeEvents.events.roundResolved.outcome ===
        "both_round_2_bot_clue_triples_intercepted_by_humans" &&
      !smokeEvents.humanChatInspected &&
      !smokeEvents.humanReasoningPathKnown &&
      leak.interceptedByHumans &&
      !leak.humanReasoningPathKnown &&
      CROSS_ROUND_COLUMN_LEAK_BLUE_2026_08_01.interceptedByHumans &&
      !CROSS_ROUND_COLUMN_LEAK_BLUE_2026_08_01.humanReasoningPathKnown &&
      leak.requiredOutcomeBasis.includes("policy label") &&
      CROSS_ROUND_COLUMN_LEAK_BLUE_2026_08_01.requiredOutcomeBasis.includes(
        "policy label",
      ),
  );
  const leakLedger = buildPublicClueLedger(
    leak.resolvedRounds.map((round) => ({
      clues: round.clues as unknown as [string, string, string],
      code: round.code as unknown as [number, number, number],
    })),
  );
  const leakCode = leak.leakingRound.code as unknown as [
    number,
    number,
    number,
  ];
  check(
    checks,
    "public ledger files each resolved clue under the number it encoded",
    publicLedgerClueCount(leakLedger) === 3 &&
      leakLedger.map((column) => column.clues.join(",")).join("|") ===
        "Aggregate||Bengal|Firetruck" &&
      publicLedgerHasHistory(leakLedger) &&
      !publicLedgerHasHistory(buildPublicClueLedger([])),
  );

  /**
   * One clue's complete evidence row. Every slot is judged on its own merits;
   * unlisted slots are `none`. A listed edge must name the EXACT public clue
   * it bridges from, so these builders take the clue text and the evaluator
   * checks it against the ledger.
   */
  type EdgeSpec = readonly [number, string, string, ReferentStrength];
  const evidenceRow = (
    clueIndex: number,
    clue: string,
    edges: readonly EdgeSpec[],
  ): CrossRoundClueAudit => ({
    clueIndex,
    clue,
    historyMatches: CLUE_COLUMN_NUMBERS.map((number) => {
      const edge = edges.find((candidate) => candidate[0] === number);
      return {
        number,
        sharedReferent: edge ? edge[1] : null,
        publicClue: edge ? edge[2] : null,
        strength: edge ? edge[3] : ("none" as ReferentStrength),
      };
    }),
  });
  const referentReply = (
    audits: CrossRoundClueAudit[],
    codes: readonly (readonly [
      readonly [number, number, number],
      HypothesisSupport,
    ])[],
  ): CrossRoundAuditorReply => ({
    audits,
    codeHypotheses: codes.map(([code, support]) => ({
      code,
      support,
      rationale: null,
    })),
  });

  // ---- The retraction guard ----
  //
  // The 0.2 instrument was built on a claim about this trace that was simply
  // false: that the auditor's three rankings collapsed onto one slot and
  // produced an ILLEGAL joint hypothesis a one-to-one assignment would repair.
  // The recorded marginals argmax to 4,3,1 — three distinct slots, a legal
  // code. Nothing was ever illegal, so the assignment step had nothing to fix.
  // Assert the arithmetic so the retracted story cannot be reintroduced.
  const v01 = CROSS_ROUND_V01_LIVE_TRACE_2026_08_01;
  const v02 = CROSS_ROUND_V02_LIVE_TRACE_2026_08_01;
  const argmaxOf = (
    rows: readonly {
      readonly slots: readonly {
        readonly slot: number;
        readonly confidence: number;
      }[];
    }[],
  ) =>
    rows.map(
      (row) =>
        [...row.slots].sort(
          (left, right) => right.confidence - left.confidence,
        )[0]!.slot,
    );
  const v01Argmax = argmaxOf(v01.rankings);
  const v02Argmax = argmaxOf(v02.matrix);
  check(
    checks,
    "retracted: the live traces never produced a duplicate slot or an illegal joint hypothesis",
    // Both live runs argmax to the SAME legal code, and it is not the intended
    // one. The failure is a confident 1<->4 swap, not a collision.
    v01Argmax.join(",") === "4,3,1" &&
      v02Argmax.join(",") === "4,3,1" &&
      new Set(v01Argmax).size === 3 &&
      new Set(v02Argmax).size === 3 &&
      v01.marginalArgmaxIsLegalCode &&
      v01.marginalArgmax.join(",") === v01Argmax.join(",") &&
      v02.declaredCode.join(",") === v02Argmax.join(",") &&
      // A global assignment over the 24 legal codes returns the same answer,
      // which is why 0.2 changed nothing.
      v01.globalAssignment.join(",") === v01.marginalArgmax.join(",") &&
      v02.globalAssignment.join(",") === v02.declaredCode.join(",") &&
      v01Argmax.join(",") !== leakCode.join(",") &&
      // 0.2's prose did not merely fail: it hardened the wrong bridge.
      v02.confidenceOnWrongBridge.from === 0.45 &&
      v02.confidenceOnWrongBridge.to === 0.8 &&
      v01.observedOutcome === "pass" &&
      v02.observedOutcome === "pass" &&
      v02.usage.reasoningTokens === 26_716,
  );

  // HISTORICAL FIDELITY. Every recorded number below is a fact about a run
  // that happened, asserted so the record cannot drift. The route, the
  // instrument identity and the usage are all part of the result: a flag rate
  // is only comparable across calls that provably ran the same prompt on the
  // same dated route.
  //
  // Note what is NOT asserted here. An earlier draft derived a "no-information
  // baseline" from the empty slot 2 of the v0.2 matrix and concluded the model
  // had judged the true bridges worse than nothing. That inference is
  // RETRACTED: the prompt in force told the auditor to score an empty slot
  // "only from the clue itself" and that it "is sometimes the only placement
  // left", so those values mix clue-alone plausibility with elimination value
  // and support no conclusion about latent-parent judgement. The raw scores
  // stay; the inference is gone.
  const blueTraceRecord = CROSS_ROUND_V01_BLUE_TRACE_2026_08_01;
  const sameRoute = (
    route: (typeof v01)["route"] | (typeof v02)["route"],
  ): boolean =>
    route.provider === "openrouter" &&
    route.model === "deepseek/deepseek-v4-flash-0731" &&
    route.upstream === "DeepInfra" &&
    route.reasoningEffort === "xhigh" &&
    route.wireReasoningEffort === "max";
  check(
    checks,
    "recorded traces preserve exact route, instrument identity and usage",
    [v01, blueTraceRecord, v02].every((trace) => sameRoute(trace.route)) &&
      // v0.1 Red and Blue are one run of one instrument: same ids and hashes.
      v01.instrumentIdentity.protocolVersion ===
        "cross-round-column-inversion@0.1-probe" &&
      blueTraceRecord.instrumentIdentity.protocolVersion ===
        v01.instrumentIdentity.protocolVersion &&
      v01.instrumentIdentity.policyId ===
        "cross-round-column-veto@2026-08-01" &&
      v01.instrumentIdentity.policyHash ===
        "8c1e4e0bc02619c71cd3e8725e6a44e4114716cfd0fb9226f5cc1aa193710218" &&
      v01.instrumentIdentity.auditorPromptHash ===
        "647200ebee9a6775cdbc70a56805ae20a7c085b9d3febfa9a7d8dfd5b649e14e" &&
      blueTraceRecord.instrumentIdentity.policyHash ===
        v01.instrumentIdentity.policyHash &&
      blueTraceRecord.instrumentIdentity.auditorPromptHash ===
        v01.instrumentIdentity.auditorPromptHash &&
      // The retired v0.1 policy record still hashes to the value its runs were
      // scored under, so those two results stay readable.
      contentHash(CROSS_ROUND_COLUMN_VETO_POLICY) ===
        v01.instrumentIdentity.policyHash &&
      v02.instrumentIdentity.protocolVersion ===
        "cross-round-column-inversion@0.2-probe" &&
      v02.instrumentIdentity.policyId ===
        "cross-round-column-assignment-veto@2026-08-01" &&
      v02.instrumentIdentity.policyHash ===
        "92ad7aba1c64e162fbbfa0e07de6ecb82de333624abf648f52eb6ee5efbe1769" &&
      v02.instrumentIdentity.auditorPromptHash ===
        "aadf2be8f613542fdbaa1b428cf92a2ea286525e305c04ebf8e49e074beb200a" &&
      v02.instrumentIdentity.substrateVersion === "0.3.0" &&
      // Usage, verbatim.
      v01.usage.promptTokens === 541 &&
      v01.usage.completionTokens === 24_398 &&
      v01.usage.totalTokens === 24_939 &&
      v01.usage.reasoningTokens === 22_183 &&
      v01.usage.providerCostUsd === 0.004421898 &&
      v01.usage.latencyMs === 342_337 &&
      blueTraceRecord.usage.promptTokens === 544 &&
      blueTraceRecord.usage.completionTokens === 18_801 &&
      blueTraceRecord.usage.totalTokens === 19_345 &&
      blueTraceRecord.usage.reasoningTokens === 14_949 &&
      blueTraceRecord.usage.providerCostUsd === 0.003414708 &&
      blueTraceRecord.usage.latencyMs === 208_440 &&
      v02.usage.promptTokens === 849 &&
      v02.usage.completionTokens === 30_047 &&
      v02.usage.totalTokens === 30_896 &&
      v02.usage.reasoningTokens === 26_716 &&
      v02.usage.providerCostUsd === 0.005480262 &&
      v02.usage.latencyMs === 411_625 &&
      // Prompt + completion must equal the recorded total in every trace.
      [v01, blueTraceRecord, v02].every(
        (trace) =>
          trace.usage.promptTokens + trace.usage.completionTokens ===
          trace.usage.totalTokens,
      ) &&
      // Outcomes as observed. Blue was soft, NOT pass; an earlier record said
      // pass and that was wrong.
      v01.observedOutcome === "pass" &&
      v02.observedOutcome === "pass" &&
      blueTraceRecord.observedOutcome === "soft_regenerate_once" &&
      [v01, blueTraceRecord, v02].every(
        (trace) => trace.requiredOutcome === "hard_veto",
      ),
  );

  // The Blue matrix WAS preserved, and its arithmetic is checkable: the
  // marginal argmax and the legal global solve are both 1,4,3 against an
  // intended 4,1,3, at margin .38.
  const blueArgmax = argmaxOf(blueTraceRecord.rankings);
  check(
    checks,
    "v0.1 Blue: a legal argmax, a wrong one, and a genuine two-referent ambiguity",
    blueArgmax.join(",") === "1,4,3" &&
      new Set(blueArgmax).size === 3 &&
      blueTraceRecord.marginalArgmax.join(",") === blueArgmax.join(",") &&
      blueTraceRecord.marginalArgmaxIsLegalCode &&
      blueTraceRecord.globalAssignment.join(",") === blueArgmax.join(",") &&
      blueTraceRecord.globalAssignmentMargin === 0.38 &&
      blueTraceRecord.intendedCode.join(",") !== blueArgmax.join(",") &&
      // Every ranking covers all four slots exactly once, in both traces.
      [v01, blueTraceRecord].every((trace) =>
        trace.rankings.every(
          (row) => new Set(row.slots.map((slot) => slot.slot)).size === 4,
        ),
      ) &&
      // One ledger clue, two mutually exclusive parents.
      blueTraceRecord.competingReferents.length === 2 &&
      blueTraceRecord.competingReferents.every(
        (entry) => entry.ledgerClue === "crown" && entry.slot === 1,
      ) &&
      new Set(blueTraceRecord.competingReferents.map((entry) => entry.role))
        .size === 2,
  );

  // ---- TIER SHAPE, under an auditor that CAN see the bridges ----
  //
  // Read the label carefully. This reply is HAND-AUTHORED and it is NOT a
  // prediction about the dated model. It asserts one thing only: that IF an
  // auditor records the bridges it did not choose, the tiers convert that into
  // a hard veto without the auditor ever picking the right branch.
  //
  // The dated model is unlikely to produce this — see the baseline check
  // directly above. Treating a hand-authored optimistic reply as a regression
  // is exactly the error that shipped 0.2; this is a tier-shape test and the
  // Red canary remains OPEN.
  const redIncidentReply = referentReply(
    [
      evidenceRow(1, "blast", [
        [1, "quarry", "Aggregate", "plausible"],
        [4, "fire", "Firetruck", "strong"],
      ]),
      evidenceRow(2, "orange", [
        [3, "tiger", "Bengal", "strong"],
        [4, "warning colour", "Firetruck", "plausible"],
      ]),
      evidenceRow(3, "ascent", [
        [1, "rising total", "Aggregate", "plausible"],
        [4, "ladder", "Firetruck", "plausible"],
      ]),
    ],
    [
      [[4, 3, 1], "strong"],
      [[1, 3, 4], "strong"],
    ],
  );
  const redEvaluation = evaluateCrossRoundInversion(
    redIncidentReply,
    leakCode,
    leakLedger,
  );
  const leakConceptEvaluations = evaluateBlindInversion(
    leak.blindConceptAudit as unknown as BlindInversionAudit[],
    leakCode.map((number) => leak.ownKeywords[number - 1]!),
  );
  check(
    checks,
    "2026-08-01 Red: single-clue audit passes, referent evidence hard-vetoes despite a wrong top pick",
    leakConceptEvaluations.every(
      (evaluation) => evaluation.outcome === "pass",
    ) &&
      leak.singleClueProtocolOutcome === "pass" &&
      // The auditor's own best guess is the WRONG code, exactly as live.
      redIncidentReply.codeHypotheses[0]!.code.join(",") === "4,3,1" &&
      redEvaluation.credibleSetSize === 2 &&
      redEvaluation.dominatingHypotheses === 0 &&
      redEvaluation.coDominatingHypotheses === 1 &&
      redEvaluation.actionableIntendedEdges === 3 &&
      redEvaluation.strongIntendedEdges === 1 &&
      redEvaluation.historyBearingPositions === 3 &&
      redEvaluation.eliminationOnlyPositions === 0 &&
      // The referent hypotheses are carried through for private telemetry.
      redEvaluation.positions.map((p) => p.intendedSharedReferent).join("|") ===
        "quarry|tiger|ladder" &&
      redEvaluation.outcome === leak.requiredCrossRoundOutcome &&
      redEvaluation.outcome === "hard_veto" &&
      combineInversionOutcomes(["pass", redEvaluation.outcome]) === "hard_veto",
  );

  // Blue is the same failure with a sharper cause: `crown` is an honest clue
  // for two different hidden words, so one ledger entry supports two mutually
  // exclusive placements. Slot 4 additionally carries no history at all, so
  // treetop can only be reached by elimination and must never count.
  //
  // THIS REPLY IS HAND-AUTHORED AND IT IS NOT A PREDICTION ABOUT THE DATED
  // MODEL. It is a tier-shape test, exactly as the Red block above declares
  // itself to be, and the disclaimer belongs here even more than there — this
  // is the block that turned out to embed a false assumption about elicitation.
  //
  // FALSIFIED 2026-08-02, and left standing deliberately. The reply below
  // posits `turret -> slot 1 via "castle"/crown @ plausible` and a two-entry
  // credible set containing the intended [4,1,3]. The live dated model produced
  // NEITHER: it reported that cell as `none`, invented `turret -> slot 2 via
  // "fort"` instead, and returned the single code [1,2,3]. So the tier logic
  // asserted here is correct GIVEN this evidence, and the assumption that this
  // model would supply this evidence was never tested and is now known false.
  // The check stays because the evaluator's behaviour on a complete grid is
  // still worth pinning — and because it is the cleanest proof that the v0.3
  // failure is upstream of the evaluator. See
  // `CROSS_ROUND_V03_LIVE_BOUNDARY_2026_08_02`. Do not read a green run of this
  // check as evidence that Blue would be caught in production.
  const blueLeak = CROSS_ROUND_COLUMN_LEAK_BLUE_2026_08_01;
  const blueTrace = CROSS_ROUND_V01_BLUE_TRACE_2026_08_01;
  const blueLedger = buildPublicClueLedger(
    blueLeak.resolvedRounds.map((round) => ({
      clues: round.clues as unknown as [string, string, string],
      code: round.code as unknown as [number, number, number],
    })),
  );
  const blueCode = blueLeak.leakingRound.code as unknown as [
    number,
    number,
    number,
  ];
  const blueEvaluation = evaluateCrossRoundInversion(
    referentReply(
      [
        // Slot 4 is empty: null/none is mandatory, and the evaluator rejects
        // anything else outright.
        evidenceRow(1, "treetop", [[1, "tree", "crown", "plausible"]]),
        evidenceRow(2, "turret", [[1, "castle", "crown", "plausible"]]),
        evidenceRow(3, "nebula", [[3, "astronomy", "telescope", "strong"]]),
      ],
      [
        [[1, 4, 3], "strong"],
        [[4, 1, 3], "strong"],
      ],
    ),
    blueCode,
    blueLedger,
  );
  check(
    checks,
    "2026-08-01 Blue: a genuine two-referent ambiguity hard-vetoes while the history-free slot stays uncounted",
    blueTraceRecord.globalAssignment.join(",") === "1,4,3" &&
      blueTraceRecord.intendedCode.join(",") === blueCode.join(",") &&
      blueEvaluation.historyBearingPositions ===
        blueLeak.expectedHistoryBearingPositions &&
      // Only the two columns that carry history contribute.
      blueEvaluation.actionableIntendedEdges === 2 &&
      blueEvaluation.strongIntendedEdges === 1 &&
      blueEvaluation.dominatingHypotheses === 0 &&
      blueEvaluation.credibleSetSize === 2 &&
      blueEvaluation.positions[0]!.intendedNumber ===
        blueLeak.historyFreeNegativeControlNumber &&
      !blueEvaluation.positions[0]!.columnHadHistory &&
      !blueEvaluation.positions[0]!.intendedHistoryEdge &&
      blueEvaluation.positions[0]!.intendedStrength === "none" &&
      // ...but the fact that a hypothesis reached it by elimination IS recorded.
      blueEvaluation.positions[0]!.eliminationOnly &&
      blueEvaluation.eliminationOnlyPositions === 1 &&
      blueEvaluation.outcome === "hard_veto",
  );

  // ---- Post-incident shaped inputs. ----
  //
  // Two hand-authored reply shapes, and both must pass. One has no actionable
  // bridges; the other has STRONG bridges that simply do not land on the
  // intended code. The second is the one that matters mechanically —
  // an evidence-scoring instrument is only sound if strong evidence pointed
  // somewhere else does not accumulate against the supplied intended code.
  // Neither shape establishes that real play is safe or non-leaking.
  const opaqueEvaluation = evaluateCrossRoundInversion(
    referentReply(
      [
        evidenceRow(1, "kettle", [[1, "workshop", "Aggregate", "weak"]]),
        evidenceRow(2, "meridian", []),
        evidenceRow(3, "sable", [[3, "dark coat", "Bengal", "weak"]]),
      ],
      [
        [[2, 1, 3], "plausible"],
        [[2, 3, 1], "weak"],
      ],
    ),
    leakCode,
    leakLedger,
  );
  const wrongColumnEvaluation = evaluateCrossRoundInversion(
    referentReply(
      [
        evidenceRow(1, "kettle", [[4, "hose water", "Firetruck", "strong"]]),
        evidenceRow(2, "meridian", [[1, "survey line", "Aggregate", "strong"]]),
        evidenceRow(3, "sable", [[3, "big cat", "Bengal", "strong"]]),
      ],
      [[[4, 1, 3], "strong"]],
    ),
    leakCode,
    leakLedger,
  );
  check(
    checks,
    "shaped inputs: no actionable bridges passes, and strong bridges on the wrong columns also pass",
    opaqueEvaluation.outcome === "pass" &&
      opaqueEvaluation.dominatingHypotheses === null &&
      opaqueEvaluation.actionableIntendedEdges === 0 &&
      // Weak is deliberately below the actionable line.
      opaqueEvaluation.positions[0]!.intendedStrength === "weak" &&
      !opaqueEvaluation.positions[0]!.intendedHistoryEdge &&
      wrongColumnEvaluation.outcome === "pass" &&
      wrongColumnEvaluation.strongIntendedEdges === 0 &&
      wrongColumnEvaluation.actionableIntendedEdges === 0 &&
      wrongColumnEvaluation.dominatingHypotheses === null,
  );

  // ---- The tier ladder, monotone in the evidence ----
  const oneStrongEdge = evaluateCrossRoundInversion(
    referentReply(
      [
        evidenceRow(1, "kettle", []),
        evidenceRow(2, "orange", [[3, "tiger", "Bengal", "strong"]]),
        evidenceRow(3, "sable", []),
      ],
      [[[2, 3, 1], "strong"]],
    ),
    leakCode,
    leakLedger,
  );
  // An earlier draft hard-vetoed on this: two strong intended bridges with the
  // intended code absent from the credible set. It was removed because that
  // clause has 16.7% code-match breadth on a sparse reply with exactly three
  // strong cells on distinct slots: 4 of the 24 legal codes match two or more.
  // This is not a population error-rate floor; denser grids match more.
  // Evidence alone is never sufficient now.
  const twoStrongEdgesUnranked = evaluateCrossRoundInversion(
    referentReply(
      [
        evidenceRow(1, "blast", [[1, "quarry", "Aggregate", "strong"]]),
        evidenceRow(2, "orange", [[3, "tiger", "Bengal", "strong"]]),
        evidenceRow(3, "sable", []),
      ],
      [[[2, 3, 1], "strong"]],
    ),
    leakCode,
    leakLedger,
  );
  const rankFourTwoPlausible = evaluateCrossRoundInversion(
    referentReply(
      [
        evidenceRow(1, "blast", [[1, "quarry", "Aggregate", "plausible"]]),
        evidenceRow(2, "orange", [[3, "tiger", "Bengal", "plausible"]]),
        evidenceRow(3, "ascent", []),
      ],
      [
        [[4, 3, 1], "strong"],
        [[2, 3, 1], "strong"],
        [[4, 3, 2], "strong"],
        [[1, 3, 4], "plausible"],
      ],
    ),
    leakCode,
    leakLedger,
  );
  // Rank plus ONE bridge is the surviving soft path.
  const rankTwoOneEdge = evaluateCrossRoundInversion(
    referentReply(
      [
        evidenceRow(1, "blast", [[1, "quarry", "Aggregate", "plausible"]]),
        evidenceRow(2, "orange", []),
        evidenceRow(3, "ascent", []),
      ],
      [
        [[4, 3, 1], "strong"],
        [[1, 3, 4], "strong"],
      ],
    ),
    leakCode,
    leakLedger,
  );
  // Rank with NO evidence at all is nothing.
  const rankTwoNoEdges = evaluateCrossRoundInversion(
    referentReply(
      [
        evidenceRow(1, "blast", []),
        evidenceRow(2, "orange", []),
        evidenceRow(3, "ascent", []),
      ],
      [
        [[4, 3, 1], "strong"],
        [[1, 3, 4], "strong"],
      ],
    ),
    leakCode,
    leakLedger,
  );
  const twoPlausibleNoStrongReply = referentReply(
    [
      evidenceRow(1, "blast", [[1, "quarry", "Aggregate", "plausible"]]),
      evidenceRow(2, "orange", [[3, "tiger", "Bengal", "plausible"]]),
      evidenceRow(3, "ascent", []),
    ],
    [[[1, 3, 4], "plausible"]],
  );
  const twoPlausibleNoStrongDefault = evaluateCrossRoundInversion(
    twoPlausibleNoStrongReply,
    leakCode,
    leakLedger,
  );
  const twoPlausibleNoStrongRelaxed = evaluateCrossRoundInversion(
    twoPlausibleNoStrongReply,
    leakCode,
    leakLedger,
    {
      ...CROSS_ROUND_REFERENT_EVIDENCE_VETO_POLICY,
      requiresAtLeastOneStrongIntendedEdge: false,
    },
  );
  const twoPlausibleRaisedMinimum = evaluateCrossRoundInversion(
    twoPlausibleNoStrongReply,
    leakCode,
    leakLedger,
    {
      ...CROSS_ROUND_REFERENT_EVIDENCE_VETO_POLICY,
      minimumHardVetoSupport: "strong",
    },
  );
  let policyCapExecuted = false;
  try {
    evaluateCrossRoundInversion(redIncidentReply, leakCode, leakLedger, {
      ...CROSS_ROUND_REFERENT_EVIDENCE_VETO_POLICY,
      maxCodeHypotheses: 1,
      hardVetoDominatedByAtMost: 0,
      hardVetoCredibleSetSizeAtMost: 1,
      softVetoDominatedByAtMost: 0,
    });
  } catch (error) {
    policyCapExecuted =
      error instanceof Error && error.message.includes("policy cap of 1");
  }
  check(
    checks,
    "cross-round tiers are monotone in evidence and never read a numeric confidence",
    // Evidence with the code unranked is not actionable at ANY strength.
    oneStrongEdge.outcome === "pass" &&
      oneStrongEdge.strongIntendedEdges === 1 &&
      oneStrongEdge.dominatingHypotheses === null &&
      twoStrongEdgesUnranked.outcome === "pass" &&
      twoStrongEdgesUnranked.strongIntendedEdges === 2 &&
      twoStrongEdgesUnranked.dominatingHypotheses === null &&
      // Rank plus one bridge is soft; rank with no bridge is nothing.
      rankTwoOneEdge.outcome === "soft_regenerate_once" &&
      rankTwoOneEdge.dominatingHypotheses === 0 &&
      rankTwoOneEdge.actionableIntendedEdges === 1 &&
      rankTwoNoEdges.outcome === "pass" &&
      rankTwoNoEdges.dominatingHypotheses === 0 &&
      rankTwoNoEdges.actionableIntendedEdges === 0 &&
      // Relative support alone is near-vacuous, so it is always conjoined
      // with evidence. At most two stronger readings plus two actionable
      // edges is soft; hard additionally needs the narrow-set and strong-edge
      // requirements.
      // Three readings believed MORE than the intended one: the auditor's own
      // search is wide, so this is not a lock.
      rankFourTwoPlausible.outcome === "pass" &&
      rankFourTwoPlausible.dominatingHypotheses === 3 &&
      rankFourTwoPlausible.actionableIntendedEdges === 2 &&
      redEvaluation.outcome === "hard_veto" &&
      redEvaluation.actionableIntendedEdges === 3 &&
      // Every threshold represented in the hashed policy is executable.
      twoPlausibleNoStrongDefault.outcome === "soft_regenerate_once" &&
      twoPlausibleNoStrongRelaxed.outcome === "hard_veto" &&
      twoPlausibleRaisedMinimum.outcome === "pass" &&
      policyCapExecuted,
  );

  // ---- Ledger depth is part of the instrument ----
  //
  // Which columns can host evidence at all is a function of depth, so a
  // one-round ledger and a five-round ledger are different instruments. At
  // depth 1 slot 2 is empty and a bridge claimed there is rejected outright;
  // by depth 3 it carries history and the identical claim is counted.
  const depthOneLedger = leakLedger;
  const depthThreeLedger = buildPublicClueLedger([
    { clues: ["Aggregate", "Bengal", "Firetruck"], code: [1, 3, 4] },
    { clues: ["gravel", "roost", "siren"], code: [1, 2, 4] },
    { clues: ["mesa", "stripe", "rung"], code: [1, 3, 4] },
  ]);
  const depthFiveLedger = buildPublicClueLedger([
    { clues: ["Aggregate", "Bengal", "Firetruck"], code: [1, 3, 4] },
    { clues: ["gravel", "roost", "siren"], code: [1, 2, 4] },
    { clues: ["mesa", "stripe", "rung"], code: [1, 3, 4] },
    { clues: ["nest", "pelt", "hydrant"], code: [2, 3, 4] },
    { clues: ["pit", "feather", "climb"], code: [1, 2, 4] },
  ]);
  const slotTwoClaim = referentReply(
    [
      evidenceRow(1, "blast", [
        [1, "quarry", "Aggregate", "plausible"],
        [2, "nesting", "roost", "plausible"],
      ]),
      evidenceRow(2, "orange", [[3, "tiger", "Bengal", "strong"]]),
      evidenceRow(3, "ascent", []),
    ],
    [
      [[1, 3, 4], "strong"],
      [[2, 3, 4], "weak"],
    ],
  );
  let depthOneRejected = false;
  try {
    evaluateCrossRoundInversion(slotTwoClaim, leakCode, depthOneLedger);
  } catch {
    depthOneRejected = true;
  }
  const depthThreeEvaluation = evaluateCrossRoundInversion(
    slotTwoClaim,
    leakCode,
    depthThreeLedger,
  );
  const depthFiveEvaluation = evaluateCrossRoundInversion(
    slotTwoClaim,
    leakCode,
    depthFiveLedger,
  );
  check(
    checks,
    "ledger depth changes which columns can host evidence at all",
    publicLedgerClueCount(depthOneLedger) === 3 &&
      publicLedgerClueCount(depthThreeLedger) === 9 &&
      publicLedgerClueCount(depthFiveLedger) === 15 &&
      depthOneLedger.filter((column) => column.clues.length === 0).length ===
        1 &&
      depthThreeLedger.every((column) => column.clues.length > 0) &&
      depthFiveLedger.every((column) => column.clues.length > 0) &&
      // The identical reply is a hard reject at depth 1 and legal at depth 3.
      depthOneRejected &&
      depthThreeEvaluation.outcome === "hard_veto" &&
      depthThreeEvaluation.dominatingHypotheses === 0 &&
      depthThreeEvaluation.actionableIntendedEdges === 2 &&
      // Depth alone must not change the verdict once the columns exist.
      depthFiveEvaluation.outcome === depthThreeEvaluation.outcome &&
      depthFiveEvaluation.actionableIntendedEdges ===
        depthThreeEvaluation.actionableIntendedEdges,
  );

  // ---- Shared parser: one accept/reject corpus for both apps ----
  const LEDGER_CLUE: Record<number, string> = {
    1: "Aggregate",
    3: "Bengal",
    4: "Firetruck",
  };
  const jsonRow = (clueIndex: number, top: number) => ({
    clueIndex,
    matches: CLUE_COLUMN_NUMBERS.map((slot) => ({
      slot,
      sharedReferent: slot === top ? "shared parent" : null,
      publicClue: slot === top ? (LEDGER_CLUE[slot] ?? null) : null,
      strength: slot === top ? "plausible" : "none",
    })),
  });
  const sharedParserBody = JSON.stringify({
    historyMatches: leakCode.map((slot, index) => ({
      ...jsonRow(index + 1, slot),
      ignoredEntryField: true,
    })),
    codeHypotheses: [
      { code: [...leakCode], support: "strong", rationale: "shared corpus" },
    ],
    ignoredEnvelopeField: "same accept set",
  });
  const sharedParserClues = leak.leakingRound.clues as unknown as [
    string,
    string,
    string,
  ];
  const parsedDirect = parseCrossRoundAuditorReply(
    sharedParserBody,
    sharedParserClues,
  );
  const parsedWithTrailingObject = parseCrossRoundAuditorReply(
    `${sharedParserBody}\n{"extra":true}`,
    sharedParserClues,
  );
  const parsedAfterBrokenFence = parseCrossRoundAuditorReply(
    `\`\`\`json\nnot valid json\n\`\`\`\n${sharedParserBody}`,
    sharedParserClues,
  );
  const goodRows = leakCode.map((slot, index) => jsonRow(index + 1, slot));
  const goodCodes = [
    { code: [...leakCode], support: "strong", rationale: null },
  ];
  const badReplies: string[] = [
    "not json",
    '{"historyMatches":[]}',
    JSON.stringify({ historyMatches: goodRows }),
    // Row identity: missing, non-integer, out of range, duplicated, reordered.
    JSON.stringify({
      historyMatches: goodRows.map(({ clueIndex, ...rest }) => rest),
      codeHypotheses: goodCodes,
    }),
    JSON.stringify({
      historyMatches: goodRows.map((row, index) => ({
        ...row,
        clueIndex: index === 0 ? 1.5 : row.clueIndex,
      })),
      codeHypotheses: goodCodes,
    }),
    JSON.stringify({
      historyMatches: goodRows.map((row, index) => ({
        ...row,
        clueIndex: index === 0 ? 4 : row.clueIndex,
      })),
      codeHypotheses: goodCodes,
    }),
    JSON.stringify({
      historyMatches: goodRows.map((row) => ({ ...row, clueIndex: 1 })),
      codeHypotheses: goodCodes,
    }),
    // Swapped rows: the model reordered its answer. Position alone is not
    // identity, and relabelling silently would have hidden this.
    JSON.stringify({
      historyMatches: [goodRows[1], goodRows[0], goodRows[2]],
      codeHypotheses: goodCodes,
    }),
    // A partial row omits the second-best bridge this instrument exists for.
    JSON.stringify({
      historyMatches: [1, 2, 3].map((clueIndex) => ({
        clueIndex,
        matches: [
          { slot: 1, sharedReferent: null, publicClue: null, strength: "none" },
        ],
      })),
      codeHypotheses: goodCodes,
    }),
    JSON.stringify({
      historyMatches: [1, 2, 3].map((clueIndex) => ({
        clueIndex,
        matches: [1, 1, 3, 4].map((slot) => ({
          slot,
          sharedReferent: null,
          publicClue: null,
          strength: "none",
        })),
      })),
      codeHypotheses: goodCodes,
    }),
    JSON.stringify({
      historyMatches: [1, 2, 3].map((clueIndex) => ({
        clueIndex,
        matches: CLUE_COLUMN_NUMBERS.map((slot) => ({
          slot,
          sharedReferent: "x",
          publicClue: "Aggregate",
          strength: "very strong",
        })),
      })),
      codeHypotheses: goodCodes,
    }),
    // The bridge triple must be complete: strength, referent, public clue.
    JSON.stringify({
      historyMatches: [1, 2, 3].map((clueIndex) => ({
        clueIndex,
        matches: CLUE_COLUMN_NUMBERS.map((slot) => ({
          slot,
          sharedReferent: "x",
          publicClue: "Aggregate",
          strength: "none",
        })),
      })),
      codeHypotheses: goodCodes,
    }),
    JSON.stringify({
      historyMatches: [1, 2, 3].map((clueIndex) => ({
        clueIndex,
        matches: CLUE_COLUMN_NUMBERS.map((slot) => ({
          slot,
          sharedReferent: slot === 1 ? "x" : null,
          publicClue: null,
          strength: slot === 1 ? "strong" : "none",
        })),
      })),
      codeHypotheses: goodCodes,
    }),
    // Hypothesis set: empty, over cap, duplicated, illegal, bad support tier.
    JSON.stringify({ historyMatches: goodRows, codeHypotheses: [] }),
    JSON.stringify({
      historyMatches: goodRows,
      codeHypotheses: LEGAL_CODE_TRIPLES.slice(0, MAX_CODE_HYPOTHESES + 1).map(
        (code) => ({ code, support: "weak", rationale: null }),
      ),
    }),
    JSON.stringify({
      historyMatches: goodRows,
      codeHypotheses: [
        { code: [1, 3, 4], support: "strong", rationale: null },
        { code: [1, 3, 4], support: "weak", rationale: null },
      ],
    }),
    JSON.stringify({
      historyMatches: goodRows,
      codeHypotheses: [{ code: [1, 1, 4], support: "strong", rationale: null }],
    }),
    JSON.stringify({
      historyMatches: goodRows,
      codeHypotheses: [{ code: [1, 3, 5], support: "strong", rationale: null }],
    }),
    JSON.stringify({
      historyMatches: goodRows,
      codeHypotheses: [{ code: [1, 3, 4], support: "very likely" }],
    }),
    JSON.stringify({
      historyMatches: goodRows,
      codeHypotheses: [
        { code: [1, 3, 4], support: "strong", rationale: "x".repeat(401) },
      ],
    }),
  ];
  let sharedParserRejected = 0;
  for (const badText of badReplies) {
    try {
      parseCrossRoundAuditorReply(badText, sharedParserClues);
    } catch {
      sharedParserRejected += 1;
    }
  }
  check(
    checks,
    "cross-round parser has one tolerant accept/reject corpus for both apps",
    JSON.stringify(parsedDirect) === JSON.stringify(parsedWithTrailingObject) &&
      JSON.stringify(parsedDirect) === JSON.stringify(parsedAfterBrokenFence) &&
      parsedDirect.audits.map((audit) => audit.clue).join("|") ===
        sharedParserClues.join("|") &&
      parsedDirect.audits.map((audit) => audit.clueIndex).join("|") ===
        "1|2|3" &&
      parsedDirect.audits.every(
        (audit) => audit.historyMatches.length === CLUE_COLUMN_NUMBERS.length,
      ) &&
      parsedDirect.codeHypotheses.length === 1 &&
      parsedDirect.codeHypotheses[0]!.support === "strong" &&
      parsedDirect.codeHypotheses[0]!.rationale === "shared corpus" &&
      sharedParserRejected === badReplies.length,
  );

  // ---- Public-clue binding: a bridge must point at real, checkable evidence
  const bindingLedger = leakLedger;
  const bindingCases: Array<[string, () => unknown]> = [
    [
      "quotes a clue filed under a DIFFERENT slot",
      () =>
        evaluateCrossRoundInversion(
          referentReply(
            [
              evidenceRow(1, "blast", [[1, "quarry", "Bengal", "strong"]]),
              evidenceRow(2, "orange", []),
              evidenceRow(3, "ascent", []),
            ],
            [[[1, 3, 4], "strong"]],
          ),
          leakCode,
          bindingLedger,
        ),
    ],
    [
      "quotes a clue that is not in the ledger at all",
      () =>
        evaluateCrossRoundInversion(
          referentReply(
            [
              evidenceRow(1, "blast", [[1, "quarry", "Fabricated", "strong"]]),
              evidenceRow(2, "orange", []),
              evidenceRow(3, "ascent", []),
            ],
            [[[1, 3, 4], "strong"]],
          ),
          leakCode,
          bindingLedger,
        ),
    ],
    [
      "claims a bridge on an empty column",
      () =>
        evaluateCrossRoundInversion(
          referentReply(
            [
              evidenceRow(1, "blast", [[2, "invented", "Aggregate", "strong"]]),
              evidenceRow(2, "orange", []),
              evidenceRow(3, "ascent", []),
            ],
            [[[1, 3, 4], "strong"]],
          ),
          leakCode,
          bindingLedger,
        ),
    ],
    [
      "differs from the ledger only by case",
      () =>
        evaluateCrossRoundInversion(
          referentReply(
            [
              evidenceRow(1, "blast", [[1, "quarry", "aggregate", "strong"]]),
              evidenceRow(2, "orange", []),
              evidenceRow(3, "ascent", []),
            ],
            [[[1, 3, 4], "strong"]],
          ),
          leakCode,
          bindingLedger,
        ),
    ],
  ];
  let bindingRejected = 0;
  for (const [, run] of bindingCases) {
    try {
      run();
    } catch {
      bindingRejected += 1;
    }
  }
  const boundEvaluation = evaluateCrossRoundInversion(
    referentReply(
      [
        evidenceRow(1, "blast", [[1, "quarry", "Aggregate", "strong"]]),
        evidenceRow(2, "orange", [[3, "tiger", "Bengal", "strong"]]),
        evidenceRow(3, "ascent", []),
      ],
      [[[1, 3, 4], "strong"]],
    ),
    leakCode,
    bindingLedger,
  );
  check(
    checks,
    "every history bridge is bound to an exact public clue in its own slot",
    // Matching is EXACT, including case: the ledger holds the canonical
    // string, and a normalised comparison would reopen the door to a bridge
    // that only approximately names its evidence.
    bindingRejected === bindingCases.length &&
      boundEvaluation.actionableIntendedEdges === 2 &&
      boundEvaluation.positions[0]!.intendedPublicClue === "Aggregate" &&
      boundEvaluation.positions[1]!.intendedPublicClue === "Bengal" &&
      boundEvaluation.positions[2]!.intendedPublicClue === null,
  );

  // ---- vetoBreadth: a deterministic, model-free selectivity bound ----
  //
  // Sweep the intended code over ALL 24 legal triples against the SAME reply
  // and ledger, and count how many hard-veto. Exactly one of those triples is
  // the real code; the other 23 are counterfactual applications of the same
  // fixed reply. This exposes the evaluator's maximum selectivity breadth
  // without a provider call or an assumed distribution over model answers.
  // Because the reply was generated conditional on the actual clues, this is
  // NOT an empirical population error rate or an independent permutation null.
  //
  // It also makes the conjunction's true worst case visible. A hard veto needs
  // the intended code inside a credible set of at most 3, so at most 3 of 24
  // codes (12.5%) can hard-veto on any one reply. That is a MIN over the two
  // layers, not a product: reading the conjunction as 8.3% x 16.7% is wrong by
  // about an order of magnitude, because the credible set is built FROM the
  // evidence grid and the layers are not independent.
  const vetoBreadth = (
    reply: CrossRoundAuditorReply,
    target: PublicClueLedger,
  ) =>
    LEGAL_CODE_TRIPLES.filter((code) => {
      try {
        return (
          evaluateCrossRoundInversion(reply, code, target).outcome ===
          "hard_veto"
        );
      } catch {
        return false;
      }
    }).length;
  const redBreadth = vetoBreadth(redIncidentReply, leakLedger);
  const opaqueBreadth = vetoBreadth(
    referentReply(
      [
        evidenceRow(1, "kettle", [[1, "workshop", "Aggregate", "weak"]]),
        evidenceRow(2, "meridian", []),
        evidenceRow(3, "sable", [[3, "dark coat", "Bengal", "weak"]]),
      ],
      [
        [[2, 1, 3], "plausible"],
        [[2, 3, 1], "weak"],
      ],
    ),
    leakLedger,
  );
  check(
    checks,
    "vetoBreadth: the same reply hard-vetoes only a small minority of the 24 legal codes",
    // The real code is one of the vetoed set, so breadth is at least 1 here.
    redBreadth >= 1 &&
      // ...and bounded by the credible-set cap, which is the whole point of
      // reading set size explicitly.
      redBreadth <=
        CROSS_ROUND_REFERENT_EVIDENCE_VETO_POLICY.hardVetoCredibleSetSizeAtMost &&
      redBreadth <= LEGAL_CODE_TRIPLES.length / 8 &&
      // An opaque reply must veto NOTHING, for any intended code at all. This
      // is a post-incident shaped input that a veto-everything evaluator
      // cannot pass; it does not establish a safety distribution.
      opaqueBreadth === 0,
  );

  // ---- Credible-set ordering is never read ----
  //
  // `dominatingHypotheses` counts only hypotheses supported more strongly than
  // the intended one; equal-support alternatives are recorded separately.
  // Permuting entries cannot move either measure, and a strictly weaker extra
  // entry cannot improve or worsen the verdict.
  const permutationBase: readonly (readonly [
    readonly [number, number, number],
    HypothesisSupport,
  ])[] = [
    [[4, 3, 1], "strong"],
    [[1, 3, 4], "strong"],
    [[2, 3, 1], "weak"],
  ];
  const permutationEvidence = () => [
    evidenceRow(1, "blast", [[1, "quarry", "Aggregate", "plausible"]]),
    evidenceRow(2, "orange", [[3, "tiger", "Bengal", "strong"]]),
    evidenceRow(3, "ascent", []),
  ];
  const permute = (
    codes: readonly (readonly [
      readonly [number, number, number],
      HypothesisSupport,
    ])[],
  ) =>
    evaluateCrossRoundInversion(
      referentReply(permutationEvidence(), codes),
      leakCode,
      leakLedger,
    );
  const permutations = [
    [permutationBase[0]!, permutationBase[1]!, permutationBase[2]!],
    [permutationBase[1]!, permutationBase[0]!, permutationBase[2]!],
    [permutationBase[2]!, permutationBase[1]!, permutationBase[0]!],
    [permutationBase[1]!, permutationBase[2]!, permutationBase[0]!],
  ].map((codes) => permute(codes));
  // A weaker entry added to the set must not change anything either.
  const withWeakerExtra = permute([
    ...permutationBase,
    [[2, 1, 3], "weak"] as const,
  ]);
  check(
    checks,
    "credible-set ordering is never read and equal support is genuinely equal",
    permutations.every(
      (evaluation) =>
        evaluation.outcome === permutations[0]!.outcome &&
        evaluation.dominatingHypotheses ===
          permutations[0]!.dominatingHypotheses,
    ) &&
      // Two `strong` entries, the intended one among them: rank 2, not 1 or 3.
      permutations[0]!.dominatingHypotheses === 0 &&
      permutations[0]!.intendedSupport === "strong" &&
      permutations[0]!.outcome === "hard_veto" &&
      // Adding an entry the auditor believes LESS leaves `dominating`
      // untouched — the eviction perversity of the old count-at-or-above rule
      // is gone — while credible-set size is read as its own explicit term, so
      // a wider stated search correctly relaxes the verdict rather than
      // strengthening it.
      withWeakerExtra.dominatingHypotheses ===
        permutations[0]!.dominatingHypotheses &&
      withWeakerExtra.credibleSetSize === 4 &&
      withWeakerExtra.outcome === "soft_regenerate_once" &&
      // The absolute belief floor: a hard veto must never fire on the
      // auditor's own lowest-belief entry, however few rivals it has.
      permute([
        [[4, 3, 1], "strong"],
        [[1, 3, 4], "weak"],
      ]).outcome === "pass" &&
      // Demote the intended hypothesis below its rival and the rank moves,
      // because support — not position — is what is read.
      permute([
        [[4, 3, 1], "strong"],
        [[1, 3, 4], "plausible"],
      ]).dominatingHypotheses === 1 &&
      permute([
        [[4, 3, 1], "strong"],
        [[2, 3, 1], "strong"],
        [[4, 3, 2], "strong"],
        [[1, 3, 4], "plausible"],
      ]).dominatingHypotheses === 3 &&
      HYPOTHESIS_SUPPORTS.join("|") === "weak|plausible|strong",
  );

  // Degenerate input must throw rather than fall through to `pass`: this is
  // exported substrate surface and is the last thing between a malformed audit
  // and a silent acceptance.
  const validReply = () =>
    referentReply(
      [
        evidenceRow(1, "blast", [[1, "quarry", "Aggregate", "plausible"]]),
        evidenceRow(2, "orange", [[3, "tiger", "Bengal", "strong"]]),
        evidenceRow(3, "ascent", [[4, "ladder", "Firetruck", "plausible"]]),
      ],
      [[[1, 3, 4], "strong"]],
    );
  const degenerate: Array<() => unknown> = [
    () =>
      evaluateCrossRoundInversion(
        { ...validReply(), audits: validReply().audits.slice(0, 2) },
        leakCode,
        leakLedger,
      ),
    () =>
      evaluateCrossRoundInversion(
        { ...validReply(), codeHypotheses: [] },
        leakCode,
        leakLedger,
      ),
    () =>
      evaluateCrossRoundInversion(
        {
          ...validReply(),
          codeHypotheses: LEGAL_CODE_TRIPLES.slice(
            0,
            MAX_CODE_HYPOTHESES + 1,
          ).map((code) => ({
            code,
            support: "weak" as const,
            rationale: null,
          })),
        },
        leakCode,
        leakLedger,
      ),
    () =>
      evaluateCrossRoundInversion(
        {
          ...validReply(),
          codeHypotheses: [
            { code: [1, 3, 4], support: "strong" as const, rationale: null },
            { code: [1, 3, 4], support: "strong" as const, rationale: null },
          ],
        },
        leakCode,
        leakLedger,
      ),
    () =>
      evaluateCrossRoundInversion(
        {
          ...validReply(),
          codeHypotheses: [
            {
              code: [1, 1, 4] as never,
              support: "strong" as const,
              rationale: null,
            },
          ],
        },
        leakCode,
        leakLedger,
      ),
    () =>
      evaluateCrossRoundInversion(
        {
          ...validReply(),
          codeHypotheses: [
            { code: [1, 3, 4], support: "  " as never, rationale: null },
          ],
        },
        leakCode,
        leakLedger,
      ),
    // A short evidence row.
    () =>
      evaluateCrossRoundInversion(
        {
          ...validReply(),
          audits: validReply().audits.map((audit) => ({
            ...audit,
            historyMatches: audit.historyMatches.slice(0, 2),
          })),
        },
        leakCode,
        leakLedger,
      ),
    // A duplicated column inside a row.
    () =>
      evaluateCrossRoundInversion(
        {
          ...validReply(),
          audits: validReply().audits.map((audit) => ({
            ...audit,
            historyMatches: audit.historyMatches.map((match) => ({
              ...match,
              number: 1,
            })),
          })),
        },
        leakCode,
        leakLedger,
      ),
    // An unknown strength value.
    () =>
      evaluateCrossRoundInversion(
        {
          ...validReply(),
          audits: validReply().audits.map((audit) => ({
            ...audit,
            historyMatches: audit.historyMatches.map((match) => ({
              ...match,
              sharedReferent: "x",
              strength: "overwhelming" as never,
            })),
          })),
        },
        leakCode,
        leakLedger,
      ),
    // THE EMPTY-COLUMN INVARIANT. Slot 2 carries nothing, so a shared referent
    // has nothing to be shared WITH; a claim there is a hallucination or is
    // single-clue transparency wearing this instrument's clothes.
    () =>
      evaluateCrossRoundInversion(
        {
          ...validReply(),
          audits: validReply().audits.map((audit) => ({
            ...audit,
            historyMatches: audit.historyMatches.map((match) =>
              match.number === 2
                ? {
                    ...match,
                    sharedReferent: "invented",
                    strength: "strong" as const,
                  }
                : match,
            ),
          })),
        },
        leakCode,
        leakLedger,
      ),
    () => evaluateCrossRoundInversion(validReply(), [1, 1, 3], leakLedger),
    () => evaluateCrossRoundInversion(validReply(), [0, 1, 3], leakLedger),
    () =>
      evaluateCrossRoundInversion(validReply(), leakCode, [
        { number: 1, clues: [] },
      ]),
    () =>
      evaluateCrossRoundInversion(
        validReply(),
        leakCode,
        leakLedger.map((column) =>
          column.number === 1 ? { ...column, clues: [""] } : column,
        ),
      ),
    () =>
      evaluateCrossRoundInversion(
        validReply(),
        leakCode,
        leakLedger.map((column) =>
          column.number === 1
            ? { ...column, clues: ["x".repeat(201)] }
            : column,
        ),
      ),
    // Rank thresholds outside 1 <= hard <= soft <= cap.
    () =>
      evaluateCrossRoundInversion(validReply(), leakCode, leakLedger, {
        ...CROSS_ROUND_REFERENT_EVIDENCE_VETO_POLICY,
        hardVetoDominatedByAtMost: -1,
        softVetoDominatedByAtMost: 4,
        hardVetoCredibleSetSizeAtMost: 3,
      }),
    () =>
      evaluateCrossRoundInversion(validReply(), leakCode, leakLedger, {
        ...CROSS_ROUND_REFERENT_EVIDENCE_VETO_POLICY,
        hardVetoDominatedByAtMost: 5,
        softVetoDominatedByAtMost: 1,
        hardVetoCredibleSetSizeAtMost: 3,
      }),
    () =>
      evaluateCrossRoundInversion(validReply(), leakCode, leakLedger, {
        ...CROSS_ROUND_REFERENT_EVIDENCE_VETO_POLICY,
        hardVetoDominatedByAtMost: 2,
        softVetoDominatedByAtMost: MAX_CODE_HYPOTHESES + 1,
        hardVetoCredibleSetSizeAtMost: 3,
      }),
  ];
  let degenerateRejected = 0;
  for (const badInput of degenerate) {
    try {
      badInput();
    } catch {
      degenerateRejected += 1;
    }
  }
  check(
    checks,
    "cross-round evaluation rejects degenerate input instead of passing it",
    degenerateRejected === degenerate.length,
  );

  const policy = CROSS_ROUND_REFERENT_EVIDENCE_VETO_POLICY;
  check(
    checks,
    "cross-round protocol and policy identity are pinned and distinct from every retired instrument",
    CROSS_ROUND_INVERSION_PROTOCOL_VERSION ===
      "cross-round-referent-evidence@0.3-probe" &&
      // Widened to string on purpose: two instruments must never share an id,
      // and that guard has to survive someone editing one literal to match
      // another, which the literal types alone would then permit.
      distinctIds(
        CROSS_ROUND_INVERSION_PROTOCOL_VERSION,
        BLIND_INVERSION_PROTOCOL_VERSION,
      ) &&
      distinctIds(
        CROSS_ROUND_INVERSION_PROTOCOL_VERSION,
        "cross-round-column-inversion@0.1-probe",
      ) &&
      distinctIds(
        CROSS_ROUND_INVERSION_PROTOCOL_VERSION,
        "cross-round-column-inversion@0.2-probe",
      ) &&
      CROSS_ROUND_COLUMN_VETO_POLICY_ID ===
        "cross-round-referent-evidence-veto@2026-08-01" &&
      distinctIds(
        CROSS_ROUND_COLUMN_VETO_POLICY_ID,
        PROVISIONAL_INVERSION_VETO_POLICY_ID,
      ) &&
      distinctIds(
        CROSS_ROUND_COLUMN_VETO_POLICY_ID,
        "cross-round-column-veto@2026-08-01",
      ) &&
      distinctIds(
        CROSS_ROUND_COLUMN_VETO_POLICY_ID,
        "cross-round-column-assignment-veto@2026-08-01",
      ) &&
      CROSS_ROUND_COLUMN_VETO_POLICY_HASH ===
        EXPECTED_CROSS_ROUND_POLICY_HASH &&
      CROSS_ROUND_COLUMN_VETO_POLICY_HASH === contentHash(policy) &&
      // Both historical policy objects survive UNEDITED so their live traces
      // stay readable. Later retirement is an adjacent record, never a policy
      // mutation. Their hashes are pinned literally here.
      contentHash(CROSS_ROUND_COLUMN_VETO_POLICY) ===
        "8c1e4e0bc02619c71cd3e8725e6a44e4114716cfd0fb9226f5cc1aa193710218" &&
      CROSS_ROUND_COLUMN_VETO_POLICY.confidenceThreshold === 0.6 &&
      CROSS_ROUND_COLUMN_ASSIGNMENT_VETO_POLICY.status === "probe" &&
      contentHash(CROSS_ROUND_COLUMN_ASSIGNMENT_VETO_POLICY) ===
        "92ad7aba1c64e162fbbfa0e07de6ecb82de333624abf648f52eb6ee5efbe1769" &&
      CROSS_ROUND_COLUMN_ASSIGNMENT_VETO_POLICY_RETIREMENT_2026_08_01.status ===
        "retired" &&
      CROSS_ROUND_COLUMN_ASSIGNMENT_VETO_POLICY_RETIREMENT_2026_08_01.policyHash ===
        contentHash(CROSS_ROUND_COLUMN_ASSIGNMENT_VETO_POLICY) &&
      CROSS_ROUND_COLUMN_ASSIGNMENT_VETO_POLICY.assignmentMarginThreshold ===
        0.15 &&
      distinctIds(
        CROSS_ROUND_COLUMN_VETO_POLICY_HASH,
        contentHash(CROSS_ROUND_COLUMN_VETO_POLICY),
      ) &&
      policy.status === "probe" &&
      policy.hardVetoDominatedByAtMost === 1 &&
      policy.softVetoDominatedByAtMost === 2 &&
      policy.hardVetoCredibleSetSizeAtMost === 3 &&
      policy.minimumHardVetoSupport === "plausible" &&
      policy.minimumActionableReferentStrength === "plausible" &&
      policy.hardVetoMinimumActionableEdges === 2 &&
      policy.softVetoMinimumActionableEdges === 2 &&
      policy.softVetoNarrowDominatedByAtMost === 0 &&
      policy.softVetoNarrowMinimumActionableEdges === 1 &&
      policy.requiresAtLeastOneStrongIntendedEdge &&
      policy.maxCodeHypotheses === MAX_CODE_HYPOTHESES &&
      policy.supersedes.length === 2 &&
      // No tier may read a numeric confidence ever again. Two live runs proved
      // the failure was never a threshold.
      !JSON.stringify(policy.hardVeto).includes("confidence") &&
      !JSON.stringify(policy.softRegenerateOnce).includes("confidence") &&
      // Every tier conjoins BOTH layers. For one fixed sparse reply, a
      // rank-only clause at rank 2 matches 2/24 legal codes, while an
      // evidence-only clause matching at least two of three marked cells
      // matches 4/24. Those are code-match breadths for that constructed
      // reply, not population error-rate floors. Neither layer may reappear
      // alone.
      policy.hardVeto.length === 1 &&
      policy.hardVeto.every((clause) => clause.includes(" AND ")) &&
      policy.softRegenerateOnce.every((clause) => clause.includes(" AND ")) &&
      policy.falsePositiveFloorIsAMinimumNotAProduct.includes(
        "MIN, not a product",
      ) &&
      policy.vetoBreadthControl.includes("all 24 legal triples") &&
      // The frozen blind-inversion record must be untouched by this protocol.
      PROVISIONAL_INVERSION_VETO_POLICY_HASH ===
        "eb2c5141cbf771e4d701bcfbb34644f55f64b4da4cc19ea4d1947558ef7b3c57",
  );
  check(
    checks,
    "failed live boundary keeps runtime enforcement off and immutable policy terminology is corrected adjacently",
    CROSS_ROUND_V03_LIVE_BOUNDARY_2026_08_02.releaseBoundarySatisfied ===
      false &&
      CROSS_ROUND_RUNTIME_ENFORCEMENT_RELEASED === false &&
      CROSS_ROUND_REFERENT_EVIDENCE_POLICY_ERRATA_2026_08_02.status ===
        "erratum" &&
      CROSS_ROUND_REFERENT_EVIDENCE_POLICY_ERRATA_2026_08_02.policyId ===
        CROSS_ROUND_COLUMN_VETO_POLICY_ID &&
      CROSS_ROUND_REFERENT_EVIDENCE_POLICY_ERRATA_2026_08_02.policyHash ===
        contentHash(CROSS_ROUND_REFERENT_EVIDENCE_VETO_POLICY) &&
      !CROSS_ROUND_REFERENT_EVIDENCE_POLICY_ERRATA_2026_08_02.changesPolicySemantics &&
      CROSS_ROUND_REFERENT_EVIDENCE_POLICY_ERRATA_2026_08_02.corrections.combinatorialBreadth.includes(
        "code-match breadth",
      ) &&
      CROSS_ROUND_REFERENT_EVIDENCE_POLICY_ERRATA_2026_08_02.corrections.shapedInput.includes(
        "does not establish safety",
      ),
  );

  // One shared instrument, unlike blind-inversion@0.1 where two different
  // auditors carried one id. The prompt text and task rendering are owned here
  // and hashed, so a pooled statistic is only ever computed over calls that
  // provably ran the same prompt at the same batch size.
  const auditorTask = composeCrossRoundAuditorTask(leakLedger, [
    "blast",
    "orange",
    "ascent",
  ]);
  // The hashed task shape, rendered from placeholders — this plus the system
  // prompt is the entire instrument text, with no incident data in it.
  const genericTask = composeCrossRoundAuditorTask(
    buildPublicClueLedger([
      { clues: ["<a1>", "<a3>", "<a4>"], code: [1, 3, 4] },
      { clues: ["<b1>", "<b3>", "<b4>"], code: [1, 3, 4] },
    ]),
    ["<clue-1>", "<clue-2>", "<clue-3>"],
  );
  // ANTI-OVERFIT. A prompt that names the incidents' own clues, keywords or
  // bridges is fitted to its own regression and proves nothing when it passes.
  // Both incidents' full vocabularies are banned from the instrument text.
  const incidentVocabulary = [
    "aggregate",
    "bengal",
    "firetruck",
    "blast",
    "orange",
    "ascent",
    "quarry",
    "raven",
    "tiger",
    "ladder",
    "pillow",
    "crown",
    "telescope",
    "treetop",
    "turret",
    "nebula",
    "castle",
    "tree",
  ];
  const instrumentText =
    `${CROSS_ROUND_AUDITOR_SYSTEM_PROMPT}\n${genericTask}`.toLowerCase();
  check(
    checks,
    "cross-round auditor prompt is shared, hashed, incident-free, and reveals only public state",
    CROSS_ROUND_AUDITOR_BATCH_SIZE === 3 &&
      CROSS_ROUND_AUDITOR_PROMPT_HASH === EXPECTED_CROSS_ROUND_PROMPT_HASH &&
      incidentVocabulary.every((word) => !instrumentText.includes(word)) &&
      // The two contradictions the retired prompts shipped are gone: the
      // auditor is now told to invent hypotheses, and told that per-edge
      // judgements are independent rather than a ranking.
      CROSS_ROUND_AUDITOR_SYSTEM_PROMPT.includes(
        "Your job is to HYPOTHESISE the hidden words",
      ) &&
      !CROSS_ROUND_AUDITOR_SYSTEM_PROMPT.includes("must not ask for them") &&
      CROSS_ROUND_AUDITOR_SYSTEM_PROMPT.includes(
        "These are INDEPENDENT judgements, not a ranking",
      ) &&
      // The existence form is tautological on every intended edge: both
      // clues really were generated from the same private keyword. The
      // instrument must ask whether that route is publicly FINDABLE.
      CROSS_ROUND_AUDITOR_SYSTEM_PROMPT.includes(
        "what a capable opponent could FIND from the public words",
      ) &&
      CROSS_ROUND_AUDITOR_SYSTEM_PROMPT.includes(
        "that private fact is true of every intended edge and is not evidence",
      ) &&
      // Equal support must be expressible, or the ambiguity layer collapses
      // back into a covert ranking.
      CROSS_ROUND_AUDITOR_SYSTEM_PROMPT.includes(
        "Order does not matter and is not read",
      ) &&
      CROSS_ROUND_AUDITOR_SYSTEM_PROMPT.includes(
        "must carry the SAME support label",
      ) &&
      // Every bridge must quote the exact public clue it runs from.
      CROSS_ROUND_AUDITOR_SYSTEM_PROMPT.includes(
        "copied character for character from the ledger",
      ) &&
      auditorTask.includes('"publicClue"') &&
      auditorTask.includes('"clueIndex": 1') &&
      auditorTask.includes("clueIndex 1, 2, 3 in that order") &&
      auditorTask.includes("cover all four slots exactly") &&
      CROSS_ROUND_AUDITOR_SYSTEM_PROMPT.includes(
        "neither necessary nor sufficient",
      ) &&
      // The empty-slot rule is stated in the task, not only enforced in code.
      auditorTask.includes("Slots with no public clues: 2.") &&
      auditorTask.includes('slot 1: "Aggregate"') &&
      auditorTask.includes("slot 2: (no public clues yet)") &&
      auditorTask.includes('slot 3: "Bengal"') &&
      auditorTask.includes('slot 4: "Firetruck"') &&
      // No secret ever reaches the rendered instrument.
      leak.ownKeywords.every(
        (keyword) =>
          !auditorTask.toLowerCase().includes(keyword.toLowerCase()) &&
          !CROSS_ROUND_AUDITOR_SYSTEM_PROMPT.includes(keyword),
      ) &&
      !auditorTask.includes(JSON.stringify(leak.leakingRound.code)),
  );

  // An empty list used to return `pass`, which quietly turns "no gate ran"
  // into "the gate approved this". Both degenerate shapes now fail closed.
  let combineRejected = 0;
  for (const bad of [
    [] as InversionVetoOutcome[],
    ["approved"] as unknown as InversionVetoOutcome[],
    ["pass", undefined] as unknown as InversionVetoOutcome[],
    null as unknown as InversionVetoOutcome[],
  ]) {
    try {
      combineInversionOutcomes(bad);
    } catch {
      combineRejected += 1;
    }
  }
  check(
    checks,
    "combined disposition takes the strictest gate and fails closed on degenerate input",
    combineInversionOutcomes(["pass", "pass"]) === "pass" &&
      combineInversionOutcomes(["pass", "soft_regenerate_once"]) ===
        "soft_regenerate_once" &&
      combineInversionOutcomes(["soft_regenerate_once", "hard_veto"]) ===
        "hard_veto" &&
      combineInversionOutcomes(["hard_veto", "pass"]) === "hard_veto" &&
      combineInversionOutcomes(["pass"]) === "pass" &&
      combineRejected === 4,
  );

  // ---- Actor feasibility: the history rule must be SATISFIABLE ----
  //
  // 0.2.0's item 4 rejected a candidate when it and an old clue were both
  // valid clues for the same hidden keyword. That is true of every legitimate
  // reuse of a slot — by construction — so it forbade all cluegiving after
  // round 1. A rule an actor cannot satisfy is not a safety rule; it gets
  // ignored, and a policy hash then certifies it as present.
  //
  // The replacement is blind public discoverability, and the property that
  // makes it satisfiable is stated positively: a genuinely different route
  // with no salient public bridge is allowed. These assertions are on the
  // policy TEXT because that is what the actor receives; whether a given model
  // applies it is a behavioural question no offline check can answer.
  check(
    checks,
    "actor history rule is blind, non-tautological, and leaves feasible play",
    // The disqualifier is a publicly findable route...
    CIPHER_ENCRYPT_CANDIDATE_POLICY.includes(
      "hide your keywords and the code",
    ) &&
      CIPHER_ENCRYPT_CANDIDATE_POLICY.includes(
        "readily propose one salient ordinary shared referent or route",
      ) &&
      // ...explicitly NOT the shared private target...
      CIPHER_ENCRYPT_CANDIDATE_POLICY.includes(
        "is NOT by itself a reason to reject",
      ) &&
      CIPHER_ENCRYPT_CANDIDATE_POLICY.includes(
        "true of every clue you will ever write for a number you have clued before",
      ) &&
      // ...and a feasible option is named, so the rule has a satisfying case.
      CIPHER_ENCRYPT_CANDIDATE_POLICY.includes(
        "A genuinely different route to the same keyword, with no salient public bridge to the old clue, is exactly what you are looking for.",
      ) &&
      // Surface-word substitution alone must still fail.
      CIPHER_ENCRYPT_CANDIDATE_POLICY.includes(
        "Changing the surface word while keeping an obvious route does not clear this",
      ) &&
      // The tautological form is banned by name.
      !CIPHER_ENCRYPT_CANDIDATE_POLICY.includes(
        "if both are natural clues for the same hidden",
      ),
  );

  // 7. Role-legal observations under the two team-chat worlds.
  const decoderObservation: DecryptoObservation = {
    observationVersion: "0.1",
    role: "decoder",
    team: "red",
    roundNumber: 3,
    ownKeywords: BASELINE_KEYWORDS.DOpus,
    ownClues: BASELINE_GAME_CLUES.slice(0, 3).map((r) => r.clue),
    opponentClues: BASELINE_GAME_CLUES.slice(3).map((r) => r.clue),
    resolvedRounds: [],
    tokens: {
      own: { intercepts: 0, miscommunications: 0 },
      opponent: { intercepts: 0, miscommunications: 0 },
    },
    teamChatVisibility: "private",
    decisionFocus:
      "Decode your encryptor's three clues into three distinct digits.",
  };
  let decoderLegal = true;
  try {
    assertRoleLegal(decoderObservation);
  } catch {
    decoderLegal = false;
  }
  check(checks, "legal decoder observation passes", decoderLegal);
  let codeLeakCaught = false;
  try {
    assertRoleLegal({ ...decoderObservation, code: [1, 2, 3] });
  } catch {
    codeLeakCaught = true;
  }
  check(checks, "live code on a non-encryptor is rejected", codeLeakCaught);
  let privateChatLeakCaught = false;
  try {
    assertRoleLegal({
      ...decoderObservation,
      transcript: [
        { speaker: "Vesper", channel: "team:opponent", text: "try 2-4-1" },
      ],
    });
  } catch {
    privateChatLeakCaught = true;
  }
  check(
    checks,
    "opponent team chat under private visibility is rejected",
    privateChatLeakCaught,
  );
  let openChatAllowed = true;
  try {
    assertRoleLegal({
      ...decoderObservation,
      teamChatVisibility: "open",
      transcript: [
        { speaker: "Vesper", channel: "team:opponent", text: "try 2-4-1" },
      ],
    });
  } catch {
    openChatAllowed = false;
  }
  check(
    checks,
    "opponent team chat under open visibility is legal",
    openChatAllowed,
  );

  // 8. Model refs and alias epochs.
  check(
    checks,
    "deepseek-v4-flash alias epoch resolves across the 0731 mutation",
    aliasEpochFor("deepseek", "deepseek-v4-flash", "2026-07-30") ===
      "pre-2026-07-31" &&
      aliasEpochFor("deepseek", "deepseek-v4-flash", "2026-08-01") ===
        "2026-07-31" &&
      aliasEpochFor(
        "openrouter",
        "deepseek/deepseek-v4-flash-0731",
        "2026-08-01",
      ) === null,
  );
  check(
    checks,
    "mutable alias without epoch is rejected",
    validateModelRef(
      { provider: "deepseek", model: "deepseek-v4-flash" },
      "2026-08-01",
    ).length > 0 &&
      validateModelRef(
        {
          provider: "deepseek",
          model: "deepseek-v4-flash",
          aliasEpoch: "2026-07-31",
        },
        "2026-08-01",
      ).length === 0,
  );

  // 9. Trace envelopes, including dialogue lineage.
  const trace: TraceEnvelope = {
    traceVersion: "0.1",
    app: "the-table",
    gameId: "20610f90-f0ab-402f-9e2d-a49d32a792ab",
    roundNumber: 3,
    seatId: "seat-dopus",
    team: "red",
    taskKind: "encrypt",
    artifact: { id: sensory.id, contentHash: sensory.contentHash },
    modelRequested: DEEPSEEK_V4_FLASH_CANONICAL,
    modelResolved: {
      servedModel: "deepseek/deepseek-v4-flash-0731",
      upstream: "deepinfra",
      routeAttempt: 1,
    },
    usage: { tokensIn: 1701, tokensOut: 1492 },
    transcriptRef: "game_events:20610f90/chat",
  };
  check(
    checks,
    "well-formed trace validates",
    validateTraceEnvelope(trace).length === 0,
  );
  check(
    checks,
    "trace validation rejects missing model and unknown task",
    validateTraceEnvelope({
      ...trace,
      taskKind: "improvise" as TraceEnvelope["taskKind"],
      modelRequested: { provider: "", model: "" },
    }).length >= 2,
  );
  const dialogueLine = {
    speaker: "player",
    channel: "table" as const,
    text: "nice clue",
  };
  check(
    checks,
    "inline dialogue requires an operator research export stamp",
    validateTraceEnvelope({ ...trace, transcript: [dialogueLine] }).length >
      0 &&
      validateTraceEnvelope({
        ...trace,
        transcript: [dialogueLine],
        exportStamp: {
          mode: "operator_research",
          exportedAt: "2026-08-01",
          approvedBy: "operator",
        },
      }).length === 0,
  );

  // 10. Exact current-engine protocol identity. The fixed source is smaller than
  // the eventual full-game protocol: it covers only the rule and visibility
  // facts needed for decoder/interceptor observations and differential tests.
  const tableIdentities = tableCompetitiveIdentitySet();
  check(
    checks,
    "table-competitive-v1 is immutable, verifiable, and hash-pinned",
    TABLE_COMPETITIVE_V1.id === TABLE_COMPETITIVE_PROTOCOL_ID &&
      verifyCompetitiveProtocol(TABLE_COMPETITIVE_V1) &&
      TABLE_COMPETITIVE_V1.contentHash ===
        EXPECTED_TABLE_COMPETITIVE_PROTOCOL_HASH &&
      Object.isFrozen(TABLE_COMPETITIVE_V1.rules) &&
      mintCompetitiveProtocol(TABLE_COMPETITIVE_V1_SOURCE).contentHash ===
        TABLE_COMPETITIVE_V1.contentHash,
    TABLE_COMPETITIVE_V1.contentHash,
  );
  check(
    checks,
    "table-competitive-v1 freezes rotation, guess gates, terminal order, and chat lanes",
    TABLE_COMPETITIVE_V1.rules.cluegiverRotation.seatRoleOrder.join("|") ===
      "agent_a|agent_b|agent_c" &&
      !TABLE_COMPETITIVE_V1.rules.guessGates.roundOneIntercepts &&
      TABLE_COMPETITIVE_V1.rules.guessGates.bothClueSetsBeforeAnyGuess &&
      TABLE_COMPETITIVE_V1.rules.guessGates.bothInterceptsBeforeAnyOwnDecode &&
      !TABLE_COMPETITIVE_V1.rules.guessGates.activeCluegiverMayDecode &&
      !TABLE_COMPETITIVE_V1.rules.guessGates.activeCluegiverMayIntercept &&
      TABLE_COMPETITIVE_V1.rules.win.terminalCollisionPrecedence.join("|") ===
        "both_intercept_thresholds_draw|both_miscommunication_thresholds_draw|red_intercept_threshold|blue_intercept_threshold|red_miscommunication_threshold_awards_blue|blue_miscommunication_threshold_awards_red|maximum_rounds_tiebreak" &&
      TABLE_COMPETITIVE_V1.visibility.lanes.table.readableBy ===
        "everyone_including_observers" &&
      TABLE_COMPETITIVE_V1.visibility.lanes.teamOpen.readableBy ===
        "everyone_including_observers" &&
      TABLE_COMPETITIVE_V1.visibility.lanes.teamPrivate.readableBy ===
        "own_team_seats_only",
  );
  check(
    checks,
    "table protocol and identity validators reject well-formed foreign values",
    !verifyCompetitiveProtocol({
      ...TABLE_COMPETITIVE_V1,
      rules: {
        ...TABLE_COMPETITIVE_V1.rules,
        cluegiverRotation: {
          ...TABLE_COMPETITIVE_V1.rules.cluegiverRotation,
          seatRoleOrder: ["agent_b", "agent_a", "agent_c"],
        },
      },
    } as unknown as typeof TABLE_COMPETITIVE_V1) &&
      validateTableCompetitiveIdentities({
        ...tableIdentities,
        rules: { ...tableIdentities.rules, contentHash: "0".repeat(64) },
      }).some((problem) => problem.includes("TABLE_COMPETITIVE_V1")),
  );

  // 11. Minimal decoder BotBuild. License and seating claims are deliberately
  // absent until a build-bound evaluation record and trusted issuer exist.
  const conformanceWireConfig = mintWireConfig({
    id: "openrouter-chat-completions@2026-08-02",
    parameters: {
      provider: { order: ["DeepInfra"], allowFallbacks: false },
      reasoning: { effort: "max" },
      responseFormat: "json_object",
      temperature: 0,
      maxTokens: 80_000,
    },
  });
  const botBuildSource: BotBuildManifestSource = {
    manifestVersion: "0.1",
    name: "sensory-anchor-deepseek-decoder",
    version: "0.1.0",
    game: "decrypto",
    scope: "decoder",
    strategyArtifact: {
      id: sensory.id,
      contentHash: sensory.contentHash,
    },
    compilation: {
      strategyCompiler: identityRef("genome-compiler@2.0.0", {
        compilerVersion: COMPILER_VERSION,
      }),
      contextCompiler: identityRef("decrypto-context-compiler@0.2.0", {
        observationVersion: "0.2",
        scope: "decoder",
      }),
      compiledCarrier: {
        id: "compiled-carrier:sensory-anchor@0.1.0",
        contentHash: compiledHash,
      },
    },
    execution: {
      responseParser: identityRef("decrypto-decode-parser@0.1.0", {
        acceptedShape: { guess: "distinct-3-of-4" },
      }),
      actionValidator: identityRef("table-decode-validator@0.1.0", {
        protocol: TABLE_COMPETITIVE_V1.contentHash,
      }),
      providerAdapter: identityRef("openrouter-adapter@0.1.0", {
        transport: "chat-completions",
      }),
      orchestrationPolicy: identityRef("table-orchestrator@0.1.0", {
        unit: "one-logical-action",
      }),
      retryPolicy: identityRef("provider-retry-policy@0.1.0", {
        maximumAttempts: 2,
      }),
      fallbackPolicy: identityRef("provider-fallback-policy@0.1.0", {
        allowFallbacks: false,
      }),
    },
    requestedRoute: {
      provider: "openrouter",
      model: "deepseek/deepseek-v4-flash-0731",
      upstream: "deepinfra",
      aliasEpoch: null,
      reasoning: {
        requestedEffort: "xhigh",
        wireEffort: "max",
      },
      wireConfig: conformanceWireConfig,
    },
    gameplay: tableIdentities,
    provenance: {
      origin: "shared/substrate/conformance.ts",
      mintedAt: "2026-08-02T00:00:00.000Z",
    },
  };
  const botBuild = mintBotBuildManifest(botBuildSource);
  const botBuildIdentity = {
    id: botBuild.id,
    contentHash: botBuild.contentHash,
  };
  check(
    checks,
    "BotBuildManifest binds the exact decoder implementation and route",
    verifyBotBuildManifest(botBuild) &&
      botBuild.scope === "decoder" &&
      botBuild.contentHash === EXPECTED_CONFORMANCE_BOT_BUILD_HASH &&
      botBuild.gameplay.protocol.contentHash ===
        TABLE_COMPETITIVE_V1.contentHash &&
      botBuild.requestedRoute.wireConfig.contentHash ===
        conformanceWireConfig.contentHash &&
      Object.isFrozen(botBuild.execution),
    botBuild.contentHash,
  );
  const botBuildRewrite = mintBotBuildManifest({
    ...botBuildSource,
    requestedRoute: {
      ...botBuildSource.requestedRoute,
      model: "different/model",
    },
  });
  check(
    checks,
    "BotBuild rejects tampering, same-id rewrites, unknown keys, secrets, and foreign gameplay",
    !verifyBotBuildManifest({
      ...botBuild,
      requestedRoute: {
        ...botBuild.requestedRoute,
        model: "tampered/model",
      },
    }) &&
      findBotBuildRegistryConflicts([botBuild, botBuildRewrite]).join("|") ===
        botBuild.id &&
      validateBotBuildManifestSource({
        ...botBuildSource,
        requestedRoute: {
          ...botBuildSource.requestedRoute,
          wireConfig: {
            ...conformanceWireConfig,
            parameters: {
              ...conformanceWireConfig.parameters,
              apiKey: "forbidden",
            },
          },
        },
      }).some((problem) => problem.includes("secret-bearing")) &&
      validateBotBuildManifestSource({
        ...botBuildSource,
        license: "not part of this contract",
      } as unknown as BotBuildManifestSource).some((problem) =>
        problem.includes('unknown field "license"'),
      ) &&
      validateBotBuildManifestSource({
        ...botBuildSource,
        gameplay: {
          ...botBuildSource.gameplay,
          visibility: {
            ...botBuildSource.gameplay.visibility,
            contentHash: "0".repeat(64),
          },
        },
      }).some((problem) => problem.includes("TABLE_COMPETITIVE_V1")),
  );

  // 12. Complete live decision observations. Round 2 must carry all of round
  // 1, and live token counts must agree with that history and remain below
  // the engine's terminal thresholds.
  const resolvedRoundOne = {
    roundNumber: 1,
    own: {
      clues: ["kiln", "gale", "raptor"] as [string, string, string],
      code: [1, 3, 4] as [number, number, number],
      ownDecode: [1, 3, 4] as [number, number, number],
      intercept: null,
      decodedCorrectly: true,
      wasIntercepted: null,
    },
    opponent: {
      clues: ["stone", "ember", "height"] as [string, string, string],
      code: [2, 4, 1] as [number, number, number],
      ownDecode: [2, 4, 1] as [number, number, number],
      intercept: null,
      decodedCorrectly: true,
      wasIntercepted: null,
    },
  };
  const observationV2Source: DecryptoObservationV2Source = {
    observationVersion: "0.2",
    decisionId: "decision:game-1:round-2:red:decode:1",
    logicalActionKey: "game-1/round-2/red/own-decode",
    gameId: "game-1",
    roundNumber: 2,
    actor: {
      actorId: "bot:red:agent-c",
      seatId: "seat-red-c",
      team: "red",
      role: "decoder",
    },
    activeCluegiverSeatId: "seat-red-b",
    identities: {
      botBuild: botBuildIdentity,
      ...tableIdentities,
    },
    role: "decoder",
    team: "red",
    ownKeywords: [...BASELINE_KEYWORDS.DOpus] as [
      string,
      string,
      string,
      string,
    ],
    ownClues: ["ember", "canopy", "orbit"],
    opponentClues: ["river", "forge", "summit"],
    resolvedRounds: [resolvedRoundOne],
    tokens: {
      own: { intercepts: 0, miscommunications: 0 },
      opponent: { intercepts: 0, miscommunications: 0 },
    },
    teamChatVisibility: "private",
    decisionFocus: "Lock the own-team decode after both intercepts.",
    transcript: [
      {
        eventId: "event-table-1",
        speakerActorId: "human:blue:a",
        lane: "table",
        text: "Good luck.",
      },
      {
        eventId: "event-team-1",
        speakerActorId: "human:red:c",
        lane: "team:own",
        text: "I think the second clue belongs to slot 2.",
      },
    ],
  };
  const observationV2 = mintObservationV2(observationV2Source);
  check(
    checks,
    "Observation v0.2 is deterministic, immutable, complete, and role-legal",
    verifyObservationV2(observationV2) &&
      observationV2.contentHash === EXPECTED_CONFORMANCE_OBSERVATION_V2_HASH &&
      Object.isFrozen(observationV2.actor) &&
      Object.isFrozen(observationV2.resolvedRounds[0]?.own) &&
      Object.isFrozen(observationV2.transcript[0]),
    observationV2.contentHash,
  );

  const validInterceptor = {
    ...observationV2Source,
    decisionId: "decision:game-1:round-2:red:intercept:1",
    logicalActionKey: "game-1/round-2/blue/intercept",
    actor: {
      ...observationV2Source.actor,
      role: "interceptor" as const,
    },
    role: "interceptor" as const,
    ownKeywords: null,
    decisionFocus: "Lock the intercept of Blue's clue set.",
  };
  check(
    checks,
    "Observation v0.2 accepts a round-2 interceptor with both clue sets and no keywords",
    validateObservationV2(validInterceptor).length === 0,
  );

  const adversarialObservationProblems = [
    validateObservationV2({
      ...validInterceptor,
      roundNumber: 1,
      resolvedRounds: [],
    }).some((problem) => problem.includes("round 1")),
    validateObservationV2({
      ...observationV2Source,
      actor: {
        ...observationV2Source.actor,
        seatId: observationV2Source.activeCluegiverSeatId,
      },
    }).some((problem) => problem.includes("own-team active cluegiver")),
    validateObservationV2({
      ...observationV2Source,
      ownClues: null,
    } as unknown as DecryptoObservationV2Source).some((problem) =>
      problem.includes("ownClues"),
    ),
    validateObservationV2({
      ...validInterceptor,
      opponentClues: [],
    } as unknown as DecryptoObservationV2Source).some((problem) =>
      problem.includes("opponentClues"),
    ),
    validateObservationV2({
      ...observationV2Source,
      identities: {
        ...observationV2Source.identities,
        protocol: {
          ...observationV2Source.identities.protocol,
          contentHash: "0".repeat(64),
        },
      },
    }).some((problem) => problem.includes("identities.protocol")),
    validateObservationV2({
      ...observationV2Source,
      identities: {
        ...observationV2Source.identities,
        visibility: {
          ...observationV2Source.identities.visibility,
          contentHash: "1".repeat(64),
        },
      },
    }).some((problem) => problem.includes("identities.visibility")),
    validateObservationV2({
      ...observationV2Source,
      identities: {
        ...observationV2Source.identities,
        rules: {
          ...observationV2Source.identities.rules,
          contentHash: "2".repeat(64),
        },
      },
    }).some((problem) => problem.includes("identities.rules")),
    validateObservationV2({
      ...observationV2Source,
      roundNumber: 3,
    }).some((problem) => problem.includes("completely cover")),
    validateObservationV2({
      ...observationV2Source,
      resolvedRounds: [
        {
          ...resolvedRoundOne,
          own: { ...resolvedRoundOne.own, code: null },
        },
      ],
    } as unknown as DecryptoObservationV2Source).some((problem) =>
      problem.includes("round 1.own.code"),
    ),
    validateObservationV2({
      ...observationV2Source,
      tokens: {
        ...observationV2Source.tokens,
        own: { intercepts: 2, miscommunications: 0 },
      },
    }).some((problem) => problem.includes("terminal threshold")),
  ];
  check(
    checks,
    "Observation v0.2 closes all ten current-engine adversarial gates",
    adversarialObservationProblems.length === 10 &&
      adversarialObservationProblems.every(Boolean),
    JSON.stringify(adversarialObservationProblems),
  );

  const openOpponentLine = {
    eventId: "event-opponent-team-1",
    speakerActorId: "human:blue:b",
    lane: "team:opponent:open" as const,
    text: "We think it is 2-4-1.",
  };
  check(
    checks,
    "Observation v0.2 projects open/private Team lanes and rejects extra secret shapes",
    validateObservationV2({
      ...observationV2Source,
      transcript: [...observationV2Source.transcript, openOpponentLine],
    }).some((problem) => problem.includes("requires open chat")) &&
      validateObservationV2({
        ...observationV2Source,
        teamChatVisibility: "open",
        transcript: [...observationV2Source.transcript, openOpponentLine],
      }).length === 0 &&
      validateObservationV2({
        ...observationV2Source,
        opponentKeywords: ["must", "never", "enter", "context"],
      } as unknown as DecryptoObservationV2Source).some((problem) =>
        problem.includes('unknown field "opponentKeywords"'),
      ),
  );
  check(
    checks,
    "Observation v0.1 remains legal through the additive dispatcher",
    (() => {
      try {
        assertRoleLegal(decoderObservation);
        return true;
      } catch {
        return false;
      }
    })(),
  );

  // 13. One successful decoder attempt with evidence that maps directly to
  // ai_calls plus authoritative game events. Request JSON is not replaced by
  // a weaker prompt-only hash; prompt content remains inside that exact value.
  const parsedDecodeAction = {
    kind: "guess" as const,
    role: "decode" as const,
    guess: [1, 3, 4] as [number, number, number],
  };
  const actionEvent = {
    ...identityRef("event:cipher-decode-submitted:42", {
      sequence: 42,
      guess: parsedDecodeAction.guess,
    }),
    sequence: 42,
  };
  const outcomeEvent = {
    ...identityRef("event:cipher-round-resolved:44", {
      sequence: 44,
      roundNumber: 2,
    }),
    sequence: 44,
  };
  const traceV2Source: TraceEnvelopeV2Source = {
    traceVersion: "0.2",
    app: "the-table",
    gameId: observationV2.gameId,
    roundNumber: observationV2.roundNumber,
    decisionId: observationV2.decisionId,
    attemptId: "ai-call:game-1:round-2:red:decode:1",
    logicalActionKey: observationV2.logicalActionKey,
    actor: { ...observationV2.actor, role: "decoder" },
    role: "decoder",
    taskKind: "decode",
    identities: observationV2.identities,
    inputs: {
      observation: {
        contentHash: observationV2.contentHash,
        blobRef: "observations/game-1/red-decode-1.json",
        classification: "team_private",
      },
      requestJson: {
        contentHash: contentHash({
          model: "deepseek/deepseek-v4-flash-0731",
          messages: [{ role: "user", content: "exact rendered context" }],
        }),
        blobRef: "ai-calls/game-1/request-1.json",
        classification: "operator",
      },
    },
    outputs: {
      responseText: {
        contentHash: contentHash('{"rationale":"x","guess":[1,3,4]}'),
        blobRef: "ai-calls/game-1/response-1.txt",
        classification: "operator",
      },
      responseMeta: {
        contentHash: contentHash({
          servedModel: "deepseek/deepseek-v4-flash-0731",
          upstream: "DeepInfra",
          routeAttempt: 1,
        }),
        blobRef: "ai-calls/game-1/response-meta-1.json",
        classification: "operator",
      },
    },
    provider: {
      requested: botBuild.requestedRoute,
      servedModel: "deepseek/deepseek-v4-flash-0731",
      upstream: "DeepInfra",
      routeAttempt: 1,
      status: "succeeded",
      failureStage: null,
    },
    parsedAction: {
      action: parsedDecodeAction,
      contentHash: contentHash(parsedDecodeAction),
    },
    validation: {
      status: "accepted",
      validator: botBuild.execution.actionValidator,
      problems: [],
    },
    application: {
      applied: true,
      logicalActionKey: observationV2.logicalActionKey,
      parsedActionHash: contentHash(parsedDecodeAction),
      actionEvent,
    },
    outcome: {
      status: "resolved",
      outcomeEvent,
    },
    telemetry: {
      recordedAt: "2026-08-02T00:01:04.000Z",
      latencyMs: 4_000,
      usage: {
        tokensIn: 2_000,
        tokensOut: 500,
      },
    },
  };
  const traceV2 = mintTraceEnvelopeV2(traceV2Source);
  check(
    checks,
    "Trace v0.2 binds persisted request/response evidence and application truth",
    verifyTraceEnvelopeV2(traceV2) &&
      traceV2.contentHash === EXPECTED_CONFORMANCE_TRACE_V2_HASH &&
      traceV2.inputs.observation.contentHash === observationV2.contentHash &&
      traceV2.inputs.requestJson !== null &&
      traceV2.application.actionEvent?.sequence === 42 &&
      traceV2.outcome.outcomeEvent?.sequence === 44 &&
      Object.isFrozen(traceV2.provider) &&
      Object.isFrozen(traceV2.parsedAction?.action),
    traceV2.contentHash,
  );

  const failedProviderTrace: TraceEnvelopeV2Source = {
    ...traceV2Source,
    attemptId: "ai-call:game-1:round-2:red:decode:failed",
    inputs: {
      ...traceV2Source.inputs,
      requestJson: null,
    },
    outputs: {
      responseText: null,
      responseMeta: null,
    },
    provider: {
      ...traceV2Source.provider,
      servedModel: null,
      upstream: null,
      routeAttempt: null,
      status: "failed",
      failureStage: "provider",
    },
    parsedAction: null,
    validation: {
      ...traceV2Source.validation,
      status: "not_run",
    },
    application: {
      applied: false,
      logicalActionKey: traceV2Source.logicalActionKey,
      parsedActionHash: null,
      actionEvent: null,
    },
    outcome: {
      status: "pending",
      outcomeEvent: null,
    },
    telemetry: {
      ...traceV2Source.telemetry,
      usage: { tokensIn: null, tokensOut: null },
    },
  };
  check(
    checks,
    "Trace v0.2 retains truthful provider failures without invented evidence",
    validateTraceEnvelopeV2(failedProviderTrace).length === 0,
  );
  check(
    checks,
    "Trace v0.2 rejects weak evidence classification, URL refs, and incoherent application",
    validateTraceEnvelopeV2({
      ...traceV2Source,
      inputs: {
        ...traceV2Source.inputs,
        requestJson: {
          ...traceV2Source.inputs.requestJson!,
          classification: "team_private",
        },
      },
    }).some((problem) => problem.includes("classification must be operator")) &&
      validateTraceEnvelopeV2({
        ...traceV2Source,
        outputs: {
          ...traceV2Source.outputs,
          responseText: {
            ...traceV2Source.outputs.responseText!,
            blobRef: "https://example.invalid/response?token=x",
          },
        },
      }).some((problem) => problem.includes("opaque store key")) &&
      validateTraceEnvelopeV2({
        ...traceV2Source,
        application: {
          ...traceV2Source.application,
          parsedActionHash: "0".repeat(64),
        },
      }).some((problem) => problem.includes("accepted parsed action hash")),
  );

  const chainMismatchChecks = [
    validateDecisionChain(
      observationV2,
      mintTraceEnvelopeV2({
        ...traceV2Source,
        inputs: {
          ...traceV2Source.inputs,
          observation: {
            ...traceV2Source.inputs.observation,
            contentHash: "0".repeat(64),
          },
        },
      }),
    ).some((problem) => problem.includes("observation hash")),
    validateDecisionChain(
      observationV2,
      mintTraceEnvelopeV2({ ...traceV2Source, roundNumber: 3 }),
    ).some((problem) => problem.includes("roundNumber mismatch")),
    validateDecisionChain(
      observationV2,
      mintTraceEnvelopeV2({
        ...traceV2Source,
        decisionId: "different-decision",
      }),
    ).some((problem) => problem.includes("decisionId mismatch")),
    validateDecisionChain(
      observationV2,
      mintTraceEnvelopeV2({
        ...traceV2Source,
        logicalActionKey: "different-logical-action",
        application: {
          ...traceV2Source.application,
          logicalActionKey: "different-logical-action",
        },
      }),
    ).some((problem) => problem.includes("logicalActionKey mismatch")),
    validateDecisionChain(
      observationV2,
      mintTraceEnvelopeV2({
        ...traceV2Source,
        actor: { ...traceV2Source.actor, actorId: "different-actor" },
      }),
    ).some((problem) => problem.includes("actor.actorId mismatch")),
    validateDecisionChain(observationV2, {
      ...traceV2,
      role: "interceptor",
    } as unknown as typeof traceV2).some((problem) =>
      problem.includes("role mismatch"),
    ),
    validateDecisionChain(
      observationV2,
      mintTraceEnvelopeV2({
        ...traceV2Source,
        identities: {
          ...traceV2Source.identities,
          botBuild: {
            ...traceV2Source.identities.botBuild,
            contentHash: "3".repeat(64),
          },
        },
      }),
    ).some((problem) => problem.includes("identities.botBuild mismatch")),
    validateDecisionChain(observationV2, {
      ...traceV2,
      taskKind: "intercept",
    } as unknown as typeof traceV2).some((problem) =>
      problem.includes("task mismatch"),
    ),
    validateDecisionChain(observationV2, {
      ...traceV2,
      application: {
        ...traceV2.application,
        logicalActionKey: "different-application",
      },
    }).some((problem) => problem.includes("application mismatch")),
  ];
  check(
    checks,
    "validateDecisionChain rejects all nine observation/trace mismatch mutations",
    chainMismatchChecks.length === 9 && chainMismatchChecks.every(Boolean),
    JSON.stringify(chainMismatchChecks),
  );
  check(
    checks,
    "validateDecisionChain accepts the exact observation and trace",
    validateDecisionChain(observationV2, traceV2).length === 0,
  );
  check(
    checks,
    "Trace v0.1 remains valid through the additive dispatcher",
    validateTraceEnvelope(trace).length === 0,
  );

  return {
    passed: checks.every((c) => c.ok),
    checks,
    hashes: {
      sensoryAnchorContentHash: sensory.contentHash,
      sensoryAnchorCompiledHash: compiledHash,
      intermediateHopsContentHash: hops.contentHash,
      tableCompetitiveProtocolHash: TABLE_COMPETITIVE_V1.contentHash,
      conformanceBotBuildHash: botBuild.contentHash,
      conformanceObservationV2Hash: observationV2.contentHash,
      conformanceTraceV2Hash: traceV2.contentHash,
    },
  };
}
