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
    origin:
      "Herpetarium server/coachLoop.ts SEED_GENOME_TEMPLATES[1] (P4-D, 2026-04-03)",
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
    origin:
      "Herpetarium server/coachLoop.ts SEED_GENOME_TEMPLATES[0] (P4-D, 2026-04-03)",
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
export const BASELINE_KEYWORDS: Record<
  string,
  [string, string, string, string]
> = {
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
 * known-transparent clues. Population error behavior on defensible held-out
 * clues is uncalibrated — that calibration is exactly what turns this probe
 * into the versioned `blind-inversion` evaluation protocol.
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
    {
      clue: "Conveyor belts and punch clocks",
      reconstructedAs: "factory",
      confidence: 0.6,
      matchesTarget: true,
    },
    {
      clue: "Classic mini-golf obstacle",
      reconstructedAs: "windmill",
      confidence: 0.7,
      matchesTarget: true,
    },
    {
      clue: "Atlanta's pro football squad",
      reconstructedAs: "Falcons",
      confidence: 0.95,
      matchesTarget: true,
    },
    {
      clue: "Pack hunter that howls at the full moon",
      reconstructedAs: "wolf",
      confidence: 0.98,
      matchesTarget: true,
    },
    {
      clue: "Rolled out in red for celebrities at premieres",
      reconstructedAs: "red carpet",
      confidence: 0.99,
      matchesTarget: true,
    },
    {
      clue: "Ocean giant that swallowed Jonah",
      reconstructedAs: "whale",
      confidence: 0.99,
      matchesTarget: true,
    },
  ] as InversionProbeClueResult[],
  usage: { tokensIn: 220, tokensOut: 779, costUsd: 0.000155, latencyMs: 4800 },
  provisionalFlagThreshold: 0.6,
} as const;

/**
 * Calibration probe (2026-08-01, second run) — still NOT a validated
 * benchmark. Same pinned route, 30 clues in one call: the 6 baseline clues
 * plus 24 deterministic historical own-decode/no-intercept control clues
 * (weak outcome proxies, not human adjudications of clue quality).
 *
 * Read together with BASELINE_INVERSION_PROBE, the decisive facts are:
 * - all 6 catastrophic clues were blind-recovered; 5/6 crossed the 0.60
 *   flag; the miss ("Conveyor belts and punch clocks"→FACTORY) was
 *   recovered at rank 2 with confidence 0.35 — the least transparent of
 *   the six, lethal in the pilot mainly through three rounds of
 *   accumulated public history, which a single-clue audit cannot see;
 * - 8/24 control clues were blind-recovered at some rank, but only 1/24
 *   crossed the flag. Recovery-anywhere therefore CANNOT be a hard veto:
 *   it would regenerate ~a third of historically good clues and push
 *   encryptors toward the miscommunication failure mode.
 */
export const BLIND_INVERSION_CALIBRATION_2026_08_01 = {
  status: "calibration_probe",
  protocolVersion: "blind-inversion@0.1-probe",
  auditedAt: "2026-08-01",
  modelRoute: {
    provider: "openrouter",
    model: "deepseek/deepseek-v4-flash-0731",
    upstream: "deepinfra",
    reasoningEffort: "max",
  } satisfies ModelRef,
  baseline: {
    clueCount: 6,
    recovered: 6,
    flaggedAtThreshold: 5,
    threshold: 0.6,
    knownMiss: {
      clue: "Conveyor belts and punch clocks",
      target: "FACTORY",
      recoveredAtRank: 2,
      confidence: 0.35,
    },
  },
  controls: {
    source:
      "deterministic historical own-decode/no-intercept triples from clean matches; outcome proxies, not ground truth",
    tripleCount: 8,
    clueCount: 24,
    flagged: 1,
    recovered: 8,
  },
  usage: { costUsd: 0.003187, latencyMs: 133_000 },
  limitation:
    "Single run, one auditor route, proxy controls, no rank-sensitive control statistics, no repeat-run stability estimate, no human adjudication. Establishes mechanism and cost, not a production threshold.",
} as const;

/**
 * Live probe (2026-08-01, third run) — the sensitivity counterweight to the
 * calibration above, and the reason this instrument must not be described as
 * a strategy detector.
 *
 * Twelve ordinary one-word base-advanced clues were audited on the same
 * pinned route. Only 2/12 hard-flagged and only 3/12 had their target
 * recovered at any rank. Against catastrophic definition-shaped phrases the
 * auditor recovered 6/6; against ordinary play it recovers roughly a
 * quarter.
 *
 * The structural cause is in `inversion.ts`, not in the sample size:
 * `conceptRecoversTarget` is LEXICAL. A target token must reappear as a
 * whole normalized token in a returned concept. A clue whose leak is purely
 * semantic — `sword` for WARRIOR, `hive` for BEE — is unrecoverable by
 * construction no matter how obvious it is to a human opponent, because the
 * auditor's concept string never contains the target token.
 *
 * Consequence: this is a CATASTROPHIC-CLUE GUARDRAIL with a low
 * over-regeneration rate (1/24 proxy controls hard-flagged), not a measure
 * of clue opacity. It is sound as a runtime floor under family play. It is
 * NOT a valid outcome metric for an experiment about strategic opacity,
 * because the dominant leak channel is invisible to it. See
 * INVERSION_PROMOTION_PREREQUISITES.
 */
export const BLIND_INVERSION_LIVE_PROBE_2026_08_01 = {
  status: "live_probe",
  protocolVersion: "blind-inversion@0.1-probe",
  auditedAt: "2026-08-01",
  source:
    "operator-reported live probe on the seated Table lane; per-clue run artifact not yet filed in-repo",
  modelRoute: {
    provider: "openrouter",
    model: "deepseek/deepseek-v4-flash-0731",
    upstream: "deepinfra",
    reasoningEffort: "max",
  } satisfies ModelRef,
  sample: {
    description: "ordinary one-word base-advanced clues, normal play",
    clueCount: 12,
    hardFlagged: 2,
    recoveredAtAnyRank: 3,
    threshold: 0.6,
  },
  knownCeiling:
    "deterministic target comparison is lexical; semantic-association leaks (sword->WARRIOR) pass by construction and cannot be detected by raising or lowering the threshold",
  limitation:
    "Sensitivity on ordinary clues is far below sensitivity on definition-shaped clues. Treat as a guardrail against the pilot failure mode, never as evidence that submitted clues are opaque.",
} as const;

/**
 * Provisional veto policy for encryptor clue regeneration, decided
 * 2026-08-01 from the calibration above. Probe-grade: the soft tier and the
 * threshold freeze only after blind-inversion@0.2 reports rank-sensitive
 * control statistics, repeat-run stability, and a human-adjudicated
 * subsample. `inversion.ts` implements matching and the typed outcome; this
 * record states the decision so both apps and the docs cannot drift apart.
 *
 * FROZEN: this object is content-hashed as
 * PROVISIONAL_INVERSION_VETO_POLICY_HASH and seated in live traces. Do not
 * edit it to record new evidence or to raise the research bar — add an
 * adjacent record instead (see INVERSION_PROMOTION_PREREQUISITES).
 */
export const PROVISIONAL_INVERSION_VETO_POLICY = {
  status: "probe",
  decidedAt: "2026-08-01",
  confidenceThreshold: 0.6,
  hardVeto: [
    "a concept matching the intended target carries confidence >= confidenceThreshold",
    "definitionShaped is true and directness >= confidenceThreshold",
  ],
  softRegenerateOnce: [
    "the intended target is the auditor's rank-1 concept at any confidence",
    "the intended target is recovered at any rank while definitionShaped is true",
  ],
  neverVetoOn:
    "target recovered at rank > 1 below threshold: 8/24 historical good clues were blind-recoverable (33% proxy rate); vetoing on recovery-anywhere over-regenerates toward miscommunication",
  pendingBeforeFreeze: [
    "rank-sensitive statistics on >= 90 control clues",
    "3 repeat runs for auditor stability",
    "human-adjudicated subsample of >= 20 clues",
  ],
} as const;

/**
 * Separates the two bars that were previously conflated.
 *
 * The runtime veto policy above is a product guardrail: it may seat under
 * family play while probe-grade, because its failure mode is "misses a bad
 * clue", which is ordinary Decrypto. A BotBuild promotion claim is a research
 * assertion about strategic quality, and it inherits the measurement ceiling
 * recorded in BLIND_INVERSION_LIVE_PROBE_2026_08_01.
 *
 * Decided 2026-08-01 (release review): hard-flag counts from
 * blind-inversion@0.1 are NOT an admissible primary outcome for promotion.
 * A treatment can drive hard-flags to zero while leaving every semantic leak
 * intact, so "zero hard-flags" measures compliance with a lexical filter, not
 * opacity. Promotion evidence must come from a semantic judge scored OFFLINE
 * over durable traces — the auditor's full ranked concept list is already
 * persisted per call, so this needs no additional runtime call, no added
 * latency, and no change to the seated game path.
 */
