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
  EXPECTED_HASHES,
  INTERMEDIATE_HOPS_SOURCE,
  SENSORY_ANCHOR_SOURCE,
} from "./fixtures";
import { DEEPSEEK_V4_FLASH_CANONICAL, aliasEpochFor, validateModelRef } from "./modelRef";
import { assertRoleLegal, type DecryptoObservation } from "./observation";
import { validateTraceEnvelope, type TraceEnvelope } from "./trace";

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

export function runConformance(): ConformanceReport {
  const checks: ConformanceCheck[] = [];

  // 1. Artifact minting: deterministic, verifiable, tamper-evident.
  const sensory = mintStrategyArtifact(SENSORY_ANCHOR_SOURCE);
  const sensoryAgain = mintStrategyArtifact(SENSORY_ANCHOR_SOURCE);
  const hops = mintStrategyArtifact(INTERMEDIATE_HOPS_SOURCE);
  check(checks, "mint is deterministic", sensory.contentHash === sensoryAgain.contentHash);
  check(checks, "artifact id is name@version", sensory.id === "sensory-anchor@0.1.0");
  check(checks, "minted artifact verifies", verifyStrategyArtifact(sensory));
  const tampered = {
    ...sensory,
    genome: { ...sensory.genome, riskTolerance: "maximum recklessness" },
  };
  check(checks, "tampered artifact fails verification", !verifyStrategyArtifact(tampered));
  const rewrittenSameId = mintStrategyArtifact({
    ...SENSORY_ANCHOR_SOURCE,
    genome: { ...SENSORY_ANCHOR_SOURCE.genome, riskTolerance: "rewritten under the same id" },
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
      cluegiver.taskDirectives.includes("Generate one clue each for smell, sound, and texture."),
  );
  check(
    checks,
    "coach prompt includes character count summary",
    compiled.compiled.prompts.coach.systemPrompt.includes("### Character Count Summary"),
  );

  // 3. Promotion gate: typed immutable evaluation records, not pointer lists.
  const evaluationSource: EvaluationRecordSource = {
    recordVersion: "0.1",
    artifact: { id: sensory.id, contentHash: sensory.contentHash },
    compilerVersion: COMPILER_VERSION,
    modelRoute: DEEPSEEK_V4_FLASH_CANONICAL,
    candidatePolicy: {
      description: "generate 3 candidates per digit; blind-inversion self-check at 0.6; pick lowest-transparency decodable candidate",
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
    scope: "cipher-relay, phrase rules, vs seed opposition; not a family-play guarantee",
    evaluatedAt: "2026-08-01",
    runRef: "example-run-0",
  };
  const record = mintEvaluationRecord(evaluationSource);
  check(checks, "evaluation record mints and verifies", verifyEvaluationRecord(record));
  check(
    checks,
    "doctored evaluation record fails verification",
    !verifyEvaluationRecord({ ...record, verdict: "pass", metrics: { transparencyFlagged: 6 } }),
  );
  const gateNoRecords = evaluateSeating(sensory, [], { allowUnvalidated: false });
  const gateExplicit = evaluateSeating(sensory, [], { allowUnvalidated: true });
  const gateLicensed = evaluateSeating(sensory, [record], { allowUnvalidated: false });
  const gateWrongProtocol = evaluateSeating(sensory, [record], {
    allowUnvalidated: false,
    requiredProtocol: "family-play-rc",
  });
  const failedRecord = mintEvaluationRecord({ ...evaluationSource, verdict: "fail" });
  const gateFailedVerdict = evaluateSeating(sensory, [failedRecord], { allowUnvalidated: false });
  const gateWrongArtifact = evaluateSeating(hops, [record], { allowUnvalidated: false });
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
    !gateWrongProtocol.validated && !gateFailedVerdict.validated && !gateWrongArtifact.validated,
  );

  // 4. Action validation.
  check(checks, "valid guess passes", validateCodeGuess([3, 1, 4]).length === 0);
  check(
    checks,
    "guess validation rejects repeats and range",
    validateCodeGuess([1, 1, 2]).length > 0 && validateCodeGuess([0, 2, 3]).length > 0,
  );
  const clueContext = {
    ownKeywords: ["FACTORY", "WINDMILL", "FALCON", "JASMINE"] as [string, string, string, string],
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
    validateClue("night sky harvest", clueContext, TABLE_CLUE_RULES).length === 0 &&
      validateClue("night sky harvest", clueContext, HERPETARIUM_CLUE_RULES).length > 0,
  );

  // 5. Baseline game: every definition clue is RULE-legal (legality is not
  // safety — the inversion evaluator, not the validator, must catch these).
  const baselineAllLegal = BASELINE_GAME_CLUES.every((record_) => {
    const keywords = BASELINE_KEYWORDS[record_.encryptorSeat];
    return (
      validateClue(record_.clue, { ownKeywords: keywords, previousOwnClues: [] }, TABLE_CLUE_RULES)
        .length === 0
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
  check(checks, "baseline clue submission passes as a set", submissionProblems.length === 0);

  // 6. Inversion probe (live probe, not a validated benchmark): recorded
  // consistently — six results covering the six baseline clues, every
  // reconstruction at or above the provisional flag threshold.
  const probeCluesMatch =
    BASELINE_INVERSION_PROBE.results.length === BASELINE_GAME_CLUES.length &&
    BASELINE_GAME_CLUES.every((r) =>
      BASELINE_INVERSION_PROBE.results.some((p) => p.clue === r.clue),
    );
  check(checks, "inversion probe covers exactly the baseline clues", probeCluesMatch);
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
    validateModelRef(BASELINE_INVERSION_PROBE.modelRoute, BASELINE_INVERSION_PROBE.probedAt)
      .length === 0 && BASELINE_INVERSION_PROBE.status === "live_probe",
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
    decisionFocus: "Decode your encryptor's three clues into three distinct digits.",
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
      transcript: [{ speaker: "Vesper", channel: "team:opponent", text: "try 2-4-1" }],
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
      transcript: [{ speaker: "Vesper", channel: "team:opponent", text: "try 2-4-1" }],
    });
  } catch {
    openChatAllowed = false;
  }
  check(checks, "opponent team chat under open visibility is legal", openChatAllowed);

  // 8. Model refs and alias epochs.
  check(
    checks,
    "deepseek-v4-flash alias epoch resolves across the 0731 mutation",
    aliasEpochFor("deepseek", "deepseek-v4-flash", "2026-07-30") === "pre-2026-07-31" &&
      aliasEpochFor("deepseek", "deepseek-v4-flash", "2026-08-01") === "2026-07-31" &&
      aliasEpochFor("openrouter", "deepseek/deepseek-v4-flash-0731", "2026-08-01") === null,
  );
  check(
    checks,
    "mutable alias without epoch is rejected",
    validateModelRef({ provider: "deepseek", model: "deepseek-v4-flash" }, "2026-08-01").length >
      0 &&
      validateModelRef(
        { provider: "deepseek", model: "deepseek-v4-flash", aliasEpoch: "2026-07-31" },
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
  check(checks, "well-formed trace validates", validateTraceEnvelope(trace).length === 0);
  check(
    checks,
    "trace validation rejects missing model and unknown task",
    validateTraceEnvelope({
      ...trace,
      taskKind: "improvise" as TraceEnvelope["taskKind"],
      modelRequested: { provider: "", model: "" },
    }).length >= 2,
  );
  const dialogueLine = { speaker: "player", channel: "table" as const, text: "nice clue" };
  check(
    checks,
    "inline dialogue requires an operator research export stamp",
    validateTraceEnvelope({ ...trace, transcript: [dialogueLine] }).length > 0 &&
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

  return {
    passed: checks.every((c) => c.ok),
    checks,
    hashes: {
      sensoryAnchorContentHash: sensory.contentHash,
      sensoryAnchorCompiledHash: compiledHash,
      intermediateHopsContentHash: hops.contentHash,
    },
  };
}
