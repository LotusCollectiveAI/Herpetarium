import { randomUUID } from "crypto";
import type {
  AnchorABReport,
  ArenaCoachSlot,
  ArenaConfig,
  ArenaResult,
  CoachConfig,
  CoachDecision,
  CoachMatchmakingNote,
  CoachPatchBundle,
  CoachProposal,
  CoachReviewResult,
  CoachRollbackTrigger,
  CoachRun,
  CoachSprint,
  CoachResearchMetrics,
  CompiledGenomePrompts,
  DeceptionCategory,
  DeliberationPatternVector,
  GenomeModules,
  ScratchNotesSnapshot,
  SprintEvaluation,
} from "@shared/schema";
import { DEFAULT_GAME_RULES, LONGFORM_ARENA_RULES, type GameRules } from "@shared/schema";
import { runBoundedSettledPool } from "./boundedPool";
import {
  applyCoachPatchBundle,
  applySprintResultToCoachState,
  cloneGenome,
  coachAutopsy,
  createCoachRun,
  createCoachState,
  mergeBeliefUpdates,
  persistPatchIndexRecord,
  runCoachSprint,
  SEED_GENOME_TEMPLATES,
  type CoachState,
  type CoachStructuredPatch,
  type SprintResult,
} from "./coachLoop";
import { runAnchorBatch, resolveAnchorConfig } from "./anchorEvaluator";
import { coachCommitReview, coachProposePatch } from "./coachPrompts";
import { buildDisclosureText, type DisclosureBuildInput } from "./disclosure";
import { compileGenomePrompts } from "./genomeCompiler";
import {
  createPairingHistory,
  recordPairing,
  selectPairings,
  type MatchmakingBucket,
  type MatchmakingPairing,
  type PairingHistory,
} from "./matchmaking";
import { analyzeSprintMatches } from "./researchAnalyzer";
import { evaluatePendingPatchReviews } from "./rollbackEvaluator";
import { evaluateSprint } from "./sprintEvaluator";
import { storage } from "./storage";

const ARENA_SOURCE = "arena";
const MATCHMAKING_BUCKET_ORDER: MatchmakingBucket[] = ["near_peer", "diagnostic", "novelty", "baseline"];
const DECEPTION_CATEGORIES: DeceptionCategory[] = [
  "behavior_rationale_divergence",
  "selective_omission",
  "observation_sensitivity",
];
const ARENA_LONGFORM_RULES_ENABLED = /^(1|true|yes|on)$/i.test(process.env.ARENA_LONGFORM_RULES_ENABLED || "");

void coachAutopsy;

interface ArenaRuntimeSlot {
  slotIndex: number;
  runId: string;
  seedGenome: GenomeModules;
  state: CoachState;
  scratchNotes: ScratchNotesSnapshot | null;
  wins: number;
  losses: number;
  draws: number;
}

interface SprintOpponentContext {
  opponentSlotIndex: number;
  runId: string;
  genome: GenomeModules;
  bucket: MatchmakingBucket;
  reason: string;
  appearanceCount: number;
}

interface PairingResult {
  slotA: number;
  slotB: number;
  bucket: MatchmakingBucket;
  reason: string;
  resultA: SprintResult;
  resultB: SprintResult;
  actualMatchIds: number[];
  roleSwapGroupId: string;
  opponentGenomeForA: GenomeModules;
  opponentGenomeForB: GenomeModules;
  opponentRunIdForA: string;
  opponentRunIdForB: string;
  scratchNotesAfterA?: ScratchNotesSnapshot | null;
  scratchNotesAfterB?: ScratchNotesSnapshot | null;
}

type ProposalPatchEdit = NonNullable<CoachProposal["patch"]>["edits"][number];