export const INVERSION_PROMOTION_PREREQUISITES = {
  status: "decided",
  decidedAt: "2026-08-01",
  appliesTo: "BotBuild promotion / EvaluationRecord verdict pass",
  doesNotApplyTo:
    "family-play seating of the runtime veto policy, which may remain probe-grade",
  inadmissibleAsPrimaryOutcome: [
    "hard-flag count under blind-inversion@0.1 (lexical comparison; blind to semantic leaks)",
    "recovered-at-any-rank count under blind-inversion@0.1 (same ceiling)",
  ],
  required: [
    "everything in PROVISIONAL_INVERSION_VETO_POLICY.pendingBeforeFreeze",
    "a semantic-equivalence judge scored offline over persisted auditor concept lists, reported with its own agreement rate against human adjudication",
    "interception rate and teammate-decode rate as co-primary behavioral outcomes, with interception admitted only at teamSize 2 or under no_opponent_transcript because default teamSize 3 exposes the opposing decode transcript",
    "side-balanced seeded matched arms on one pinned route",
    "prompt envelope held constant across arms: run the no_scratch_notes ablation on both arms (or prove identical notes), because Herpetarium injects cross-game scratch notes that The Table has no equivalent of",
  ],
  transferCaveat:
    "Byte-identity holds for the task-authority block only, not the whole prompt. Table adds a system preamble and Herpetarium adds scratch notes. A within-Herpetarium A/B stays valid by holding the envelope constant; do not restate it as 'The Table runs the validated prompt'.",
  rationale:
    "A lexical filter cannot license a claim about strategic opacity. Behavioral outcomes and a semantic judge can; the filter remains a guardrail either way.",
} as const;

/**
 * Outcome-only provenance for the operator production smoke. This intentionally
 * binds event identity, sequence, actor kind, and the resolved interception
 * outcome without copying payloads or inspecting human chat.
 */
export const CROSS_ROUND_PRODUCTION_SMOKE_EVENT_PROVENANCE_2026_08_01 = {
  status: "authoritative_runtime_outcome_evidence",
  verifiedAt: "2026-08-02",
  gameId: "884e2eac-0088-4cbc-8f23-54cd67d1712d",
  source:
    "read-only query of authoritative production game_events; payload and chat text not copied",
  humanChatInspected: false,
  humanReasoningPathKnown: false,
  events: {
    redBotClues: {
      sequence: 31,
      eventId: "3497a08f-fb42-4576-912b-45e6bf4dd2f7",
      actorKind: "ai",
      team: "red",
    },
    blueBotClues: {
      sequence: 35,
      eventId: "5665f360-7c81-41ce-a90e-63e5f0fda6c4",
      actorKind: "ai",
      team: "blue",
    },
    redHumanInterceptedBlue: {
      sequence: 40,
      eventId: "7c6e9772-a5f3-4a4d-bf4c-27fc224fd54f",
      actorKind: "human",
      interceptingTeam: "red",
      interceptedTeam: "blue",
    },
    blueHumanInterceptedRed: {
      sequence: 41,
      eventId: "b4f8fb5f-2ab5-4985-a0bb-32bc4b3d2c42",
      actorKind: "human",
      interceptingTeam: "blue",
      interceptedTeam: "red",
    },
    roundResolved: {
      sequence: 44,
      eventId: "6e83de43-7a65-4708-85f0-140dbec95491",
      outcome: "both_round_2_bot_clue_triples_intercepted_by_humans",
    },
  },
} as const;

/**
 * Production incident 2026-08-01 — the failure that invalidated the
 * single-clue bot-strength claim, preserved as a regression fixture.
 *
 * Red held QUARRY/RAVEN/TIGER/LADDER. Round 1 published Aggregate, Bengal,
 * Firetruck for code 1,3,4. Round 2 drew the same code and published blast,
 * orange, ascent. Because the round-1 code was public by then, every clue was
 * filed under its number in plain view, and the three round-2 clues sat in the
 * same association families as the round-1 clues occupying those exact
 * columns: Aggregate~blast (quarrying), Bengal~orange (tiger), Firetruck~
 * ascent (ladder). An opponent recovers 1,3,4 without ever naming a keyword.
 *
 * Both gates behaved exactly as specified and the leak still shipped:
 * - the actor ran at max reasoning for 14,099 reasoning tokens with the
 *   candidate policy's history-exposure check (item 4) in its prompt, and
 *   ignored it. Self-audit inside the actor call is unfalsifiable — the app
 *   observes an answer, never whether the check ran;
 * - the independent auditor ran at max reasoning for 1,996 reasoning tokens
 *   and answered honestly. Reading `orange` alone, "fruit"/"colour" IS the
 *   correct inversion. It never saw the ledger that made the clue lethal, so
 *   `blind-inversion@0.1-probe` returned pass on all three.
 *
 * This is therefore an enforcement/protocol defect, not a reasoning-budget
 * defect, and it is the accumulated-history class the roadmap already named
 * as unreachable by a single-clue audit. `blindConceptAudit` below reproduces
 * the honest single-clue result; conformance asserts it still passes under
 * `evaluateBlindInversion` and hard-vetoes under
 * `evaluateCrossRoundInversion`.
 */
export const CROSS_ROUND_COLUMN_LEAK_2026_08_01 = {
  status: "production_incident",
  observedAt: "2026-08-01",
  gameId:
    CROSS_ROUND_PRODUCTION_SMOKE_EVENT_PROVENANCE_2026_08_01.gameId,
  source:
    "production smoke on the seated Table lane; model-route evidence comes from the AI call records, while successful human interception comes from the outcome-only game-event provenance bound here",
  team: "red",
  ownKeywords: ["QUARRY", "RAVEN", "TIGER", "LADDER"],
  resolvedRounds: [
    {
      roundNumber: 1,
      code: [1, 3, 4],
      clues: ["Aggregate", "Bengal", "Firetruck"],
    },
  ],
  leakingRound: {
    roundNumber: 2,
    code: [1, 3, 4],
    clues: ["blast", "orange", "ascent"],
  },
  associationFamilies: [
    { number: 1, keyword: "QUARRY", public: "Aggregate", repeat: "blast" },
    { number: 3, keyword: "TIGER", public: "Bengal", repeat: "orange" },
    { number: 4, keyword: "LADDER", public: "Firetruck", repeat: "ascent" },
  ],
  reasoningTokens: { actor: 14_099, blindAudit: 1_996 },
  /**
   * The honest single-clue audit the 0.1 instrument returned. Not one concept
   * lexically recovers its target, and none is definition-shaped, so all three
   * legitimately passed.
   */
  blindConceptAudit: [
    {
      clue: "blast",
      concepts: [
        { concept: "explosion", confidence: 0.55 },
        { concept: "loud noise", confidence: 0.3 },
      ],
      definitionShaped: false,
      directness: 0.2,
    },
    {
      clue: "orange",
      concepts: [
        { concept: "fruit", confidence: 0.5 },
        { concept: "colour", confidence: 0.45 },
      ],
      definitionShaped: false,
      directness: 0.2,
    },
    {
      clue: "ascent",
      concepts: [
        { concept: "climb", confidence: 0.55 },
        { concept: "rise", confidence: 0.35 },
      ],
      definitionShaped: false,
      directness: 0.25,
    },
  ],
  singleClueProtocolOutcome: "pass",
  interceptedByHumans: true,
  eventProvenance: {
    botClues:
      CROSS_ROUND_PRODUCTION_SMOKE_EVENT_PROVENANCE_2026_08_01.events
        .redBotClues,
    humanIntercept:
      CROSS_ROUND_PRODUCTION_SMOKE_EVENT_PROVENANCE_2026_08_01.events
        .blueHumanInterceptedRed,
    resolution:
      CROSS_ROUND_PRODUCTION_SMOKE_EVENT_PROVENANCE_2026_08_01.events
        .roundResolved,
  },
  humanReasoningPathKnown: false,
  requiredCrossRoundOutcome: "hard_veto",
  requiredOutcomeBasis:
    "deterministic analyst policy maps an observed successful whole-code human interception to hard_veto; hard_veto is a policy label, not an observed event field",
} as const;

