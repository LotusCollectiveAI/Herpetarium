import type {
  ArenaCoachSlot,
  ArenaConfig,
  ArenaResult,
  CoachConfig,
  CoachDecision,
  CoachMatchmakingNote,
  CoachRun,
  CoachSprint,
  CoachResearchMetrics,
  DeceptionCategory,
  DeliberationPatternVector,
  GenomeModules,
} from "@shared/schema";
import { runBoundedSettledPool } from "./boundedPool";
import {
  applyCoachPatch,
  applySprintResultToCoachState,
  cloneGenome,
  coachAutopsy,
  createCoachRun,
  createCoachState,
  persistPatchIndexRecord,
  runCoachSprint,
  SEED_GENOME_TEMPLATES,
  type CoachState,
  type CoachStructuredPatch,
  type SprintResult,
} from "./coachLoop";
import { buildDisclosureText } from "./disclosure";
import {
  createPairingHistory,
  recordPairing,
  selectPairings,
  type MatchmakingBucket,
  type MatchmakingPairing,
  type PairingHistory,
} from "./matchmaking";
import { analyzeSprintMatches } from "./researchAnalyzer";
import { storage } from "./storage";

const ARENA_SOURCE = "arena";
const MATCHMAKING_BUCKET_ORDER: MatchmakingBucket[] = ["near_peer", "diagnostic", "mirror", "novelty", "baseline"];
const DECEPTION_CATEGORIES: DeceptionCategory[] = [
  "behavior_rationale_divergence",
  "selective_omission",
  "observation_sensitivity",
];

interface ArenaRuntimeSlot {
  slotIndex: number;
  runId: string;
  seedGenome: GenomeModules;
  state: CoachState;
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
  opponentGenomeForA: GenomeModules;
  opponentGenomeForB: GenomeModules;
  opponentRunIdForA: string;
  opponentRunIdForB: string;
}

function logArena(message: string) {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${ARENA_SOURCE}] ${message}`);
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

function mirrorSprintResult(result: SprintResult): SprintResult {
  const matchResults = result.matchResults.map((match) => {
    const ourTeam: SprintResult["matchResults"][number]["ourTeam"] = match.ourTeam === "amber" ? "blue" : "amber";

    return {
      ...match,
      ourTeam,
      ourWhiteTokens: match.oppWhiteTokens,
      ourBlackTokens: match.oppBlackTokens,
      oppWhiteTokens: match.ourWhiteTokens,
      oppBlackTokens: match.ourBlackTokens,
      roundSummaries: [...match.roundSummaries],
    };
  });
  const summary = summarizeSprint(matchResults);

  return {
    sprintNumber: result.sprintNumber,
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

function buildDisclosureBundle(opponents: SprintOpponentContext[], foiaEnabled: boolean): string | undefined {
  if (!foiaEnabled || opponents.length === 0) {
    return undefined;
  }

  const uniqueGenomes = Array.from(
    new Map(opponents.map((opponent) => [JSON.stringify(opponent.genome), opponent.genome])).values(),
  );

  return uniqueGenomes.map((genome, index) => {
    const prefix = uniqueGenomes.length > 1 ? `Opponent ${index + 1}\n` : "";
    return `${prefix}${buildDisclosureText(genome)}`;
  }).join("\n\n");
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

function getUniqueMatchIds(state: CoachState): number[] {
  return Array.from(new Set(
    state.sprintHistory.flatMap((sprint) => sprint.matchResults.map((match) => match.matchId)),
  ));
}

function formatBucketDistribution(pairings: MatchmakingPairing[]): string {
  const counts: Record<MatchmakingBucket, number> = {
    near_peer: 0,
    diagnostic: 0,
    mirror: 0,
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
    actualCostUsd,
  });

  return actualCostUsd;
}

async function persistArenaSprintRecord(
  slot: ArenaRuntimeSlot,
  sprintResult: SprintResult,
  genomeBefore: GenomeModules,
  autopsy: { decision: CoachDecision; patch: CoachStructuredPatch | null },
  disclosureText: string | undefined,
  opponents: SprintOpponentContext[],
): Promise<void> {
  const uniqueOpponentRunIds = Array.from(new Set(opponents.map((opponent) => opponent.runId)));
  const researchMetrics = await buildResearchMetrics(sprintResult, opponents);

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
    decision: autopsy.decision,
    patch: autopsy.patch ? { ...autopsy.patch } : null,
    disclosureText: disclosureText || null,
    researchMetrics,
  });

  await persistPatchIndexRecord(slot.runId, sprintResult, genomeBefore, slot.state, autopsy);
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
        const resultA = await runCoachSprint(
          slotA.state,
          buildPerMatchCoachConfig(config, slotB.state.genome),
          {
            opponentRunId: slotB.runId,
            opponentGenome: cloneGenome(slotB.state.genome),
            matchmakingBucket: `${pairing.bucket}-s${sprintNumber}-p${pairingIndex}`,
          },
        );

        return {
          slotA: slotA.slotIndex,
          slotB: slotB.slotIndex,
          bucket: pairing.bucket,
          reason: pairing.reason,
          resultA,
          resultB: mirrorSprintResult(resultA),
          opponentGenomeForA: cloneGenome(slotB.state.genome),
          opponentGenomeForB: cloneGenome(slotA.state.genome),
          opponentRunIdForA: slotB.runId,
          opponentRunIdForB: slotA.runId,
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
              appearanceCount: 1,
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
              appearanceCount: 1,
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
        const sprintState = applySprintResultToCoachState(slot.state, sprintResult);
        const disclosureText = buildDisclosureBundle(opponentsBySlot.get(slot.slotIndex) || [], foiaActive);
        const autopsy = await coachAutopsy(
          sprintState,
          sprintResult,
          buildAutopsyCoachConfig(
            config,
            (opponentsBySlot.get(slot.slotIndex) || [])[0]?.genome,
          ),
          disclosureText ? { disclosureText } : undefined,
        );

        let nextState: CoachState = {
          ...sprintState,
          beliefs: autopsy.beliefs,
        };

        if (autopsy.decision === "commit" && autopsy.patch) {
          nextState = {
            ...nextState,
            genome: applyCoachPatch(nextState.genome, autopsy.patch),
            patchHistory: [
              ...nextState.patchHistory,
              {
                ...autopsy.patch,
                sprintApplied: sprintResult.sprintNumber,
                decision: "commit",
              },
            ],
          };
        }

        slot.state = nextState;
        updateSlotRecord(slot, sprintResult);

        await persistArenaSprintRecord(
          slot,
          sprintResult,
          genomeBefore,
          autopsy,
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