function logArena(message: string) {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${ARENA_SOURCE}] ${message}`);
}

function countSentences(text: string): number {
  return text
    .split(/[.!?]+/)
    .map((fragment) => fragment.trim())
    .filter(Boolean)
    .length;
}

function computeGenomeCharCount(genome: GenomeModules): number {
  return Object.values(genome).reduce((total, value) => total + value.length, 0);
}

function computeGenomeSentenceCount(genome: GenomeModules): number {
  return Object.values(genome).reduce((total, value) => total + countSentences(value), 0);
}

function createIncompleteAnchorReport(): AnchorABReport {
  return {
    incomplete: true,
    anchorsUsed: [],
    incumbentWinRate: 0,
    candidateWinRate: 0,
    delta: 0,
    incumbentOwnDecodeRate: 0,
    candidateOwnDecodeRate: 0,
    ownDecodeDelta: 0,
    incumbentOurInterceptRate: 0,
    candidateOurInterceptRate: 0,
    ourInterceptDelta: 0,
    incumbentMatchIds: [],
    candidateMatchIds: [],
    perAnchor: [],
  };
}

function toStructuredPatch(edit: ProposalPatchEdit): CoachStructuredPatch {
  return {
    targetModule: edit.targetModule,
    oldValue: edit.oldValue,
    newValue: edit.newValue,
    rationale: edit.rationale,
    expectedEffect: edit.expectedEffect,
    ...(edit.delta ? { delta: edit.delta } : {}),
  };
}

function clonePatchBundle(patchBundle: CoachProposal["patch"]): CoachProposal["patch"] {
  if (!patchBundle) {
    return null;
  }

  return {
    ...patchBundle,
    edits: patchBundle.edits.map((edit) => ({
      ...edit,
      ...(edit.delta ? { delta: { ...edit.delta } } : {}),
    })),
  };
}

function buildFallbackEvaluation(
  runId: string,
  sprintResult: SprintResult,
  genome: GenomeModules,
  compiledPrompts: CompiledGenomePrompts,
): SprintEvaluation {
  const wins = sprintResult.matchResults.filter((match) => match.winner === match.ourTeam).length;
  const losses = sprintResult.matchResults.filter((match) => match.winner !== null && match.winner !== match.ourTeam).length;
  const draws = sprintResult.matchResults.filter((match) => match.winner === null).length;
  const totalRounds = sprintResult.matchResults.reduce((sum, match) => sum + match.totalRounds, 0);
  const compiledPromptChars = {
    cluegiver: compiledPrompts.prompts.cluegiver.charCount,
    own_guesser: compiledPrompts.prompts.own_guesser.charCount,
    interceptor: compiledPrompts.prompts.interceptor.charCount,
    own_deliberator: compiledPrompts.prompts.own_deliberator.charCount,
    intercept_deliberator: compiledPrompts.prompts.intercept_deliberator.charCount,
    coach: compiledPrompts.prompts.coach.charCount,
  };

  return {
    runId,
    sprintNumber: sprintResult.sprintNumber,
    training: {
      matchIds: sprintResult.matchResults.map((match) => match.matchId),
      wins,
      losses,
      draws,
      winRate: sprintResult.winRate,
      meanRoundsPerMatch: sprintResult.matchResults.length > 0 ? Number((totalRounds / sprintResult.matchResults.length).toFixed(2)) : 0,
    },
    execution: {
      ownDecodeRate: 0,
      opponentInterceptRateAgainstUs: 0,
      ourInterceptRate: 0,
      miscommunicationRate: 0,
      catastrophicAsymmetryRate: 0,
    },
    deliberation: {
      ownConsensusRate: 0,
      interceptConsensusRate: 0,
      timeoutRate: 0,
      fallbackRate: 0,
      meanDeliberationExchanges: 0,
    },
    leakage: {
      meanLeakageScore: 0,
      maxLeakageScore: 0,
      keywordMentionRate: 0,
      codePatternRate: 0,
    },
    sideBalance: {
      amberWinRate: 0,
      blueWinRate: 0,
      sideGap: 0,
      amberMatchCount: sprintResult.matchResults.filter((match) => match.ourTeam === "amber").length,
      blueMatchCount: sprintResult.matchResults.filter((match) => match.ourTeam === "blue").length,
    },
    complexity: {
      genomeCharCount: computeGenomeCharCount(genome),
      genomeSentenceCount: computeGenomeSentenceCount(genome),
      compiledPromptChars,
      compiledPromptTotalChars: Object.values(compiledPromptChars).reduce((sum, value) => sum + value, 0),
      deltaGenomeChars: null,
      deltaCompiledPromptChars: null,
    },
    pendingPatchReviews: [],
    policyNotices: [],
    evidenceLines: [
      "Sprint evaluation fallback was used because the primary evaluator failed for this sprint.",
      `Observed sprint record ${sprintResult.record} with win rate ${sprintResult.winRate.toFixed(4)} across ${sprintResult.matchResults.length} matches.`,
    ],
    perMatchSummaries: [],
  };
}

function cloneBeliefs(state: CoachState): CoachState["beliefs"] {
  return state.beliefs.map((belief) => ({ ...belief }));
}

function summarizeSprint(matchResults: SprintResult["matchResults"]): Pick<SprintResult, "record" | "winRate"> {
  const wins = matchResults.filter((match) => match.winner === match.ourTeam).length;
  const losses = matchResults.filter((match) => match.winner !== null && match.winner !== match.ourTeam).length;
  const draws = matchResults.filter((match) => match.winner === null).length;
  const completedMatches = matchResults.length;

  return {
    record: draws > 0 ? `${wins}-${losses}-${draws}` : `${wins}-${losses}`,
    winRate: completedMatches > 0 ? wins / completedMatches : 0,
  };
}

function toOpponentPerspective(
  result: SprintResult,
  sprintNumber: number,
): SprintResult {
  const matchResults = result.matchResults.map((match) => ({
    ...match,
    ourTeam: (match.ourTeam === "amber" ? "blue" : "amber") as "amber" | "blue",
    ourWhiteTokens: match.oppWhiteTokens,
    ourBlackTokens: match.oppBlackTokens,
    oppWhiteTokens: match.ourWhiteTokens,
    oppBlackTokens: match.ourBlackTokens,
    roundSummaries: [...match.roundSummaries],
  }));
  const summary = summarizeSprint(matchResults);

  return {
    sprintNumber,
    matchResults,
    record: summary.record,
    winRate: summary.winRate,
  };
}

function combineSprintResults(sprintNumber: number, results: SprintResult[]): SprintResult {
  const matchResults = results.flatMap((result) => result.matchResults.map((match) => ({
    ...match,
    roundSummaries: [...match.roundSummaries],
  })));
  const summary = summarizeSprint(matchResults);

  return {
    sprintNumber,
    matchResults,
    record: summary.record,
    winRate: summary.winRate,
  };
}

function buildSprintPairings(
  slots: ArenaRuntimeSlot[],
  matchesPerSprint: number,
  history: PairingHistory,
  config: ArenaConfig,
): MatchmakingPairing[] {
  return selectPairings(
    slots.map(toArenaCoachSlot),
    matchesPerSprint,
    config.matchmaking,
    history,
  );
}

function resolveArenaGameRules(config: ArenaConfig): GameRules {
  if (config.gameRules) {
    return { ...config.gameRules };
  }

  return ARENA_LONGFORM_RULES_ENABLED
    ? { ...LONGFORM_ARENA_RULES }
    : { ...DEFAULT_GAME_RULES };
}

async function collectExemplarClues(
  runId: string,
  limit = 3,
): Promise<string[]> {
  try {
    const sprints = await storage.getCoachSprints(runId);
    if (sprints.length === 0) return [];

    const latestSprint = sprints[sprints.length - 1];
    const matchIds = latestSprint.matchIds || [];
    if (matchIds.length === 0) return [];

    const matchRecords = await storage.getMatchesByIds(matchIds);
    if (matchRecords.length === 0) return [];

    // Determine the opponent's focal side in each match
    const opponentFocalTeams = new Map<number, "amber" | "blue">();
    for (const match of matchRecords) {
      // The opponent's focal team: if match.runId === our runId, opponent is on the other side
      if (match.runId === runId) {
        opponentFocalTeams.set(match.id, match.focalTeam === "amber" ? "blue" : "amber");
      } else if (match.opponentRunId === runId) {
        opponentFocalTeams.set(match.id, match.focalTeam || "amber");
      } else {
        // This run is the opponent; the opponent's focal side is focalTeam
        opponentFocalTeams.set(match.id, match.focalTeam === "amber" ? "blue" : "amber");
      }
    }

    const rounds = await storage.getMatchRoundsForMatches(matchIds);
    const exemplars: string[] = [];

    // Prefer recent rounds, collect from opponent's team side
    const sortedRounds = [...rounds].sort((a, b) => b.roundNumber - a.roundNumber);

    for (const round of sortedRounds) {
      if (exemplars.length >= limit) break;

      const opponentTeam = opponentFocalTeams.get(round.matchId);
      if (!opponentTeam || round.team !== opponentTeam) continue;

      const clues = round.clues;
      if (!Array.isArray(clues) || clues.length === 0) continue;

      const decoded = round.ownCorrect ? "decoded" : "failed decode";
      const intercepted = round.intercepted ? "intercepted" : "not intercepted";
      exemplars.push(`R${round.roundNumber}: clues [${clues.join(", ")}] — ${decoded}, ${intercepted}`);
    }

    return exemplars;
  } catch (error) {
    logArena(`collectExemplarClues failed for run ${runId}: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