/**
 * The Blue half of the same production smoke. It is deliberately a separate
 * golden fixture because it exercises the boundary the Red incident does not:
 * the live code includes slot 4, but slot 4 had no resolved clue history.
 *
 * `crown`→`turret` recovers slot 1 and `telescope`→`nebula` recovers slot 3.
 * `treetop` may be guessed as slot 4, but slot 4 is the history-free position
 * for this protocol: with no public clue filed there, it cannot count as
 * cross-round evidence.
 *
 * CORRECTED 2026-08-02. An earlier version of this comment asserted that "those
 * two history-bearing locks are enough for a hard veto". That was a PREDICTION
 * stated as fact, and it is false under the shipped policy. Two actionable
 * intended edges satisfy only the evidence conjunct; `hardVeto` additionally
 * requires the intended code to sit in the auditor's credible set at
 * `plausible` or better. With the locks present but the credible set missing
 * [4,1,3], the evaluator returns `pass` — verified, not argued, in
 * `CROSS_ROUND_V03_BLUE_COUNTERFACTUALS_2026_08_02`. The claim mattered: it is
 * what made this fixture's `requiredCrossRoundOutcome` look reachable by
 * evidence recovery alone, and the v0.3 live boundary was designed around it.
 *
 * CORRECTED OUTCOME PROVENANCE, 2026-08-02. Authoritative game events show
 * that a Red human successfully intercepted this Blue whole code, just as a
 * Blue human successfully intercepted Red. The fixture is therefore grounded
 * in observed human recovery from the same public game state, not a
 * counterfactual claim that a competent opponent could have recovered it.
 * The event evidence does NOT reveal how the human reasoned: chat was not
 * inspected, so `crown`→`turret` via CASTLE remains an analyst hypothesis
 * about a plausible bridge, not an observed human reasoning path.
 */
export const CROSS_ROUND_COLUMN_LEAK_BLUE_2026_08_01 = {
  status: "production_incident",
  observedAt: "2026-08-01",
  gameId:
    CROSS_ROUND_PRODUCTION_SMOKE_EVENT_PROVENANCE_2026_08_01.gameId,
  source:
    "same production smoke as CROSS_ROUND_COLUMN_LEAK_2026_08_01; Blue public ledger and clue triple are bound to outcome-only authoritative game events",
  team: "blue",
  resolvedRounds: [
    {
      roundNumber: 1,
      code: [2, 1, 3],
      clues: ["pillow", "crown", "telescope"],
    },
  ],
  leakingRound: {
    roundNumber: 2,
    code: [4, 1, 3],
    clues: ["treetop", "turret", "nebula"],
  },
  associationFamilies: [
    {
      number: 4,
      public: null,
      repeat: "treetop",
      historyBearing: false,
      role: "negative_control",
    },
    {
      number: 1,
      public: "crown",
      repeat: "turret",
      historyBearing: true,
      role: "leak",
    },
    {
      number: 3,
      public: "telescope",
      repeat: "nebula",
      historyBearing: true,
      role: "leak",
    },
  ],
  expectedHistoryBearingPositions: 2,
  expectedHistoryBearingRecoveries: 2,
  historyFreeNegativeControlNumber: 4,
  interceptedByHumans: true,
  eventProvenance: {
    botClues:
      CROSS_ROUND_PRODUCTION_SMOKE_EVENT_PROVENANCE_2026_08_01.events
        .blueBotClues,
    humanIntercept:
      CROSS_ROUND_PRODUCTION_SMOKE_EVENT_PROVENANCE_2026_08_01.events
        .redHumanInterceptedBlue,
    resolution:
      CROSS_ROUND_PRODUCTION_SMOKE_EVENT_PROVENANCE_2026_08_01.events
        .roundResolved,
  },
  humanReasoningPathKnown: false,
  requiredCrossRoundOutcome: "hard_veto",
  requiredOutcomeBasis:
    "deterministic analyst policy maps an observed successful whole-code human interception to hard_veto; hard_veto is a policy label, not an observed event field",
} as const;

/**
 * Provisional veto policy for cross-round column recovery, decided
 * 2026-08-01 from the production incident above.
 *
 * PROBE-GRADE, and deliberately a separate record rather than an edit to
 * PROVISIONAL_INVERSION_VETO_POLICY, which is frozen and seated in live
 * traces. The two instruments answer different questions, carry different
 * protocol ids, and must never have their flag rates pooled.
 *
 * Why the tiers are where they are. A Decrypto code is three distinct digits
 * from 1..4, so the opponent's blind search space is 24 ordered triples. Each
 * column an opponent can lock cuts it: one lock leaves 6, two leaves 2, three
 * leaves 1. Two confident locks is therefore the point where interception
 * stops being a guess, and it is the hard tier. A column with no public
 * history cannot be locked FROM history, so it is excluded from the count —
 * that keeps this instrument aimed at the cross-round channel instead of
 * silently re-litigating single-clue transparency, which `inversion.ts`
 * already owns.
 *
 * Chance baselines for a useless auditor picking uniformly among 4 columns:
 * one rank-1 hit 25%, two-or-more 15.6%, all three 1.6%. The confidence floor
 * is what separates ONE confident lock from that noise, and it is exactly the
 * term this record cannot yet justify from data — 0.60 is inherited from the
 * single-clue calibration, not fitted here.
 *
 * A complete UNIQUE-top sweep therefore hard-vetoes on the discrete
 * prediction alone, with no confidence condition. That is deliberate. Its
 * 1.6% chance baseline is lower than the confidence floor's unmeasured
 * false-positive rate, and the sweep is the interception rather than a proxy
 * for it. A tie is different: four equal 0.25 candidates convey no
 * information, and even a two-way top set is narrowing rather than a lock.
 * This probe records ties but does not veto on them until a tie-set policy is
 * calibrated. The tiers are monotone in the number of history-bearing columns
 * the auditor uniquely locked; an earlier draft was not, and scored two
 * sub-threshold locks (24 -> 2) below three at even lower confidence.
 *
 * FROZEN: content-hashed as CROSS_ROUND_COLUMN_VETO_POLICY_HASH and seated in
 * live traces. Do not edit to record new evidence — add an adjacent record.
 */
export const CROSS_ROUND_COLUMN_VETO_POLICY = {
  status: "probe",
  decidedAt: "2026-08-01",
  confidenceThreshold: 0.6,
  auditorSees:
    "the public resolved clue-number ledger every opponent already holds, plus the three new clues",
  auditorNeverSees:
    "own keywords, the intended code, the team's private reasoning, or any unresolved round",
  ranking:
    "confidence ordered and array-order independent; only a unique highest-confidence column counts as recovered, while tied top sets remain explicit ambiguity",
  hardVeto: [
    "two or more intended columns that carry public history are uniquely recovered first at or above confidenceThreshold",
    "all three intended columns are uniquely recovered first, at any confidence, while at least two carry public history",
  ],
  softRegenerateOnce: [
    "exactly one history-bearing intended column is uniquely recovered first at or above confidenceThreshold",
    "two or more history-bearing intended columns are uniquely recovered first below confidenceThreshold",
    "all three intended columns are uniquely recovered first while exactly one carries public history",
  ],
  neverVetoOn:
    "a tied top set, or recovery of a column with no public clue history: neither is evidence that the cross-round channel uniquely disclosed that column",
  callGating:
    "the auditor call is gated on the public ledger being non-empty, never on the intended code, so the existence of the call discloses nothing about the code",
  pendingBeforeFreeze: [
    "false-positive rate on >= 90 historical control triples that were not intercepted",
    "3 repeat runs for auditor stability at fixed ledger depth",
    "a confidence floor fitted to THIS instrument rather than inherited from blind-inversion@0.1",
    "sensitivity as a function of ledger depth: a one-round ledger and a five-round ledger are not the same instrument",
    "the rank-1 sweep tier's real false-positive rate, since 1.6% is a uniform-guessing baseline and a systematically wrong auditor need not be uniform",
    "a separately calibrated partial-information tier for two-way and three-way top ties; the probe currently records but never promotes them to recovery",
  ],
} as const;

/**
 * FROZEN v0.2 policy, preserved verbatim so its live trace stays readable.
 *
 * This object still says `probe` because that was its state when it was
 * content-hashed and seated. Retirement is recorded in the adjacent
 * `CROSS_ROUND_COLUMN_ASSIGNMENT_VETO_POLICY_RETIREMENT_2026_08_01`; changing
 * this object to record later evidence would destroy its historical identity.
 */
