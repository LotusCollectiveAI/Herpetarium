/**
 * Golden fixtures: the first named artifacts, the production baseline game,
 * and the expected hashes that prove both vendored copies of the substrate
 * compile identically. EXPECTED_* constants are regenerated only by an
 * intentional substrate version bump (run the conformance script with
 * --emit-hashes and update BOTH repos in the same change).
 */
import type { StrategyArtifactSource } from "./artifact";
import type { ModelRef } from "./modelRef";

/**
 * First named artifacts, minted verbatim from Herpetarium's P4-D seed
 * genomes (server/coachLoop.ts SEED_GENOME_TEMPLATES #2 and #1). They are
 * UNVALIDATED seeds — provenance.evalRefs is empty on purpose. They exist
 * so The Table can seat a genuine Herpetarium strategy object today and so
 * the eval pipeline has named subjects to measure first.
 */
export const SENSORY_ANCHOR_SOURCE: StrategyArtifactSource = {
  name: "sensory-anchor",
  version: "0.1.0",
  game: "decrypto",
  genome: {
    cluePhilosophy:
      "Clue using physical sensory experience. Prioritize texture, sound, and smell over visual. For 'forest', say 'pine' (smell) or 'crunch' (leaves underfoot). Sensory clues are distinctive and hard to intercept because they depend on experiential context.",
    opponentModeling:
      "Opponents default to semantic/category reasoning. Sensory clues exploit a blind spot: they require imagining the physical experience of the keyword, which is harder to reverse-engineer from clue alone.",
    riskTolerance:
      "Medium-high risk. Sensory associations can be ambiguous (many things 'crunch'), so accept some decode uncertainty in exchange for strong interception resistance.",
    memoryPolicy:
      "Note which sensory modalities (smell, sound, texture, taste, temperature) you have used. Rotate modalities across rounds to prevent opponents from building a sensory-pattern model.",
    executionGuidance:
      "For each keyword, imagine physically encountering it. What sensation stands out first? Generate one clue each for smell, sound, and texture. Pick the most distinctive and least ambiguous.",
    deliberationScaffold:
      "Address interception risk explicitly for each clue. Build a hypothesis table: for each opponent keyword, could this sensory clue plausibly point there? If yes, flag the risk and consider alternatives.",
  },
  provenance: {
    origin: "Herpetarium server/coachLoop.ts SEED_GENOME_TEMPLATES[1] (P4-D, 2026-04-03)",
    method: "seed",
    mintedAt: "2026-08-01",
    evalRefs: [],
    notes:
      "Unvalidated seed strategy. Behavioral effect not yet measured; see docs/DECRYPTO_TRANSFER_DIAGNOSTIC_2026-08-01.md section 3.",
  },
};

export const INTERMEDIATE_HOPS_SOURCE: StrategyArtifactSource = {
  name: "intermediate-hops",
  version: "0.1.0",
  game: "decrypto",
  genome: {
    cluePhilosophy:
      "Connect through intermediate concepts. Never use direct synonyms. For 'ocean', say 'horizon' or 'salt', not 'water'. Find a concept one hop away that your team can trace back but opponents cannot shortcut.",
    opponentModeling:
      "Assume opponents will catch any first-order synonym. Your clue must require at least one inferential step that depends on knowing YOUR keywords, not just the clue word.",
    riskTolerance:
      "Moderate risk. Prefer clues your team can reliably trace (>70% decode) even if they leak some information. Avoid clues that are so indirect they confuse teammates.",
    memoryPolicy:
      "Track which intermediate links have been intercepted. If opponents cracked a hop-path before, avoid that association family in future rounds. Reuse successful hop-paths with teammates.",
    executionGuidance:
      "Mentally list 3 candidate intermediate concepts for each keyword. For each candidate, evaluate: (a) can my teammates trace it back in one step? (b) does it also point to a trap word? Choose the candidate with highest clarity and lowest leakage.",
    deliberationScaffold:
      "State your confidence level (high/medium/low) for each clue-keyword mapping. Explain the association chain: clue -> intermediate concept -> keyword. If multiple interpretations exist, list each chain and pick the most probable.",
  },
  provenance: {
    origin: "Herpetarium server/coachLoop.ts SEED_GENOME_TEMPLATES[0] (P4-D, 2026-04-03)",
    method: "seed",
    mintedAt: "2026-08-01",
    evalRefs: [],
    notes:
      "Unvalidated seed strategy. Its executionGuidance is the candidate-clue comparison loop the 2026-07-27 game-night bots lacked.",
  },
};

/**
 * Baseline reference: production game 20610f90-f0ab-402f-9e2d-a49d32a792ab
 * (The Table, completed 2026-07/08; founder report + browser inspection,
 * 2026-08-01). Round 3, both bot encryptors produced definition-shaped
 * clues; all six were intercepted immediately. Bot-authored content only —
 * no human chat is preserved here by policy.
 *
 * Every clue below is RULE-LEGAL under TABLE_CLUE_RULES (conformance
 * asserts this): the hard-rule lattice cannot catch transparency. A future
 * semantic transparency evaluator must flag all six (expectTransparent).
 */