async function buildDisclosureBundle(
  opponents: SprintOpponentContext[],
  foiaEnabled: boolean,
  foiaDelaySprints: number,
  currentSprint: number,
): Promise<string | undefined> {
  if (!foiaEnabled || opponents.length === 0) {
    return undefined;
  }

  // Deduplicate by opponent runId
  const uniqueOpponents = Array.from(
    new Map(opponents.map((opponent) => [opponent.runId, opponent])).values(),
  );

  const sections: string[] = [];

  for (const [index, opponent] of uniqueOpponents.entries()) {
    let latestOpponentSprint: CoachSprint | undefined;
    try {
      const opponentSprints = await storage.getCoachSprints(opponent.runId);
      if (opponentSprints.length > 0) {
        latestOpponentSprint = opponentSprints[opponentSprints.length - 1];
      }
    } catch {
      // Continue without opponent sprint data
    }

    const exemplarClues = await collectExemplarClues(opponent.runId);

    const input: DisclosureBuildInput = {
      opponentRunId: opponent.runId,
      currentSprint,
      foiaEnabled,
      foiaDelaySprints,
      latestOpponentSprint,
      exemplarClues,
      currentGenome: opponent.genome,
    };

    const text = buildDisclosureText(input);
    if (!text) continue;

    const prefix = uniqueOpponents.length > 1 ? `Opponent ${index + 1}\n` : "";
    sections.push(`${prefix}${text}`);
  }

  return sections.length > 0 ? sections.join("\n\n") : undefined;
}

async function buildArenaBriefing(
  slots: ArenaRuntimeSlot[],
  sprintNumber: number,
): Promise<string> {
  const lines: string[] = [];

  // Section 1: Module mutation frequency
  const moduleCounts = new Map<string, number>();
  for (const slot of slots) {
    try {
      const sprints = await storage.getCoachSprints(slot.runId);
      const currentSprint = sprints.find((s) => s.sprintNumber === sprintNumber);
      if (currentSprint?.patchBundle && currentSprint.decision === "commit") {
        const bundle = currentSprint.patchBundle;
        for (const edit of bundle.edits) {
          moduleCounts.set(edit.targetModule, (moduleCounts.get(edit.targetModule) || 0) + 1);
        }
      }
    } catch {
      // Continue
    }
  }

  if (moduleCounts.size > 0) {
    const sorted = Array.from(moduleCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3);
    lines.push("Module edits this sprint: " + sorted.map(([mod, count]) => `${mod} (${count})`).join(", "));
  }

  // Section 2: Biggest movers (compare win rates sprint-over-sprint)
  const movers: Array<{ label: string; delta: number }> = [];
  for (const slot of slots) {
    try {
      const evals = await storage.getSprintEvaluations(slot.runId);
      const current = evals.find((e) => e.sprintNumber === sprintNumber);
      const previous = evals.find((e) => e.sprintNumber === sprintNumber - 1);
      if (current && previous) {
        const currentWinRate = current.evaluation.training.winRate;
        const previousWinRate = previous.evaluation.training.winRate;
        const delta = currentWinRate - previousWinRate;
        movers.push({ label: `slot${slot.slotIndex}`, delta });
      }
    } catch {
      // Continue
    }
  }

  if (movers.length > 0) {
    movers.sort((a, b) => b.delta - a.delta);
    const topImprover = movers[0];
    const topDecliner = movers[movers.length - 1];
    if (topImprover.delta > 0) {
      lines.push(`Biggest improver: ${topImprover.label} (+${topImprover.delta.toFixed(3)} win rate)`);
    }
    if (topDecliner.delta < 0) {
      lines.push(`Biggest decliner: ${topDecliner.label} (${topDecliner.delta.toFixed(3)} win rate)`);
    }
  }

  // Section 3: Rollback trigger patterns
  const triggerCounts = new Map<string, number>();
  for (const slot of slots) {
    try {
      const patches = await storage.getPatchHistory(slot.runId);
      for (const patch of patches) {
        if (patch.sprintNumber !== sprintNumber) continue;
        if (patch.delta?.rollbackTriggers) {
          for (const trigger of patch.delta.rollbackTriggers) {
            const desc = typeof trigger === "string" ? trigger : trigger.description || "unnamed trigger";
            triggerCounts.set(desc, (triggerCounts.get(desc) || 0) + 1);
          }
        }
      }
    } catch {
      // Continue
    }
  }

  if (triggerCounts.size > 0) {
    const topTriggers = Array.from(triggerCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 2);
    lines.push("Active rollback triggers: " + topTriggers.map(([desc, count]) => `"${desc}" (${count})`).join(", "));
  }

  // Section 4: Delayed successful patch summaries from other slots (1-sprint delay)
  if (sprintNumber >= 2) {
    const delayedHighlights: string[] = [];
    for (const slot of slots) {
      try {
        const sprints = await storage.getCoachSprints(slot.runId);
        const priorSprint = sprints.find((s) => s.sprintNumber === sprintNumber - 1);
        if (priorSprint?.decision === "commit" && priorSprint.patchBundle) {
          // Check if the patch was reviewed as clear, or no trigger fired
          const reviews = await storage.getPatchReviews(slot.runId);
          const patchReview = reviews.find((r) =>
            r.committedSprint === sprintNumber - 1 &&
            r.proposalId === priorSprint.proposal?.proposalId
          );
          const isSuccess = patchReview?.status === "clear" || !patchReview;
          if (isSuccess && priorSprint.patchBundle.summary) {
            delayedHighlights.push(`slot${slot.slotIndex}: ${priorSprint.patchBundle.summary}`);
          }
        }
      } catch {
        // Continue
      }
    }
    if (delayedHighlights.length > 0) {
      lines.push("Successful patches last sprint:");
      for (const highlight of delayedHighlights.slice(0, 3)) {
        lines.push(`  ${highlight}`);
      }
    }
  }

  return lines.length > 0 ? lines.join("\n") : "";
}