export const CROSS_ROUND_COLUMN_ASSIGNMENT_VETO_POLICY = {
  status: "probe",
  decidedAt: "2026-08-01",
  supersedes: "cross-round-column-veto@2026-08-01",
  supersededBecause:
    "the 0.1 instrument scored the Red production incident pass against the exact dated model; see CROSS_ROUND_MARGINAL_ELICITATION_FAILURE_2026_08_01",
  assignmentMarginThreshold: 0.15,
  marginalConfidenceFloor: 0.6,
  auditorSees:
    "the public resolved clue-number ledger every opponent already holds, plus the three new clues",
  auditorNeverSees:
    "own keywords, the intended code, the team's private reasoning, or any unresolved round",
  elicitation:
    "a complete 3x4 association matrix scoring every clue against all four slots, reasoned through the latent keyword each slot's past clues share, plus the auditor's own single best legal triple",
  resolution:
    "deterministic global assignment: the unique highest-scoring triple among the 24 legal ordered triples, with per-row normalisation and ties resolved to no assignment at all",
  hardVeto: [
    "the unique best legal assignment reproduces the entire intended code while at least two of its columns carry public history",
    "the auditor's own declared triple reproduces the entire intended code while at least two of its columns carry public history",
    "the unique best legal assignment lands two or more history-bearing intended columns AND beats the next-best triple by assignmentMarginThreshold",
  ],
  softRegenerateOnce: [
    "the unique best legal assignment lands two or more history-bearing intended columns below the margin threshold",
    "the unique best legal assignment lands exactly one history-bearing intended column at or above the margin threshold",
    "the unique best legal assignment reproduces the entire intended code while exactly one column carries public history",
    "the auditor's declared triple lands two or more history-bearing intended columns",
  ],
  declaredTripleIsCorroborating:
    "the declared triple is mandatory output, so a reply with no discriminating evidence still names a code and is right 1/24 of the time by construction; it counts for nothing unless the association matrix itself resolved to a unique legal assignment",
  neverVetoOn:
    "a tie across two or more top-scoring legal triples, or a match on a column with no public clue history: neither is evidence that the cross-round channel uniquely disclosed that column",
  callGating:
    "the auditor call is gated on the public ledger being non-empty, never on the intended code, so the existence of the call discloses nothing about the code",
  pendingBeforeFreeze: [
    "false-positive rate on >= 90 historical control triples that were not intercepted, measured under THIS elicitation",
    "3 repeat runs for auditor stability at fixed ledger depth",
    "assignmentMarginThreshold fitted to observed margin distributions rather than chosen; 0.15 is a judgement, not a measurement",
    "sensitivity as a function of ledger depth: a one-round ledger and a five-round ledger are not the same instrument",
    "whether the deterministic solve and the auditor's declared triple disagree often enough to be worth carrying both",
    "the two-lock tier's real false-positive rate, since 16.7% is a uniform-legal-guessing baseline and a systematically wrong auditor need not be uniform",
    "a calibrated partial-information tier for tied top triples; the probe records but never promotes them",
    "re-running the Red and Blue canaries live against the dated model under 0.2, which is the only thing that can retire the failure this record was written from",
  ],
} as const;

/** Later retirement evidence, deliberately outside the frozen v0.2 object. */
export const CROSS_ROUND_COLUMN_ASSIGNMENT_VETO_POLICY_RETIREMENT_2026_08_01 = {
  status: "retired",
  retiredAt: "2026-08-01",
  policyId: "cross-round-column-assignment-veto@2026-08-01",
  policyHash:
    "92ad7aba1c64e162fbbfa0e07de6ecb82de333624abf648f52eb6ee5efbe1769",
  supersededBy: "cross-round-referent-evidence-veto@2026-08-01",
  retiredBecause:
    "scored the Red production incident pass against the exact dated model at 26,716 reasoning tokens; see CROSS_ROUND_V02_LIVE_TRACE_2026_08_01",
} as const;

/**
 * Shared route for every recorded cross-round trace below. Exact and dated:
 * an alias without an epoch is not a route.
 */
const CROSS_ROUND_TRACE_ROUTE = {
  provider: "openrouter",
  model: "deepseek/deepseek-v4-flash-0731",
  upstream: "DeepInfra",
  reasoningEffort: "xhigh",
  wireReasoningEffort: "max",
} as const;

/**
 * THE RAW v0.1 RED TRACE, preserved verbatim. 2026-08-01.
 *
 * `cross-round-column-inversion@0.1-probe` run against the exact dated model
 * on the very incident it was built for, scoring the Red submission `pass`.
 * Humans at the table intercepted the same submission.
 *
 * Read the numbers before theorising. The per-clue argmax is 4,3,1 — three
 * DISTINCT slots, a perfectly legal code. There is no duplicate slot, no
 * collision, and no illegal joint hypothesis anywhere in this reply. An
 * earlier diagnosis in this repo claimed otherwise and built a whole
 * instrument on it; that claim was fabricated and is retracted. Adding a
 * one-to-one global assignment over the 24 legal codes returns 4,3,1 from
 * exactly these marginals and changes nothing.
 *
 * What went wrong is a 1<->4 SWAP in the latent-parent inference: the auditor
 * took blast~Firetruck through FIRE and ascent~Aggregate through RISING TOTAL,
 * missing blast~Aggregate through QUARRY and ascent~Firetruck through LADDER.
 * Only orange~Bengal through TIGER was right. Both readings are honest; the
 * ledger genuinely supports both.
 */
export const CROSS_ROUND_V01_LIVE_TRACE_2026_08_01 = {
  status: "instrument_failure",
  observedAt: "2026-08-01",
  instrument: "cross-round-column-inversion@0.1-probe",
  incident: "CROSS_ROUND_COLUMN_LEAK_2026_08_01",
  team: "red",
  route: CROSS_ROUND_TRACE_ROUTE,
  instrumentIdentity: {
    protocolVersion: "cross-round-column-inversion@0.1-probe",
    policyId: "cross-round-column-veto@2026-08-01",
    policyHash:
      "8c1e4e0bc02619c71cd3e8725e6a44e4114716cfd0fb9226f5cc1aa193710218",
    auditorPromptHash:
      "647200ebee9a6775cdbc70a56805ae20a7c085b9d3febfa9a7d8dfd5b649e14e",
  },
  usage: {
    promptTokens: 541,
    completionTokens: 24_398,
    totalTokens: 24_939,
    reasoningTokens: 22_183,
    providerCostUsd: 0.004421898,
    latencyMs: 342_337,
  },
  observedOutcome: "pass",
  requiredOutcome: "hard_veto",
  interceptedByHumans: true,
  /** Verbatim per-clue slot rankings, in the auditor's reported order. */
  rankings: [
    {
      clue: "blast",
      slots: [
        { slot: 4, confidence: 0.45 },
        { slot: 1, confidence: 0.25 },
        { slot: 2, confidence: 0.15 },
        { slot: 3, confidence: 0.15 },
      ],
    },
    {
      clue: "orange",
      slots: [
        { slot: 3, confidence: 0.5 },
        { slot: 4, confidence: 0.25 },
        { slot: 2, confidence: 0.15 },
        { slot: 1, confidence: 0.1 },
      ],
    },
    {
      clue: "ascent",
      slots: [
        { slot: 1, confidence: 0.4 },
        { slot: 4, confidence: 0.25 },
        { slot: 2, confidence: 0.2 },
        { slot: 3, confidence: 0.15 },
      ],
    },
  ],
  /** Derived, and asserted by conformance so the retraction cannot regress. */
  marginalArgmax: [4, 3, 1],
  marginalArgmaxIsLegalCode: true,
  globalAssignment: [4, 3, 1],
  globalAssignmentMargin: 0.2,
  /** The one position the auditor placed correctly. */
  correctPositions: [2],
  missedBridges: [
    { clue: "blast", intendedSlot: 1, sharedReferent: "QUARRY" },
    { clue: "ascent", intendedSlot: 4, sharedReferent: "LADDER" },
  ],
  takenBridges: [
    { clue: "blast", chosenSlot: 4, sharedReferent: "FIRE" },
    { clue: "ascent", chosenSlot: 1, sharedReferent: "RISING TOTAL" },
  ],
  /**
   * RETRACTION, kept so the inference is not re-derived from these numbers.
   *
   * A later draft argued from the empty slot 2 that the auditor had judged the
   * true bridges "worse than nothing" and concluded the failure was a
   * model-capability limit. That argument was invalid. The prompt in force
   * told the auditor an empty slot "gives you nothing to match, so score it
   * only from the clue itself" and that it "is sometimes the only placement
   * left", so those values mix clue-alone plausibility with elimination value.
   * They are NOT a calibrated no-information baseline for shared-referent
   * strength and support no conclusion about latent-parent judgement.
   */
  emptySlotScoresAreNotABaseline: true,
} as const;

/**
 * THE RAW v0.1 BLUE TRACE, preserved verbatim. Same run, same route.
 *
 * Intended code 4,1,3; the auditor's argmax and the legal global solve are
 * both 1,4,3, at margin .38. `crown` is an honest clue for two different
 * hidden words — crown+treetop suggests TREE, crown+turret suggests CASTLE —
 * and the two readings are mutually exclusive under the distinctness rule.
 * Whichever branch the auditor takes, the other stays equally available to a
 * human opponent.
 *
 * Note the outcome: `soft_regenerate_once`, NOT `pass`. Only nebula~telescope
 * cleared the 0.60 floor on an intended column, which is one confident lock
 * and therefore the bounded soft tier. An earlier record in this repo said
 * `pass`; that was wrong and is corrected here.
 */