export interface BaselineClueRecord {
  encryptorSeat: string;
  clue: string;
  targetKeyword: string;
  interceptedImmediately: boolean;
  expectTransparent: true;
}

export const BASELINE_GAME_ID = "20610f90-f0ab-402f-9e2d-a49d32a792ab";
export const BASELINE_GAME_ROUND = 3;

export const BASELINE_GAME_CLUES: BaselineClueRecord[] = [
  {
    encryptorSeat: "DOpus",
    clue: "Conveyor belts and punch clocks",
    targetKeyword: "FACTORY",
    interceptedImmediately: true,
    expectTransparent: true,
  },
  {
    encryptorSeat: "DOpus",
    clue: "Classic mini-golf obstacle",
    targetKeyword: "WINDMILL",
    interceptedImmediately: true,
    expectTransparent: true,
  },
  {
    encryptorSeat: "DOpus",
    clue: "Atlanta's pro football squad",
    targetKeyword: "FALCON",
    interceptedImmediately: true,
    expectTransparent: true,
  },
  {
    encryptorSeat: "BackHoleSol",
    clue: "Pack hunter that howls at the full moon",
    targetKeyword: "WOLF",
    interceptedImmediately: true,
    expectTransparent: true,
  },
  {
    encryptorSeat: "BackHoleSol",
    clue: "Rolled out in red for celebrities at premieres",
    targetKeyword: "CARPET",
    interceptedImmediately: true,
    expectTransparent: true,
  },
  {
    encryptorSeat: "BackHoleSol",
    clue: "Ocean giant that swallowed Jonah",
    targetKeyword: "WHALE",
    interceptedImmediately: true,
    expectTransparent: true,
  },
];

/** Keyword sets reconstructed from the round-3 reveal (completed game). */
export const BASELINE_KEYWORDS: Record<string, [string, string, string, string]> = {
  DOpus: ["FACTORY", "WINDMILL", "FALCON", "JASMINE"],
  BackHoleSol: ["WOLF", "CARPET", "WHALE", "LANTERN"],
};

/**
 * Live probe (2026-08-01) — NOT a validated benchmark. A blind
 * target-inversion auditor (sees the six clues only, never the keywords or
 * targets; max reasoning; fallbacks disabled) reconstructed all six pilot
 * concepts. This is direct evidence the inversion stage catches the
 * production failure mode and is cheap enough to run per clue submission
 * at play time (220+779 tokens, $0.000155, 4.8s for the full set).
 *
 * Provisional flag threshold 0.60 = the minimum confidence observed on
 * known-transparent clues. The false-positive rate on GOOD clues is
 * uncalibrated — that calibration is exactly what turns this probe into
 * the versioned `blind-inversion` evaluation protocol.
 */
export interface InversionProbeClueResult {
  clue: string;
  reconstructedAs: string;
  confidence: number;
  matchesTarget: boolean;
}

export const BASELINE_INVERSION_PROBE = {
  status: "live_probe",
  probedAt: "2026-08-01",
  method:
    "blind target inversion: auditor receives the six clues with no keywords/targets and names each clue's referent with a confidence",
  modelRoute: {
    provider: "openrouter",
    model: "deepseek/deepseek-v4-flash-0731",
    upstream: "deepinfra",
    reasoningEffort: "max",
  } satisfies ModelRef,
  fallbacksDisabled: true,
  results: [
    { clue: "Conveyor belts and punch clocks", reconstructedAs: "factory", confidence: 0.6, matchesTarget: true },
    { clue: "Classic mini-golf obstacle", reconstructedAs: "windmill", confidence: 0.7, matchesTarget: true },
    { clue: "Atlanta's pro football squad", reconstructedAs: "Falcons", confidence: 0.95, matchesTarget: true },
    { clue: "Pack hunter that howls at the full moon", reconstructedAs: "wolf", confidence: 0.98, matchesTarget: true },
    { clue: "Rolled out in red for celebrities at premieres", reconstructedAs: "red carpet", confidence: 0.99, matchesTarget: true },
    { clue: "Ocean giant that swallowed Jonah", reconstructedAs: "whale", confidence: 0.99, matchesTarget: true },
  ] as InversionProbeClueResult[],
  usage: { tokensIn: 220, tokensOut: 779, costUsd: 0.000155, latencyMs: 4800 },
  provisionalFlagThreshold: 0.6,
} as const;

/**
 * Expected hashes for the golden artifacts under this substrate version.
 * Regenerate with `--emit-hashes` on an intentional version bump only.
 */
export const EXPECTED_HASHES = {
  sensoryAnchorContentHash:
    "274364bb6f5066686a81a9ee4bfd6e6b00de04290630b2c8d3214e0b3531e09d",
  sensoryAnchorCompiledHash:
    "0403291a15f5959581e6e3f288a02f70429489aa17feffc0a1fc32f814645a2e",
  intermediateHopsContentHash:
    "6aacc103d362665edd1d9111268c1575b40eff387dcf385dbe936a453bfb7ccb",
} as const;