function summarizeMatchmakingNotes(opponents: SprintOpponentContext[]): CoachMatchmakingNote[] | undefined {
  if (opponents.length === 0) {
    return undefined;
  }

  const notesByKey = new Map<string, CoachMatchmakingNote>();

  for (const opponent of opponents) {
    const key = [
      opponent.bucket,
      opponent.reason,
      opponent.runId,
      opponent.opponentSlotIndex,
    ].join("|");
    const existing = notesByKey.get(key);

    if (existing) {
      existing.appearanceCount += opponent.appearanceCount;
      continue;
    }

    notesByKey.set(key, {
      bucket: opponent.bucket,
      reason: opponent.reason,
      opponentRunId: opponent.runId,
      opponentSlotIndex: opponent.opponentSlotIndex,
      appearanceCount: opponent.appearanceCount,
    });
  }

  return Array.from(notesByKey.values());
}

function summarizeResearchMetrics(
  sprintResult: SprintResult,
  opponents: SprintOpponentContext[],
): CoachResearchMetrics {
  const wins = sprintResult.matchResults.filter((match) => match.winner === match.ourTeam).length;
  const losses = sprintResult.matchResults.filter((match) => match.winner !== null && match.winner !== match.ourTeam).length;
  const draws = sprintResult.matchResults.filter((match) => match.winner === null).length;
  const matchmaking = summarizeMatchmakingNotes(opponents);

  return {
    completedMatches: sprintResult.matchResults.length,
    wins,
    losses,
    draws,
    matchmaking,
  };
}

function averageDeliberationPatterns(patterns: DeliberationPatternVector[]): DeliberationPatternVector {
  if (patterns.length === 0) {
    return {
      meanMessageLength: 0,
      hedgeRate: 0,
      disagreementRate: 0,
      revisionRate: 0,
      phraseOverlap: 0,
    };
  }

  const totals = patterns.reduce((acc, pattern) => ({
    meanMessageLength: acc.meanMessageLength + pattern.meanMessageLength,
    hedgeRate: acc.hedgeRate + pattern.hedgeRate,
    disagreementRate: acc.disagreementRate + pattern.disagreementRate,
    revisionRate: acc.revisionRate + pattern.revisionRate,
    phraseOverlap: acc.phraseOverlap + pattern.phraseOverlap,
  }), {
    meanMessageLength: 0,
    hedgeRate: 0,
    disagreementRate: 0,
    revisionRate: 0,
    phraseOverlap: 0,
  });

  return {
    meanMessageLength: Number((totals.meanMessageLength / patterns.length).toFixed(2)),
    hedgeRate: Number((totals.hedgeRate / patterns.length).toFixed(4)),
    disagreementRate: Number((totals.disagreementRate / patterns.length).toFixed(4)),
    revisionRate: Number((totals.revisionRate / patterns.length).toFixed(4)),
    phraseOverlap: Number((totals.phraseOverlap / patterns.length).toFixed(4)),
  };
}

function mergeResearchAnalyses(
  analyses: Array<Awaited<ReturnType<typeof analyzeSprintMatches>>>,
): Pick<CoachResearchMetrics, "deception" | "deliberationPatterns"> {
  const deception = DECEPTION_CATEGORIES.reduce<NonNullable<CoachResearchMetrics["deception"]>>((acc, category) => {
    let totalMatches = 0;
    let weightedScoreSum = 0;
    let maxScore = 0;
    let totalFindings = 0;

    for (const analysis of analyses) {
      const categoryAggregate = analysis.aggregateDeception[category];
      const matchCount = analysis.deceptionReports.length;
      totalMatches += matchCount;
      weightedScoreSum += categoryAggregate.meanScore * matchCount;
      maxScore = Math.max(maxScore, categoryAggregate.maxScore);
      totalFindings += categoryAggregate.totalFindings;
    }

    acc[category] = {
      meanScore: Number((totalMatches > 0 ? weightedScoreSum / totalMatches : 0).toFixed(4)),
      maxScore: Number(maxScore.toFixed(4)),
      totalFindings,
    };

    return acc;
  }, {
    behavior_rationale_divergence: { meanScore: 0, maxScore: 0, totalFindings: 0 },
    selective_omission: { meanScore: 0, maxScore: 0, totalFindings: 0 },
    observation_sensitivity: { meanScore: 0, maxScore: 0, totalFindings: 0 },
  });

  const deliberationPatterns = averageDeliberationPatterns(
    analyses.flatMap((analysis) => analysis.deliberationPatterns),
  );

  return {
    deception,
    deliberationPatterns,
  };
}