export const CROSS_ROUND_V01_BLUE_TRACE_2026_08_01 = {
  status: "instrument_failure",
  observedAt: "2026-08-01",
  instrument: "cross-round-column-inversion@0.1-probe",
  incident: "CROSS_ROUND_COLUMN_LEAK_BLUE_2026_08_01",
  team: "blue",
  route: CROSS_ROUND_TRACE_ROUTE,
  instrumentIdentity: {
    protocolVersion: "cross-round-column-inversion@0.1-probe",
    policyId: "cross-round-column-veto@2026-08-01",
    policyHash:
      "8c1e4e0bc02619c71cd3e8725e6a44e4114716cfd0fb9226f5cc1aa193710218",
    auditorPromptHash:
      "647200ebee9a6775cdbc70a56805ae20a7c085b9d3febfa9a7d8dfd5b649e14e",
  },
  usage: {
    promptTokens: 544,
    completionTokens: 18_801,
    totalTokens: 19_345,
    reasoningTokens: 14_949,
    providerCostUsd: 0.003414708,
    latencyMs: 208_440,
  },
  observedOutcome: "soft_regenerate_once",
  requiredOutcome: "hard_veto",
  rankings: [
    {
      clue: "treetop",
      slots: [
        { slot: 1, confidence: 0.82 },
        { slot: 4, confidence: 0.1 },
        { slot: 2, confidence: 0.05 },
        { slot: 3, confidence: 0.03 },
      ],
    },
    {
      clue: "turret",
      slots: [
        { slot: 4, confidence: 0.6 },
        { slot: 2, confidence: 0.22 },
        { slot: 1, confidence: 0.11 },
        { slot: 3, confidence: 0.07 },
      ],
    },
    {
      clue: "nebula",
      slots: [
        { slot: 3, confidence: 0.84 },
        { slot: 4, confidence: 0.08 },
        { slot: 1, confidence: 0.05 },
        { slot: 2, confidence: 0.03 },
      ],
    },
  ],
  intendedCode: [4, 1, 3],
  marginalArgmax: [1, 4, 3],
  marginalArgmaxIsLegalCode: true,
  globalAssignment: [1, 4, 3],
  globalAssignmentMargin: 0.38,
  competingReferents: [
    {
      ledgerClue: "crown",
      slot: 1,
      newClue: "treetop",
      sharedReferent: "TREE",
      role: "decoy",
    },
    {
      ledgerClue: "crown",
      slot: 1,
      newClue: "turret",
      sharedReferent: "CASTLE",
      role: "true",
    },
  ],
} as const;

/**
 * THE RAW v0.2 RED TRACE, preserved verbatim. 2026-08-01.
 *
 * `cross-round-column-inversion@0.2-probe` added a complete four-slot matrix,
 * explicit latent-keyword prose, an explicit one-to-one instruction, and a
 * deterministic global assignment. It cost 26,716 reasoning tokens and made
 * the identical error MORE confident: blast->slot4 moved from .45 to .80.
 *
 * This is the load-bearing evidence against "better prose plus a joint
 * argmax". The joint step had nothing to fix, because 0.1's answer was already
 * a legal permutation; the prose did not move the model off the surface
 * bridges, it hardened them.
 *
 * Do NOT read slot 2 as a no-information baseline — see
 * `emptySlotScoresAreNotABaseline` on the v0.1 record for why that inference
 * was retracted.
 */
export const CROSS_ROUND_V02_LIVE_TRACE_2026_08_01 = {
  status: "instrument_failure",
  observedAt: "2026-08-01",
  instrument: "cross-round-column-inversion@0.2-probe",
  incident: "CROSS_ROUND_COLUMN_LEAK_2026_08_01",
  team: "red",
  route: CROSS_ROUND_TRACE_ROUTE,
  instrumentIdentity: {
    protocolVersion: "cross-round-column-inversion@0.2-probe",
    policyId: "cross-round-column-assignment-veto@2026-08-01",
    policyHash:
      "92ad7aba1c64e162fbbfa0e07de6ecb82de333624abf648f52eb6ee5efbe1769",
    auditorPromptHash:
      "aadf2be8f613542fdbaa1b428cf92a2ea286525e305c04ebf8e49e074beb200a",
    substrateVersion: "0.3.0",
  },
  usage: {
    promptTokens: 849,
    completionTokens: 30_047,
    totalTokens: 30_896,
    reasoningTokens: 26_716,
    providerCostUsd: 0.005480262,
    latencyMs: 411_625,
  },
  observedOutcome: "pass",
  requiredOutcome: "hard_veto",
  /** Verbatim complete association matrix, in the auditor's reported order. */
  matrix: [
    {
      clue: "blast",
      slots: [
        { slot: 4, confidence: 0.8 },
        { slot: 2, confidence: 0.45 },
        { slot: 1, confidence: 0.2 },
        { slot: 3, confidence: 0.05 },
      ],
    },
    {
      clue: "orange",
      slots: [
        { slot: 3, confidence: 0.85 },
        { slot: 2, confidence: 0.5 },
        { slot: 4, confidence: 0.35 },
        { slot: 1, confidence: 0.05 },
      ],
    },
    {
      clue: "ascent",
      slots: [
        { slot: 1, confidence: 0.65 },
        { slot: 2, confidence: 0.5 },
        { slot: 4, confidence: 0.3 },
        { slot: 3, confidence: 0.05 },
      ],
    },
  ],
  declaredCode: [4, 3, 1],
  globalAssignment: [4, 3, 1],
  globalAssignmentMargin: 0.1,
  /** The prose was not merely ineffective; it sharpened the wrong bridge. */
  confidenceOnWrongBridge: { clue: "blast", slot: 4, from: 0.45, to: 0.8 },
} as const;

/**
 * Cross-round veto policy v3, decided 2026-08-01 after BOTH earlier
 * instruments scored the Red incident `pass` against the exact dated model.
 *
 * ADJACENT to the two frozen records above, not an edit to either. Each names
 * the tiers its own auditor was scored under, and each produced a real run;
 * rewriting one in place would make its trace unreadable.
 *
 * WHAT CHANGED, and why the earlier two did not work:
 *  - v1 asked for per-clue slot rankings and scored per-position argmaxes.
 *    v2 kept that question and added a complete matrix, latent-keyword prose,
 *    and a deterministic assignment over the 24 legal codes. Both scored the
 *    incident `pass`, and v2's assignment was mathematically incapable of
 *    helping: v1's marginals already argmaxed to a legal permutation, so
 *    there was no illegal joint hypothesis for the constraint to repair.
 *  - The question itself was wrong. "Did this auditor identify the code?" and
 *    "is this code identifiable from public history?" come apart exactly when
 *    the latent-parent inference is ambiguous, which is the common case: one
 *    ledger clue underdetermines its keyword. Aggregate is an honest clue for
 *    QUARRY or a running total; crown for CASTLE or TREE. A point-estimate
 *    auditor must pick, and a wrong pick scored identically to no information
 *    at all — even though being one of two serious readings means the
 *    opponent's search is already 24 -> 2.
 *  - v3 therefore elicits EVIDENCE in two layers and scores the evidence.
 *    Layer 1 is per-edge and NON-COMPETITIVE, which is the structural fix: a
 *    normalised confidence over slots made reporting a second bridge cost the
 *    first, so the format itself deleted the signal. Layer 2 keeps a small
 *    credible set with equal-support alternatives intact.
 *
 * WHY THE TIERS SIT WHERE THEY DO. A blind opponent faces 24 ordered triples;
 * each column locked cuts it 24 -> 6 -> 2 -> 1. Hard veto therefore requires
 * the intended code itself to be at least plausible, no more than one
 * hypothesis to be supported more strongly, the whole credible set to contain
 * at most three codes, at least two actionable historical bridges, and at
 * least one strong bridge. Credible-set membership or edge evidence alone is
 * never enough. These are conservative mechanism bounds, not calibrated
 * probabilities: model guesses are not uniform and the two layers are
 * correlated.
 *
 * A column with no public history is excluded from every count, and a slot
 * reached only by elimination is recorded but never counted, so this
 * instrument stays aimed at the cross-round channel rather than
 * re-litigating single-clue transparency, which `inversion.ts` owns.
 *
 * NO NUMERIC CONFIDENCE APPEARS IN ANY TIER. The 0.60 floor inherited from
 * blind-inversion@0.1 is gone entirely rather than retuned: two live runs
 * showed the failure was never a threshold.
 *
 * PROBE IDENTITY: content-hashed as CROSS_ROUND_COLUMN_VETO_POLICY_HASH and
 * recorded on every call. The exact release candidate hash is pinned by
 * conformance, but the policy remains probe-grade until the live canary and
 * calibration work below are complete. Once declared frozen, do not edit this
 * record to add evidence — add an adjacent version.
 */
export const CROSS_ROUND_REFERENT_EVIDENCE_VETO_POLICY = {
  status: "probe",
  decidedAt: "2026-08-01",
  supersedes: [
    "cross-round-column-veto@2026-08-01",
    "cross-round-column-assignment-veto@2026-08-01",
  ],
  supersededBecause:
    "both scored the Red production incident pass against the exact dated model; see CROSS_ROUND_V01_LIVE_TRACE_2026_08_01 and CROSS_ROUND_V02_LIVE_TRACE_2026_08_01",
  question:
    "is this code identifiable from public history, not did this auditor identify it",
  /**
   * How many hypotheses the auditor may believe MORE than the intended one.
   * Counting "at least as strongly" instead was blind to credible-set size and
   * eviction-perverse at the cap: downgrading an alternative, i.e. believing it
   * LESS, lowered the count and strengthened the verdict.
   */
  hardVetoDominatedByAtMost: 1,
  softVetoDominatedByAtMost: 2,
  /**
   * Set size is an explicit term, not a side effect of the counting rule. The
   * whole rationale for these tiers is the 24 -> 6 -> 2 -> 1 collapse, so a
   * metric that cannot see how wide the auditor's own search is would be
   * self-undermining.
   */
  hardVetoCredibleSetSizeAtMost: 3,
  /**
   * ABSOLUTE belief floor. `weak` is the bottom tier, so a purely relative
   * count makes the auditor's own least-credible entry count as evidence; a
   * reply reading "I strongly believe A, the intended code is a weak also-ran"
   * must never hard-veto.
   */
  minimumHardVetoSupport: "plausible",
  /** Weak stretches do not count as opponent-actionable history evidence. */
  minimumActionableReferentStrength: "plausible",
  hardVetoMinimumActionableEdges: 2,
  softVetoMinimumActionableEdges: 2,
  /**
   * Narrow credible-set soft path: when nothing is supported more strongly,
   * one actionable edge is enough to earn exactly one regeneration.
   */
  softVetoNarrowDominatedByAtMost: 0,
  softVetoNarrowMinimumActionableEdges: 1,
  /**
   * At least one intended bridge the auditor would act on. `strength` is
   * admitted uncalibrated, so this is the cheapest available guard against a
   * reply that calls everything plausible. Both 2026-08-01 incidents clear it.
   */
  requiresAtLeastOneStrongIntendedEdge: true,
  maxCodeHypotheses: 6,
  evidenceLayers: [
    "historyMatches: for each of the three clues, carrying its own clueIndex, against each of the four slots, a salient ordinary sharedReferent hypothesis plus the EXACT public clue it bridges from, plus a qualitative strength; judged per edge and never normalised across slots, so a clue with two genuine parents reports both",
    "codeHypotheses: the smallest serious credible set of unique legal codes, each carrying a machine-readable support tier and an optional rationale; ARRAY ORDER IS NOT READ, so equal-support alternatives are genuinely equal",
  ],
  intendedRankMetric:
    "dominatingHypotheses: the number of hypotheses supported strictly more strongly than the intended one; credibleSetSize is read separately, and both measures are invariant to permutation of equally supported entries",
  evidenceBinding:
    "every non-none cell must quote the exact public clue it bridges from, and the evaluator checks that string against the ledger slot it was filed under; a cell quoting another slot's clue, a clue absent from the ledger, or any claim on an empty column is rejected outright",
  rowIdentity:
    "each evidence row carries its own clueIndex 1..3 and the evaluator rejects reordered, duplicated, missing or out-of-range indices rather than silently relabelling rows to the caller's order",
  auditorSees:
    "the public resolved clue-number ledger every opponent already holds, plus the three new clues",
  auditorNeverSees:
    "own keywords, the intended code, the team's private reasoning, or any unresolved round",
  hardVeto: [
    "the intended code is itself supported at least at minimumHardVetoSupport, AND at most hardVetoDominatedByAtMost hypotheses are supported more strongly, AND the whole credible set is at most hardVetoCredibleSetSizeAtMost wide, AND at least two intended history-bearing columns carry a plausible or strong shared referent, AND at least one of those is strong",
  ],
  softRegenerateOnce: [
    "the intended code is supported at least at minimumHardVetoSupport AND at most softVetoDominatedByAtMost hypotheses are supported more strongly AND at least two intended history-bearing columns carry a plausible or strong shared referent",
    "the intended code is supported at least at minimumHardVetoSupport AND nothing is supported more strongly AND at least one intended history-bearing column carries a plausible or strong shared referent",
  ],
  bothLayersAlwaysRequired:
    "no tier reads one layer alone. Every tier conjoins the credible-set layer with the evidence layer.",
  falsePositiveFloorIsAMinimumNotAProduct:
    "the two layers are NOT independent — the credible set is built from the evidence grid — so the conjunction does not multiply their rates. Read the worst case as a MIN, not a product: a hard veto requires membership in a credible set of at most 3, so at most 3 of the 24 legal codes can hard-veto on any one reply (12.5%), and an evidence-only clause would carry a model-independent 16.7% floor. Anyone reading the conjunction as buying 8.3% x 16.7% is wrong by roughly an order of magnitude.",
  vetoBreadthControl:
    "a deterministic model-free mechanism bound available today: sweep the intended code over all 24 legal triples against the SAME fixed reply and ledger and count how many hard-veto. This measures evaluator selectivity breadth, not an empirical false-positive rate or independent permutation null, needs no provider call, and is asserted in conformance.",
  neverVetoOn:
    "a column with no public clue history, however confidently a referent is claimed there; the evaluator rejects such a claim outright, and a slot reached only by elimination is recorded but never counted as evidence",
  safeControlBoundary:
    "the release boundary requires the synthetic opaque control to PASS as well as the two incidents to hard-veto, so an instrument that vetoes everything cannot certify green. The control is hand-authored and explicitly NOT held-out evidence, a false-positive estimate, or calibration; it is a mechanism check only.",
  callGating:
    "the auditor call is gated on the public ledger being non-empty, never on the intended code, so the existence of the call discloses nothing about the code",
  privacy:
    "sharedReferent text and every intended-code-derived signal stay in private call metadata; none of it may reach any surface readable while a game is live",
  pendingBeforeFreeze: [
    "v3 HAS NEVER BEEN RUN LIVE, and nothing here predicts its result. An earlier draft argued from the empty slot 2 of the v0.2 trace that the auditor had judged the true bridges worse than nothing; that inference is RETRACTED, because the prompt in force told the auditor to score an empty slot only from the clue itself and noted it is sometimes the only placement left, so those values conflate clue-alone plausibility with elimination. The next step is a real Red, Blue and safe-control call under v3, recorded whatever it shows.",
    "an UNCALIBRATED research direction, not a designed successor: ensembling several auditors and/or several models and reading how often the intended code is named. There is no valid exact test available for it. Model guesses are not uniform over the 24 legal codes, repeated agents are correlated, and the clue and code construction themselves induce slot and position biases, so p0 = 1/24 is NOT a defensible null and any claim of an exact binomial test would be pseudo-precision. Before this could gate anything it needs safe-control calibration per model and per ledger depth, or a defensible randomization design.",
    "false-positive rate on >= 90 historical control triples that were not intercepted, measured under THIS elicitation; `strength` is model-reported, unbounded and uncalibrated, and nothing yet bounds how often a diligent auditor calls an ordinary bridge strong",
    "an earlier draft hard-vetoed on two strong intended edges with no rank condition. That clause was removed before shipping: for ANY reply carrying three strong cells, exactly 4 of the 24 legal codes match two or more of them, so it carried a model-independent 16.7% false-positive floor — the same figure the retired assignment policy called too close to noise to veto on. Both tiers now require both layers.",
    "the two layers are NOT independent: codeHypotheses is derived from historyMatches, so conjoining them is a strictness choice, not a probability product, and the conjunction's real joint false-positive rate is unmeasured",
    "ledger-depth compounding: an edge counts if the clue bridges to AT LEAST ONE clue filed under that slot, so P(some bridge) rises with depth and the gate may drift toward a constant veto by mid-game. Measure the tier distribution at depths 1, 3 and 5 before freezing.",
    "whether the model follows the prompt's explicit FINDABILITY test rather than reverting to tautological existence: on an intended edge both clues necessarily came from the same keyword, so the prompt now says that private fact is not evidence and asks what an opponent could readily discover from the public clue pair. The strength scale remains uncalibrated.",
    "3 repeat runs for auditor stability at fixed ledger depth, including whether credible-set membership, size, and support tiers are stable; array order is deliberately ignored",
    "whether domination counts and support tiers are the right shape at all, or whether support should be read relative to credible-set size; a set of 1 and a set of 6 imply very different posterior mass at the same domination count, and credibleSetSize is recorded so this can be revisited without a new run",
    "human adjudication of sharedReferent quality on >= 20 flagged edges, since an unverified referent string is the one part of this instrument nothing else checks",
  ],
} as const;

/**
 * Terminology and provenance erratum for immutable prose inside the hashed
 * v0.3 policy above. The source fields cannot be renamed or rewritten without
 * changing the policy hash stamped on the live calls.
 */