async function buildResearchMetrics(
  sprintResult: SprintResult,
  opponents: SprintOpponentContext[],
): Promise<CoachResearchMetrics> {
  const baseMetrics = summarizeResearchMetrics(sprintResult, opponents);
  const matchIdsByTeam: Record<"amber" | "blue", number[]> = {
    amber: [],
    blue: [],
  };

  for (const match of sprintResult.matchResults) {
    matchIdsByTeam[match.ourTeam].push(match.matchId);
  }

  const analyses: Array<Awaited<ReturnType<typeof analyzeSprintMatches>>> = [];

  for (const team of ["amber", "blue"] as const) {
    const teamMatchIds = Array.from(new Set(matchIdsByTeam[team]));
    if (teamMatchIds.length === 0) continue;

    try {
      analyses.push(await analyzeSprintMatches(teamMatchIds, team));
    } catch (error) {
      logArena(
        `Research analysis failed for ${team} sprint matches ${teamMatchIds.join(", ")}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  if (analyses.length === 0) {
    return baseMetrics;
  }

  return {
    ...baseMetrics,
    ...mergeResearchAnalyses(analyses),
  };
}

function updateSlotRecord(slot: ArenaRuntimeSlot, sprintResult: SprintResult) {
  for (const match of sprintResult.matchResults) {
    if (match.winner === null) {
      slot.draws += 1;
    } else if (match.winner === match.ourTeam) {
      slot.wins += 1;
    } else {
      slot.losses += 1;
    }
  }
}

function shouldInjectFoia(sprintsCompleted: number, foiaDelaySprints: number): boolean {
  return sprintsCompleted >= foiaDelaySprints;
}

function buildPerMatchCoachConfig(config: ArenaConfig, opponentGenome: GenomeModules): CoachConfig {
  return {
    ...config.coachConfig,
    matchesPerSprint: 1,
    sprintConcurrency: 1,
    totalSprints: 1,
    opponentGenome: cloneGenome(opponentGenome),
  };
}

function buildAutopsyCoachConfig(config: ArenaConfig, opponentGenome?: GenomeModules): CoachConfig {
  return {
    ...config.coachConfig,
    matchesPerSprint: config.matchesPerSprint,
    sprintConcurrency: 1,
    totalSprints: config.totalSprints,
    opponentGenome: cloneGenome(opponentGenome || config.seedGenomes[0]),
  };
}

export async function runPairedCoachMatches(
  left: ArenaRuntimeSlot,
  right: ArenaRuntimeSlot,
  config: ArenaConfig,
  sprintNumber: number,
  pairingIndex: number,
): Promise<PairingResult> {
  const roleSwapGroupId = randomUUID();
  const gameRules = resolveArenaGameRules(config);
  const coachConfig = buildPerMatchCoachConfig(config, right.state.genome);
  const baseSeedPrefix = `${left.state.teamId}-s${sprintNumber}-${pairingIndex + 1}`;

  // Track scratch notes per slot across both games.
  // Notes follow the slot, not the color.
  let leftNotes = left.scratchNotes?.notesText || undefined;
  let rightNotes = right.scratchNotes?.notesText || undefined;

  // Game 1: left plays amber, right plays blue
  const firstResult = await runCoachSprint(
    left.state,
    coachConfig,
    {
      opponentRunId: right.runId,
      opponentGenome: cloneGenome(right.state.genome),
      seedTag: `${pairingIndex + 1}-${baseSeedPrefix}-amber`,
      teamSequence: ["amber"],
      enablePostMatchReflection: true,
      teamScratchNotes: {
        ...(leftNotes ? { amber: leftNotes } : {}),
        ...(rightNotes ? { blue: rightNotes } : {}),
      },
      matchConfigOverrides: [{
        seed: `${baseSeedPrefix}-g1`,
        arenaId: config.arenaId,
        runId: left.runId,
        opponentRunId: right.runId,
        sprintNumber,
        matchKind: "training",
        roleSwapGroupId,
        focalTeam: "amber",
        gameRules,
      }],
    },
  );

  // After game 1: capture updated notes. Left was amber, right was blue.
  if (firstResult.finalScratchNotesByTeam?.amber) {
    leftNotes = firstResult.finalScratchNotesByTeam.amber.notesText;
  }
  if (firstResult.finalScratchNotesByTeam?.blue) {
    rightNotes = firstResult.finalScratchNotesByTeam.blue.notesText;
  }

  // Game 2: left plays blue, right plays amber (sides swap, notes follow slots)
  const secondResult = await runCoachSprint(
    left.state,
    coachConfig,
    {
      opponentRunId: right.runId,
      opponentGenome: cloneGenome(right.state.genome),
      seedTag: `${pairingIndex + 1}-${baseSeedPrefix}-blue`,
      teamSequence: ["blue"],
      enablePostMatchReflection: true,
      teamScratchNotes: {
        ...(rightNotes ? { amber: rightNotes } : {}),
        ...(leftNotes ? { blue: leftNotes } : {}),
      },
      matchConfigOverrides: [{
        seed: `${baseSeedPrefix}-g2`,
        arenaId: config.arenaId,
        runId: left.runId,
        opponentRunId: right.runId,
        sprintNumber,
        matchKind: "training",
        roleSwapGroupId,
        focalTeam: "blue",
        gameRules,
      }],
    },
  );

  // After game 2: left was blue, right was amber
  const leftFinalSnapshot = secondResult.finalScratchNotesByTeam?.blue
    ?? firstResult.finalScratchNotesByTeam?.amber
    ?? null;
  const rightFinalSnapshot = secondResult.finalScratchNotesByTeam?.amber
    ?? firstResult.finalScratchNotesByTeam?.blue
    ?? null;

  const resultA = combineSprintResults(sprintNumber, [firstResult, secondResult]);
  const resultB = combineSprintResults(sprintNumber, [
    toOpponentPerspective(firstResult, sprintNumber),
    toOpponentPerspective(secondResult, sprintNumber),
  ]);

  return {
    slotA: left.slotIndex,
    slotB: right.slotIndex,
    bucket: "baseline",
    reason: "",
    resultA,
    resultB,
    actualMatchIds: resultA.matchResults.map((match) => match.matchId),
    roleSwapGroupId,
    opponentGenomeForA: cloneGenome(right.state.genome),
    opponentGenomeForB: cloneGenome(left.state.genome),
    opponentRunIdForA: right.runId,
    opponentRunIdForB: left.runId,
    scratchNotesAfterA: leftFinalSnapshot,
    scratchNotesAfterB: rightFinalSnapshot,
  };
}

function getUniqueMatchIds(state: CoachState): number[] {
  return Array.from(new Set(
    state.sprintHistory.flatMap((sprint) => sprint.matchResults.map((match) => match.matchId)),
  ));
}

function formatBucketDistribution(pairings: MatchmakingPairing[]): string {
  const counts: Record<MatchmakingBucket, number> = {
    near_peer: 0,
    diagnostic: 0,
    novelty: 0,
    baseline: 0,
  };

  for (const pairing of pairings) {
    counts[pairing.bucket] += 1;
  }

  return MATCHMAKING_BUCKET_ORDER
    .filter((bucket) => counts[bucket] > 0)
    .map((bucket) => `${bucket}=${counts[bucket]}`)
    .join(", ");
}

async function persistArenaRunProgress(slot: ArenaRuntimeSlot): Promise<string | null> {
  const matchIds = getUniqueMatchIds(slot.state);
  const recordedCost = matchIds.length > 0
    ? await storage.getCumulativeCost(matchIds)
    : 0;
  const actualCostUsd = recordedCost > 0 ? recordedCost.toFixed(6) : null;

  await storage.updateCoachRun(slot.runId, {
    currentGenome: cloneGenome(slot.state.genome),
    currentBeliefs: cloneBeliefs(slot.state),
    currentSprint: slot.state.currentSprint,
    currentScratchNotes: slot.scratchNotes,
    actualCostUsd,
  });

  return actualCostUsd;
}

async function persistArenaSprintRecord(
  slot: ArenaRuntimeSlot,
  sprintResult: SprintResult,
  genomeBefore: GenomeModules,
  coachCycle: {
    decision: CoachDecision;
    proposal: CoachProposal;
    review: CoachReviewResult;
    anchorSummary: AnchorABReport | null;
  },
  disclosureText: string | undefined,
  opponents: SprintOpponentContext[],
): Promise<void> {
  const uniqueOpponentRunIds = Array.from(new Set(opponents.map((opponent) => opponent.runId)));
  const researchMetrics = await buildResearchMetrics(sprintResult, opponents);
  const legacyPatch = coachCycle.proposal.patch?.edits.length === 1
    ? toStructuredPatch(coachCycle.proposal.patch.edits[0])
    : null;

  await storage.createCoachSprint({
    runId: slot.runId,
    sprintNumber: sprintResult.sprintNumber,
    opponentRunId: uniqueOpponentRunIds.length === 1 ? uniqueOpponentRunIds[0] : null,
    matchIds: sprintResult.matchResults.map((match) => match.matchId),
    record: sprintResult.record,
    winRate: sprintResult.winRate.toFixed(6),
    genomeBefore: cloneGenome(genomeBefore),
    genomeAfter: cloneGenome(slot.state.genome),
    beliefsAfter: cloneBeliefs(slot.state),
    decision: coachCycle.decision,
    patch: legacyPatch,
    proposal: {
      ...coachCycle.proposal,
      review: { ...coachCycle.review },
      beliefUpdates: coachCycle.proposal.beliefUpdates.map((update) => ({ ...update })),
      patch: clonePatchBundle(coachCycle.proposal.patch),
    },
    anchorSummary: coachCycle.anchorSummary,
    patchBundle: clonePatchBundle(coachCycle.proposal.patch),
    disclosureText: disclosureText || null,
    researchMetrics,
    scratchNotesSnapshot: slot.scratchNotes,
  });

  await persistPatchIndexRecord(slot.runId, sprintResult, genomeBefore, slot.state, {
    decision: coachCycle.decision,
    patch: legacyPatch,
    patchBundle: clonePatchBundle(coachCycle.proposal.patch),
    proposalId: coachCycle.proposal.proposalId,
    reviewDueSprint: coachCycle.decision === "commit" && coachCycle.proposal.patch
      ? sprintResult.sprintNumber + computeReviewDelay(coachCycle.proposal.patch)
      : null,
  });
}

function computeReviewDelay(patch: CoachPatchBundle): number {
  let maxDelay = 1;
  for (const edit of patch.edits) {
    if (edit.delta?.rollbackTriggers) {
      for (const trigger of edit.delta.rollbackTriggers) {
        if (typeof trigger !== "string" && trigger.reviewAfterSprints && trigger.reviewAfterSprints > maxDelay) {
          maxDelay = trigger.reviewAfterSprints;
        }
      }
    }
  }
  return maxDelay;
}

function toArenaCoachSlot(slot: ArenaRuntimeSlot): ArenaCoachSlot {
  return {
    slotIndex: slot.slotIndex,
    runId: slot.runId,
    seedGenome: cloneGenome(slot.seedGenome),
    currentGenome: cloneGenome(slot.state.genome),
    wins: slot.wins,
    losses: slot.losses,
    draws: slot.draws,
  };
}

function parseSprintRecord(record: string): { wins: number; losses: number; draws: number } {
  const parts = record.split("-").map((value) => Number.parseInt(value, 10));

  return {
    wins: Number.isFinite(parts[0]) ? parts[0] : 0,
    losses: Number.isFinite(parts[1]) ? parts[1] : 0,
    draws: Number.isFinite(parts[2]) ? parts[2] : 0,
  };
}

function sortArenaRuns(runs: CoachRun[]): CoachRun[] {
  return [...runs].sort((left, right) => {
    const createdAtDelta = left.createdAt.getTime() - right.createdAt.getTime();
    return createdAtDelta !== 0 ? createdAtDelta : left.id.localeCompare(right.id);
  });
}

function toArenaResultFromStorage(
  arenaId: string,
  runs: CoachRun[],
  sprintsByRunId: Map<string, CoachSprint[]>,
): ArenaResult {
  const orderedRuns = sortArenaRuns(runs);
  const uniqueMatchIds = new Set<number>();

  const slots = orderedRuns.map((run, slotIndex) => {
    let wins = 0;
    let losses = 0;
    let draws = 0;

    for (const sprint of sprintsByRunId.get(run.id) || []) {
      const metrics = sprint.researchMetrics || {};
      const parsedRecord = parseSprintRecord(sprint.record);
      wins += metrics.wins ?? parsedRecord.wins;
      losses += metrics.losses ?? parsedRecord.losses;
      draws += metrics.draws ?? parsedRecord.draws;

      for (const matchId of sprint.matchIds || []) {
        uniqueMatchIds.add(matchId);
      }
    }

    return {
      slotIndex,
      runId: run.id,
      seedGenome: cloneGenome(run.initialGenome),
      currentGenome: cloneGenome(run.currentGenome),
      wins,
      losses,
      draws,
    };
  });

  const sprintsCompleted = orderedRuns.length > 0
    ? Math.min(...orderedRuns.map((run) => run.currentSprint))
    : 0;

  return {
    arenaId,
    slots,
    totalGamesPlayed: uniqueMatchIds.size,
    sprintsCompleted,
  };
}

async function finalizeArenaRuns(
  slots: ArenaRuntimeSlot[],
  status: "completed" | "failed",
  completedAt: Date,
): Promise<void> {
  await Promise.all(slots.map(async (slot) => {
    const actualCostUsd = await persistArenaRunProgress(slot);

    await storage.updateCoachRun(slot.runId, {
      status,
      currentGenome: cloneGenome(slot.state.genome),
      currentBeliefs: cloneBeliefs(slot.state),
      currentSprint: slot.state.currentSprint,
      currentScratchNotes: slot.scratchNotes,
      actualCostUsd,
      completedAt,
    });
  }));
}

export async function getArenaResult(arenaId: string): Promise<ArenaResult | undefined> {
  const runs = await storage.getCoachRunsByArenaId(arenaId);
  if (runs.length === 0) {
    return undefined;
  }

  const expandedSprintsByRunId = new Map<string, CoachSprint[]>();

  await Promise.all(runs.map(async (run) => {
    const sprints = await storage.getCoachSprints(run.id);
    expandedSprintsByRunId.set(run.id, sprints);
  }));

  return toArenaResultFromStorage(arenaId, runs, expandedSprintsByRunId);
}

export async function runArena(config: ArenaConfig): Promise<ArenaResult> {
  if (!config.arenaId.trim()) {
    throw new Error("Arena ID is required");
  }

  if (config.seedGenomes.length !== SEED_GENOME_TEMPLATES.length) {
    throw new Error(`Arena requires exactly ${SEED_GENOME_TEMPLATES.length} seed genomes`);
  }

  const foiaDelaySprints = Math.max(0, Math.floor(config.foiaDelaySprints ?? 0));
  const slots: ArenaRuntimeSlot[] = [];
  const pairingHistory = createPairingHistory();
  let sprintsCompleted = 0;
  let totalGamesPlayed = 0;
  let priorArenaBriefing: string | undefined;

  try {
    for (const [slotIndex, seedGenome] of config.seedGenomes.entries()) {
      const state = createCoachState(
        cloneGenome(seedGenome),
        `arena-${config.arenaId}-slot${slotIndex}`,
      );
      const run = await createCoachRun(
        {
          ...config.coachConfig,
          matchesPerSprint: config.matchesPerSprint,
          sprintConcurrency: 1,
          totalSprints: config.totalSprints,
        },
        state,
        config.arenaId,
      );

      slots.push({
        slotIndex,
        runId: run.id,
        seedGenome: cloneGenome(seedGenome),
        state,
        scratchNotes: null,
        wins: 0,
        losses: 0,
        draws: 0,
      });
    }

    const startedAt = new Date();
    await Promise.all(slots.map((slot) => storage.updateCoachRun(slot.runId, {
      status: "running",
      startedAt,
    })));

    logArena(
      `Starting arena ${config.arenaId} with ${slots.length} coaches, ${config.totalSprints} sprints, ${config.matchesPerSprint} matches per sprint.`,
    );

    for (let sprintIndex = 0; sprintIndex < config.totalSprints; sprintIndex++) {
      const sprintNumber = sprintIndex + 1;
      const pairings = buildSprintPairings(slots, config.matchesPerSprint, pairingHistory, config);
      const pairingTasks = pairings.map((pairing, pairingIndex) => async (): Promise<PairingResult> => {
        const slotA = slots[pairing.slotA];
        const slotB = slots[pairing.slotB];
        const paired = await runPairedCoachMatches(slotA, slotB, config, sprintNumber, pairingIndex);

        return {
          ...paired,
          bucket: pairing.bucket,
          reason: pairing.reason,
        };
      });

      const settlements = await runBoundedSettledPool(pairingTasks, config.globalMatchConcurrency);
      const resultsBySlot = new Map<number, SprintResult[]>();
      const opponentsBySlot = new Map<number, SprintOpponentContext[]>();

      for (const settlement of settlements) {
        if (settlement.status !== "fulfilled") {
          logArena(`Arena sprint ${sprintNumber} pairing failed: ${settlement.reason instanceof Error ? settlement.reason.message : String(settlement.reason)}`);
          continue;
        }

        const result = settlement.value;
        recordPairing(pairingHistory, result.slotA, result.slotB);

        // Update slot scratch notes from pairing results
        if (result.scratchNotesAfterA !== undefined) {
          slots[result.slotA].scratchNotes = result.scratchNotesAfterA;
        }
        if (result.scratchNotesAfterB !== undefined) {
          slots[result.slotB].scratchNotes = result.scratchNotesAfterB;
        }

        resultsBySlot.set(result.slotA, [...(resultsBySlot.get(result.slotA) || []), result.resultA]);
        resultsBySlot.set(result.slotB, [...(resultsBySlot.get(result.slotB) || []), result.resultB]);
        if (result.resultA.matchResults.length > 0) {
          opponentsBySlot.set(result.slotA, [
            ...(opponentsBySlot.get(result.slotA) || []),
            {
              opponentSlotIndex: result.slotB,
              runId: result.opponentRunIdForA,
              genome: cloneGenome(result.opponentGenomeForA),
              bucket: result.bucket,
              reason: result.reason,
              appearanceCount: result.actualMatchIds.length,
            },
          ]);
          opponentsBySlot.set(result.slotB, [
            ...(opponentsBySlot.get(result.slotB) || []),
            {
              opponentSlotIndex: result.slotA,
              runId: result.opponentRunIdForB,
              genome: cloneGenome(result.opponentGenomeForB),
              bucket: result.bucket,
              reason: result.reason,
              appearanceCount: result.actualMatchIds.length,
            },
          ]);
        }
      }

      const foiaActive = config.foiaEnabled && shouldInjectFoia(sprintsCompleted, foiaDelaySprints);

      await Promise.all(slots.map(async (slot) => {
        const sprintResult = combineSprintResults(
          sprintNumber,
          resultsBySlot.get(slot.slotIndex) || [],
        );
        const genomeBefore = cloneGenome(slot.state.genome);
        const compiledPrompts = compileGenomePrompts(genomeBefore);
        const primaryOpponentGenome = (opponentsBySlot.get(slot.slotIndex) || [])[0]?.genome;
        const disclosureText = await buildDisclosureBundle(
          opponentsBySlot.get(slot.slotIndex) || [],
          foiaActive,
          foiaDelaySprints,
          sprintNumber,
        );
        const promptEnv = {
          arenaId: config.arenaId,
          disclosureText,
          matchmakingBucket: (opponentsBySlot.get(slot.slotIndex) || [])[0]?.bucket,
          opponentGenome: primaryOpponentGenome ? cloneGenome(primaryOpponentGenome) : undefined,
          scratchNotes: slot.scratchNotes?.notesText,
          arenaBriefing: priorArenaBriefing,
        };
        let evaluation: SprintEvaluation;

        try {
          evaluation = await evaluateSprint({
            runId: slot.runId,
            sprintNumber,
            matchIds: sprintResult.matchResults.map((match) => match.matchId),
            focalTeam: sprintResult.matchResults[0]?.ourTeam || "amber",
            currentGenome: genomeBefore,
            compiledPrompts,
          });
        } catch (error) {
          logArena(
            `Sprint evaluation failed for run ${slot.runId} sprint ${sprintNumber}: ${error instanceof Error ? error.message : String(error)}`,
          );
          evaluation = buildFallbackEvaluation(slot.runId, sprintResult, genomeBefore, compiledPrompts);
        }

        // Run rollback evaluation on pending patches from prior sprints
        try {
          const historicalEvals = await storage.getSprintEvaluations(slot.runId);
          const evalsBySprint = new Map(
            historicalEvals.map((record) => [record.sprintNumber, record.evaluation]),
          );
          evalsBySprint.set(sprintNumber, evaluation);

          const patchReviews = await evaluatePendingPatchReviews({
            runId: slot.runId,
            currentSprint: sprintNumber,
            evaluationsBySprint: evalsBySprint,
          });

          if (patchReviews.length > 0) {
            logArena(`Evaluated ${patchReviews.length} pending patch review(s) for run ${slot.runId}`);
            for (const review of patchReviews) {
              logArena(`  Patch ${review.proposalId} from sprint ${review.committedSprint}: ${review.status} — ${review.summary}`);
            }

            // Refresh pendingPatchReviews in the evaluation with updated statuses
            const updatedPending = evaluation.pendingPatchReviews.map((pending) => {
              const reviewed = patchReviews.find((r) => r.proposalId === pending.proposalId);
              if (reviewed) {
                return {
                  ...pending,
                  status: reviewed.status,
                  firedTriggers: reviewed.evaluations
                    .filter((ev) => ev.status === "fired")
                    .map((ev) => ev.description),
                };
              }
              return pending;
            });
            evaluation = { ...evaluation, pendingPatchReviews: updatedPending };
          }
        } catch (error) {
          logArena(`Patch review evaluation failed for run ${slot.runId}: ${error instanceof Error ? error.message : String(error)}`);
        }

        const sprintState = applySprintResultToCoachState(slot.state, sprintResult);
        const coachConfig = buildAutopsyCoachConfig(
          config,
          primaryOpponentGenome,
        );
        const proposal = await coachProposePatch(
          sprintState,
          sprintResult,
          evaluation,
          coachConfig,
          promptEnv,
        );

        // Run real anchor A/B evaluation if patch exists
        let anchorSummary: AnchorABReport | null = null;
        if (proposal.patch) {
          try {
            const anchorConfig = resolveAnchorConfig(config);
            if (anchorConfig.enabled) {
              const candidateGenome = applyCoachPatchBundle(sprintState.genome, proposal.patch);
              anchorSummary = await runAnchorBatch({
                runId: slot.runId,
                sprintNumber,
                proposalId: proposal.proposalId,
                incumbentGenome: sprintState.genome,
                candidateGenome,
                playerProvider: config.coachConfig.playerProvider,
                playerModel: config.coachConfig.playerModel,
                teamSize: config.coachConfig.teamSize,
                config: anchorConfig,
                gameRules: config.gameRules || DEFAULT_GAME_RULES,
              });

              // Enrich evaluation with anchor data and persist back
              evaluation = { ...evaluation, anchor: anchorSummary };
              await storage.updateSprintEvaluation(slot.runId, sprintNumber, evaluation);
            }
          } catch (error) {
            logArena(
              `Anchor evaluation failed for run ${slot.runId} sprint ${sprintNumber}: ${error instanceof Error ? error.message : String(error)}`,
            );
            anchorSummary = createIncompleteAnchorReport();
          }
        }

        const review = await coachCommitReview(
          sprintState,
          proposal,
          evaluation,
          anchorSummary || undefined,
          evaluation.pendingPatchReviews,
          coachConfig,
          promptEnv,
        );
        const finalDecision: CoachDecision = review.decision === "commit" && proposal.patch ? "commit" : "revert";

        logArena(`Coach proposed: ${proposal.summary}`);
        logArena(`Coach decided: ${finalDecision}`);

        let nextState: CoachState = {
          ...sprintState,
          beliefs: mergeBeliefUpdates(sprintState.beliefs, proposal.beliefUpdates, sprintResult.sprintNumber),
        };

        if (finalDecision === "commit" && proposal.patch) {
          nextState = {
            ...nextState,
            genome: applyCoachPatchBundle(nextState.genome, proposal.patch),
            patchHistory: [
              ...nextState.patchHistory,
              ...proposal.patch.edits.map((edit) => ({
                ...edit,
                sprintApplied: sprintResult.sprintNumber,
                decision: "commit" as const,
              })),
            ],
          };
        }

        slot.state = nextState;
        updateSlotRecord(slot, sprintResult);

        await persistArenaSprintRecord(
          slot,
          sprintResult,
          genomeBefore,
          {
            decision: finalDecision,
            proposal,
            review,
            anchorSummary,
          },
          disclosureText,
          opponentsBySlot.get(slot.slotIndex) || [],
        );
        await persistArenaRunProgress(slot);
      }));

      sprintsCompleted = sprintNumber;
      totalGamesPlayed += settlements.reduce((count, settlement) => {
        if (settlement.status !== "fulfilled") {
          return count;
        }

        return count + settlement.value.resultA.matchResults.length;
      }, 0);

      const progress = slots
        .sort((left, right) => left.slotIndex - right.slotIndex)
        .map((slot) => `slot${slot.slotIndex}: ${slot.wins}-${slot.losses}${slot.draws > 0 ? `-${slot.draws}` : ""}`)
        .join(", ");

      logArena(`Arena sprint ${sprintNumber} complete: [${progress}]`);
      logArena(`Arena sprint ${sprintNumber} matchmaking: ${formatBucketDistribution(pairings)}`);

      // Compute arena briefing for the next sprint (1-sprint delay)
      try {
        const briefing = await buildArenaBriefing(slots, sprintNumber);
        priorArenaBriefing = briefing || undefined;
      } catch (error) {
        logArena(`Arena briefing failed for sprint ${sprintNumber}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    await finalizeArenaRuns(slots, "completed", new Date());

    return {
      arenaId: config.arenaId,
      slots: slots
        .sort((left, right) => left.slotIndex - right.slotIndex)
        .map(toArenaCoachSlot),
      totalGamesPlayed,
      sprintsCompleted,
    };
  } catch (error) {
    if (slots.length > 0) {
      await Promise.allSettled([
        finalizeArenaRuns(slots, "failed", new Date()),
      ]);
    }

    throw error;
  }
}