export const CROSS_ROUND_REFERENT_EVIDENCE_POLICY_ERRATA_2026_08_02 = {
  status: "erratum",
  recordedAt: "2026-08-02",
  policyId: "cross-round-referent-evidence-veto@2026-08-01",
  policyHash:
    "0dde8a93748fea551eb4ea79ae60e6a02733d65719d687a5f2ec4fb94e958be7",
  immutableSourceFields: [
    "falsePositiveFloorIsAMinimumNotAProduct",
    "safeControlBoundary",
    "pendingBeforeFreeze",
  ],
  corrections: {
    combinatorialBreadth:
      "The 4-of-24 and related figures are code-match breadth for a fixed reply shape, not false-positive floors or population error rates. Denser grids can match more codes.",
    shapedInput:
      "The synthetic kettle/meridian/sable case is a post-incident, hand-authored shaped input. Its pass only shows that this fixed reply did not trigger the fixed evaluator; it does not establish safety, non-leakage, a negative-control distribution, or calibration.",
    staleRunStatus:
      "The policy says v3 had never run live because that sentence was frozen before execution. CROSS_ROUND_V03_LIVE_BOUNDARY_2026_08_02 supersedes it: v3 ran and failed.",
  },
  changesPolicySemantics: false,
} as const;

/**
 * THE v0.3 LIVE RELEASE BOUNDARY, 2026-08-02. IT FAILED.
 *
 * ADJACENT to the policy record above, never an edit to it. That record's
 * `pendingBeforeFreeze` still reads "v3 HAS NEVER BEEN RUN LIVE"; it is now
 * false and it STAYS, because the whole object is content-hashed as
 * `CROSS_ROUND_COLUMN_VETO_POLICY_HASH` and that exact hash
 * (`0dde8a93...`) is stamped on all three calls below. Editing the prose in
 * place would silently re-identify the policy the run executed under and make
 * the stamped hash unmatchable against the source. This record supersedes the
 * stale sentence; the sentence is left frozen as the historical artifact it is.
 *
 * WHAT THIS IS NOT. Not calibration, not a population error-rate estimate, not
 * held-out evidence, and not a detection rate. n = 1 per case, three cases,
 * one route, one day. The authors' own `pendingBeforeFreeze` asks for "3
 * repeat runs for auditor stability" and this probe ran at `repeatCount: 1`,
 * i.e. below the stability bar the same object already set. Nothing here
 * separates a systematic elicitation bias from a single unlucky draw.
 *
 * WHAT IT IS. The exact evidence grids the dated model returned. Those grids
 * are the durable asset: any successor instrument can be replayed against
 * them offline, for free, with no provider call.
 *
 * THE RESULT. Red hard-vetoed as required. The legacy-named, post-incident
 * hand-authored shaped input passed; that result does not establish safety or
 * non-leakage. BLUE PASSED AND SHOULD HAVE HARD-VETOED, so the two-sided
 * boundary is false and v0.3 is NOT releasable.
 *
 * BLUE IS A REGRESSION, NOT MERELY A MISS. `@0.1-probe` scored this same
 * incident `soft_regenerate_once` (CROSS_ROUND_V01_BLUE_TRACE_2026_08_01) —
 * one bounded regeneration. `@0.3-probe` scores it `pass`, i.e. it ships the
 * clue set untouched. On the Blue incident the third instrument is strictly
 * weaker than the first.
 *
 * THE REPLY IS OUTSIDE THE PUBLISHED THRESHOLD PARAMETERIZATION.
 * `hardVeto` conjoins an evidence layer and a credible-set layer, and the Blue
 * reply failed BOTH independently:
 *   - the grid omitted `turret`->slot 1 entirely, reporting strength "none"
 *     for the one cell that carries the leak (`crown` is filed under slot 1);
 *   - the credible set was the single code [1,2,3]; intended [4,1,3] was absent,
 *     so `intendedBelieved` is false and every tier short-circuits.
 * Repairing either alone is not enough under the fixed decision logic — see
 * `CROSS_ROUND_V03_BLUE_COUNTERFACTUALS_2026_08_02`. Consequently NO setting of
 * the published thresholds can reach this reply: a sweep of all 1944 legal
 * policy configurations hard-vetoes Blue in 0 of them (Red in 840, control in
 * 0). `scripts/test-cross-round-v03-postmortem.ts` pins that sweep so the
 * result cannot be quietly reinterpreted as a change to those published
 * threshold fields. This does not uniquely identify an elicitation defect:
 * changing the fixed decision logic that requires intended-code membership is
 * a distinct, untested redesign.
 *
 * WHY THE AUDITOR MISSED IT — the mechanism, stated as a hypothesis. `crown`
 * is an honest clue for two different hidden words, exactly as this file
 * predicted at CROSS_ROUND_V01_BLUE_TRACE_2026_08_01 and as the v3 rationale
 * says outright ("crown for CASTLE or TREE"). The model found the TREE branch
 * — `treetop`/`crown` via "tree", at STRONG — which is a real and arguably
 * shorter bridge, not a hallucination. Having spent slot 1 on it, it reported
 * `turret`->slot 1 as "none" and routed `turret` to slot 2 via "fort", a
 * visibly weaker bridge. v0.3's stated fix was that layer 1 be NON-COMPETITIVE;
 * the schema achieved that (independent per-cell strengths, no normalisation)
 * but the behaviour did not, because the permutation task in STEP 2 shares one
 * response with the grid. Competitiveness re-entered through the task, not the
 * format. This is a hypothesis consistent with n = 1; it is not established.
 */
export const CROSS_ROUND_V03_LIVE_BOUNDARY_2026_08_02 = {
  status: "instrument_failure",
  observedAt: "2026-08-02",
  instrument: "cross-round-referent-evidence@0.3-probe",
  researchStatus:
    "mechanism_canary_only_not_calibration_or_tournament_evidence",
  /**
   * The full no-clobber report. `reportContentHash` is `contentHash` of the
   * report with that field removed, so it is NOT the file's sha256; the raw
   * file digest is bd3ac86e0ee30fd8956d30fa86890c8b38f79b6af7b9878942d9a382856b1be6.
   * Both were recomputed from the artifact and agree.
   */
  report: {
    originalPath: "/private/tmp/cross-round-v03-live-20260802T041600Z.json",
    committedPath:
      "docs/evidence/cross-round-v03-live-20260802T041600Z.json",
    reportVersion: "herpetarium-cross-round-fixture-canary-report@0.1",
    generatedAt: "2026-08-02T04:37:50.240Z",
    reportContentHash:
      "98b8f0c555be673e2186548f5002b0a69f69dde8a9348dd16430cd4059864eae",
    fixtureInputHash:
      "5bfd4ff432ab1c6c76fb4be5790e1ea7dc5b05d5180ae719b84424d76ead5e73",
    runnerSourceHash:
      "25c909ee9048f8ff98d6460c6888f156b968416fb10d3e56cf1949a168d9de44",
    gitCommitSha: null,
    preservationScope:
      "parsed evidence, evaluation, route, usage, and timestamps only; the exact raw assistant response text and hidden reasoning were not stored",
    exactReproducibility:
      "not established: runner gitCommitSha is null, imported evaluator/parser source hashes are absent, and raw assistant text is unavailable",
  },
  instrumentIdentity: {
    protocolVersion: "cross-round-referent-evidence@0.3-probe",
    policyId: "cross-round-referent-evidence-veto@2026-08-01",
    policyHash:
      "0dde8a93748fea551eb4ea79ae60e6a02733d65719d687a5f2ec4fb94e958be7",
    auditorPromptHash:
      "fe2b98f44292ddd2b212837340b58d7528f839a4babbc19b9b2ddec047e8c476",
    auditorBatchSize: 3,
    substrateVersion: "0.5.0",
  },
  route: {
    provider: "openrouter",
    model: "deepseek/deepseek-v4-flash-0731",
    upstream: "deepinfra",
    allowFallbacks: false,
    reasoningEffort: "xhigh",
    wireReasoningEffort: "max",
  },
  repeatCount: 1,
  releaseBoundarySatisfied: false,
  /**
   * Exact transcription of the parsed report cells. Each `grid` entry is
   * [slot, sharedReferent, publicClue, strength]; omitted slots were parsed as
   * none/null/null. This is parsed evidence, not preserved raw assistant text.
   */
  cases: [
    {
      caseId: "red-production-incident-2026-08-01",
      incident: "CROSS_ROUND_COLUMN_LEAK_2026_08_01",
      kind: "exact_shared_production_incident",
      ledger: { 1: ["Aggregate"], 2: [], 3: ["Bengal"], 4: ["Firetruck"] },
      clues: ["blast", "orange", "ascent"],
      intendedCode: [1, 3, 4],
      grid: [
        {
          clue: "blast",
          edges: [
            [1, "quarry", "Aggregate", "plausible"],
            [4, "fire", "Firetruck", "strong"],
          ],
        },
        {
          clue: "orange",
          edges: [
            [1, "fruit", "Aggregate", "weak"],
            [3, "tiger", "Bengal", "strong"],
            [4, "fire", "Firetruck", "plausible"],
          ],
        },
        {
          clue: "ascent",
          edges: [
            [3, "cat", "Bengal", "weak"],
            [4, "ladder", "Firetruck", "plausible"],
          ],
        },
      ],
      codeHypotheses: [
        [[4, 3, 2], "plausible"],
        [[1, 3, 4], "plausible"],
      ],
      observedOutcome: "hard_veto",
      requiredOutcome: "hard_veto",
      met: true,
      reasoningTokens: 27_116,
      latencyMs: 365_453,
    },
    {
      caseId: "blue-production-incident-2026-08-01",
      incident: "CROSS_ROUND_COLUMN_LEAK_BLUE_2026_08_01",
      kind: "exact_shared_production_incident",
      ledger: { 1: ["crown"], 2: ["pillow"], 3: ["telescope"], 4: [] },
      clues: ["treetop", "turret", "nebula"],
      intendedCode: [4, 1, 3],
      grid: [
        { clue: "treetop", edges: [[1, "tree", "crown", "strong"]] },
        {
          clue: "turret",
          edges: [
            [2, "fort", "pillow", "plausible"],
            [3, "warship", "telescope", "weak"],
          ],
        },
        {
          clue: "nebula",
          edges: [
            [2, "cloud", "pillow", "weak"],
            [3, "astronomy", "telescope", "strong"],
          ],
        },
      ],
      codeHypotheses: [[[1, 2, 3], "plausible"]],
      observedOutcome: "pass",
      requiredOutcome: "hard_veto",
      met: false,
      /** The single cell whose absence carries the whole miss. */
      missedCell: {
        clue: "turret",
        slot: 1,
        publicClue: "crown",
        expectedSharedReferent: "castle",
        reportedStrength: "none",
      },
      reasoningTokens: 25_261,
      latencyMs: 337_436,
    },
    {
      caseId: "synthetic-opaque-negative-control",
      kind: "synthetic_non_research_negative_control",
      /**
       * Hand-authored AFTER the incident. Not held-out and not calibration.
       * Required to PASS only as a mechanical check against an always-veto
       * evaluator; its pass establishes neither safety nor non-leakage.
       *
       * AND IT HAS ALMOST NO POWER even for that. Across the same 1944-config
       * sweep it hard-vetoes in 0 configurations, so "the shaped input passed"
       * discriminates nothing about threshold choice. Note also that the
       * auditor INVENTED kettle->slot 4 via "red" at STRONG and sable->slot 3
       * via "animal" at plausible; it passed only because those spurious cells
       * landed off the intended positions. Placement luck, not opacity.
       */
      ledger: { 1: ["Aggregate"], 2: [], 3: ["Bengal"], 4: ["Firetruck"] },
      clues: ["kettle", "meridian", "sable"],
      intendedCode: [1, 3, 4],
      grid: [
        {
          clue: "kettle",
          edges: [
            [1, "pot", "Aggregate", "weak"],
            [4, "red", "Firetruck", "strong"],
          ],
        },
        { clue: "meridian", edges: [[3, "line", "Bengal", "weak"]] },
        {
          clue: "sable",
          edges: [
            [1, "black", "Aggregate", "weak"],
            [3, "animal", "Bengal", "plausible"],
            [4, "color", "Firetruck", "weak"],
          ],
        },
      ],
      codeHypotheses: [
        [[4, 2, 3], "plausible"],
        [[4, 3, 1], "weak"],
        [[1, 2, 3], "weak"],
      ],
      observedOutcome: "pass",
      requiredOutcome: "pass",
      met: true,
      spuriousStrongCells: 1,
      reasoningTokens: 38_662,
      latencyMs: 568_535,
    },
  ],
  /**
   * ~5.6 to ~9.5 minutes per audit at 25k-39k reasoning tokens. Recorded
   * because it bounds where this instrument can live: it is not a runtime gate
   * in a game seated with humans at these latencies, whatever its accuracy.
   */
  latencyRangeMs: [337_436, 568_535],
  doesNotEstablish: [
    "any population detection or error rate, or calibration",
    "repeat stability: n = 1 cannot estimate it",
    "that any successor instrument would do better; nothing here predicts that",
  ],
} as const;

/**
 * Product-runtime interlock for the current cross-round auditor.
 *
 * This is deliberately derived from the latest explicit release-boundary
 * evidence rather than from a runtime environment default. Turning it true
 * therefore requires changing the substrate evidence record under review,
 * not merely toggling product configuration.
 */
export const CROSS_ROUND_RUNTIME_ENFORCEMENT_RELEASED =
  CROSS_ROUND_V03_LIVE_BOUNDARY_2026_08_02.releaseBoundarySatisfied;

/**
 * The four-way counterfactual that localises the Blue failure, computed from
 * the verbatim grid above by the REAL evaluator at the REAL published
 * thresholds. Provider-free and exactly reproducible.
 *
 * HONEST LABEL: A is the observed reply. B, C and D are HAND-AUTHORED
 * counterfactuals — they are tier-shape probes of the evaluator, and they are
 * NOT evidence about what the model would return. Their only claim is about
 * which conjunct binds.
 *
 *   A  observed reply, as returned .................. pass
 *   B  grid repaired (turret->1 plausible) only ..... pass
 *   C  credible set repaired ([4,1,3] added) only ... soft_regenerate_once
 *   D  both repaired ................................ hard_veto
 *
 * Both conjuncts are individually necessary and neither alone is sufficient.
 * C is the informative one: recovering only the credible set would still have
 * earned one bounded regeneration, so the credible-set layer is the binding
 * constraint on Blue while the evidence layer is what upgrades a regeneration
 * to a veto. Any successor that repairs only the grid is answering the wrong
 * half.
 */
export const CROSS_ROUND_V03_BLUE_COUNTERFACTUALS_2026_08_02 = {
  status: "evaluator_tier_shape_probe",
  computedAt: "2026-08-02",
  provenance: "computed offline from CROSS_ROUND_V03_LIVE_BOUNDARY_2026_08_02",
  isModelEvidence: false,
  outcomes: {
    observed: "pass",
    gridRepairedOnly: "pass",
    credibleSetRepairedOnly: "soft_regenerate_once",
    bothRepaired: "hard_veto",
  },
  thresholdSweep: {
    /** Every legal combination of the published threshold fields. */
    configurationsSwept: 1944,
    redHardVetoes: 840,
    blueHardVetoes: 0,
    controlHardVetoes: 0,
    conclusion:
      "no legal setting of the published threshold fields reaches the Blue reply, because the fixed decision logic gates every tier on intended-code credible-set membership and the intended code is absent. This rules out a threshold-only repair; it does not distinguish an elicitation change from a redesign of that fixed membership requirement.",
  },
  /**
   * Code-match breadth for the rejected evidence-only clause on the stated
   * sparse three-cell grid. This is not a general lower bound: denser grids
   * match more codes. For this reply shape, of the 24 legal codes:
   */
  evidenceOnlyCodeMatchBreadth: {
    atLeastOneStrongEdge: { codes: 13, of: 24, rate: 0.5417 },
    atLeastTwoStrongEdges: { codes: 4, of: 24, rate: 0.1667 },
    atLeastThreeStrongEdges: { codes: 1, of: 24, rate: 0.0417 },
    note: "confirms the sparse-grid figure recorded in CROSS_ROUND_REFERENT_EVIDENCE_VETO_POLICY. Relaxing to one strong edge would veto 54% of possible intended codes on this reply shape, whatever the auditor's quality; denser grids can match more.",
  },
} as const;

/**
 * Expected hashes for the golden artifacts under this substrate version.
 * Regenerate with `--emit-hashes` on an intentional version bump only.
 *
 * Regenerated for the 0.3.0 -> 0.4.0 bump and, before it, the 0.2.0 -> 0.3.0
 * bump, both for exactly the same reason
 * as the 0.1.0 -> 0.2.0 bump below: `sensoryAnchorCompiledHash` is
 * substrate-scoped by construction, no prompt text changed, and the two
 * artifact CONTENT hashes are unmoved, so artifacts minted at 0.1.0 still
 * verify and no EvaluationRecord is invalidated.
 *
 * Regenerated for the 0.1.0 -> 0.2.0 bump. Exactly ONE value moved, and the
 * reason matters when reading old telemetry:
 * - `sensoryAnchorCompiledHash` DID change. `compileGenomePrompts` folds
 *   `SUBSTRATE_VERSION` into `CompiledGenomePrompts`, so every compiled-prompt
 *   hash is substrate-scoped by design. No prompt text changed; compare
 *   `genomeHash` (genome-only) across the bump, not this value.
 * - the two artifact CONTENT hashes did not change, because
 *   `artifactContentHash` covers only name/version/game/genome/provenance.
 *   Artifacts minted at 0.1.0 still verify, and `evaluateSeating` binds the
 *   content hash, so no existing EvaluationRecord is invalidated by the bump.
 */
export const EXPECTED_HASHES = {
  sensoryAnchorContentHash:
    "274364bb6f5066686a81a9ee4bfd6e6b00de04290630b2c8d3214e0b3531e09d",
  sensoryAnchorCompiledHash:
    "793ae98c07b7fd33f1cfab3a56f67477e20ba2a8126b5c6f334dd151b1be0a7f",
  intermediateHopsContentHash:
    "6aacc103d362665edd1d9111268c1575b40eff387dcf385dbe936a453bfb7ccb",
} as const;
