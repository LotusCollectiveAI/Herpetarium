import type { CoachRun, CoachSprint, GenomeModules, Match } from "@shared/schema";
import { storage } from "./storage";

export interface ParetoPoint {
  runId: string;
  slotIndex: number;
  sprintNumber: number;
  winRate: number;
  interceptionResistance: number;
  adaptationSpeed: number;
  complexity: number;
}

export interface ParetoFrontier {
  arenaId: string;
  points: ParetoPoint[];
  dominatedPoints: ParetoPoint[];
  frontierSize: number;
}

interface SprintMetrics {
  wins: number;
  losses: number;
  draws: number;
}

function roundMetric(value: number, digits = 6): number {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(digits));
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function countGenomeComplexity(genome: GenomeModules): number {
  return genome.cluePhilosophy.length
    + genome.opponentModeling.length
    + genome.riskTolerance.length
    + genome.memoryPolicy.length;
}

function parseSprintMetrics(sprint: CoachSprint): SprintMetrics {
  const recordParts = sprint.record.split("-").map((part) => Number.parseInt(part, 10));
  const fallback = {
    wins: Number.isFinite(recordParts[0]) ? recordParts[0] : 0,
    losses: Number.isFinite(recordParts[1]) ? recordParts[1] : 0,
    draws: Number.isFinite(recordParts[2]) ? recordParts[2] : 0,
  };
  const metrics = sprint.researchMetrics || {};

  return {
    wins: metrics.wins ?? fallback.wins,
    losses: metrics.losses ?? fallback.losses,
    draws: metrics.draws ?? fallback.draws,
  };
}

function sortRuns(runs: CoachRun[]): CoachRun[] {
  return [...runs].sort((left, right) => {
    const createdAtDelta = left.createdAt.getTime() - right.createdAt.getTime();
    return createdAtDelta !== 0 ? createdAtDelta : left.id.localeCompare(right.id);
  });
}

function getRunExperimentId(arenaId: string, slotIndex: number): string {
  return `coach-arena-${arenaId}-slot${slotIndex}`;
}

function estimateOpponentBlackTokens(metrics: SprintMetrics): number {
  return metrics.losses;
}

function resolveOpponentBlackTokenExposure(
  arenaId: string,
  runId: string,
  slotIndex: number,
  sprint: CoachSprint,
  metrics: SprintMetrics,
  matchesById: Map<number, Match>,
): { opponentBlackTokens: number; maxPossibleBlackTokens: number } {
  const matchIds = sprint.matchIds ?? [];
  const totalMatches = metrics.wins + metrics.losses + metrics.draws;
  const maxPossibleBlackTokens = Math.max(1, totalMatches * 2);

  if (matchIds.length === 0) {
    return {
      opponentBlackTokens: estimateOpponentBlackTokens(metrics),
      maxPossibleBlackTokens,
    };
  }

  const runExperimentId = getRunExperimentId(arenaId, slotIndex);
  const matchOccurrences = new Map<number, number>();
  let opponentBlackTokens = 0;

  for (const matchId of matchIds) {
    const match = matchesById.get(matchId);
    if (!match || typeof match.experimentId !== "string") {
      return {
        opponentBlackTokens: estimateOpponentBlackTokens(metrics),
        maxPossibleBlackTokens,
      };
    }

    const occurrence = matchOccurrences.get(matchId) ?? 0;
    matchOccurrences.set(matchId, occurrence + 1);

    let ourTeam: "amber" | "blue" | null = null;

    if (match.focalTeam && match.runId === runId) {
      ourTeam = match.focalTeam;
    } else if (match.focalTeam && match.opponentRunId === runId) {
      ourTeam = match.focalTeam === "amber" ? "blue" : "amber";
    } else if (typeof match.experimentId === "string") {
      ourTeam = match.experimentId === runExperimentId ? "amber" : "blue";

      // Legacy mirror/self-play persists the same match twice for the same run, once per side.
      if (occurrence > 0 && match.experimentId === runExperimentId) {
        ourTeam = occurrence % 2 === 0 ? "amber" : "blue";
      }
    }

    if (!ourTeam) {
      return {
        opponentBlackTokens: estimateOpponentBlackTokens(metrics),
        maxPossibleBlackTokens,
      };
    }

    opponentBlackTokens += ourTeam === "amber"
      ? match.amberBlackTokens
      : match.blueBlackTokens;
  }

  return {
    opponentBlackTokens,
    maxPossibleBlackTokens: Math.max(1, matchIds.length * 2),
  };
}

function dominates(left: ParetoPoint, right: ParetoPoint): boolean {
  const leftAtLeastAsGood =
    left.winRate >= right.winRate
    && left.interceptionResistance >= right.interceptionResistance
    && left.adaptationSpeed >= right.adaptationSpeed
    && left.complexity <= right.complexity;

  const leftStrictlyBetter =
    left.winRate > right.winRate
    || left.interceptionResistance > right.interceptionResistance
    || left.adaptationSpeed > right.adaptationSpeed
    || left.complexity < right.complexity;

  return leftAtLeastAsGood && leftStrictlyBetter;
}

export function computeParetoPoint(
  runId: string,
  slotIndex: number,
  sprintNumber: number,
  sprintMetrics: { wins: number; losses: number; draws: number },
  opponentBlackTokens: number,
  maxPossibleBlackTokens: number,
  prevSprintWinRate: number | null,
  currentGenome: GenomeModules,
): ParetoPoint {
  const totalGames = sprintMetrics.wins + sprintMetrics.losses + sprintMetrics.draws;
  const winRate = totalGames > 0 ? sprintMetrics.wins / totalGames : 0;
  const boundedMaxBlackTokens = Math.max(1, maxPossibleBlackTokens);

  return {
    runId,
    slotIndex,
    sprintNumber,
    winRate: roundMetric(winRate),
    interceptionResistance: roundMetric(
      clamp01(1 - (opponentBlackTokens / boundedMaxBlackTokens)),
    ),
    adaptationSpeed: roundMetric(prevSprintWinRate === null ? 0 : winRate - prevSprintWinRate),
    complexity: countGenomeComplexity(currentGenome),
  };
}

export function buildParetoFrontier(points: ParetoPoint[]): ParetoFrontier {
  const frontierPoints: ParetoPoint[] = [];
  const dominatedPoints: ParetoPoint[] = [];

  for (let index = 0; index < points.length; index += 1) {
    const candidate = points[index];
    let isDominated = false;

    for (let otherIndex = 0; otherIndex < points.length; otherIndex += 1) {
      if (index === otherIndex) continue;
      if (dominates(points[otherIndex], candidate)) {
        isDominated = true;
        break;
      }
    }

    if (isDominated) {
      dominatedPoints.push(candidate);
    } else {
      frontierPoints.push(candidate);
    }
  }

  return {
    arenaId: "",
    points: frontierPoints,
    dominatedPoints,
    frontierSize: frontierPoints.length,
  };
}

export async function computeArenaPareto(arenaId: string): Promise<ParetoFrontier> {
  const runs = sortRuns(await storage.getCoachRunsByArenaId(arenaId));
  if (runs.length === 0) {
    return {
      arenaId,
      points: [],
      dominatedPoints: [],
      frontierSize: 0,
    };
  }

  const sprintsByRunId = new Map<string, CoachSprint[]>();

  await Promise.all(runs.map(async (run) => {
    sprintsByRunId.set(run.id, await storage.getCoachSprints(run.id));
  }));

  const uniqueMatchIds = Array.from(new Set(
    Array.from(sprintsByRunId.values()).flatMap((sprints) =>
      sprints.flatMap((sprint) => sprint.matchIds ?? []),
    ),
  ));
  const matches = uniqueMatchIds.length > 0
    ? await storage.getMatchesByIds(uniqueMatchIds)
    : [];
  const matchesById = new Map(matches.map((match) => [match.id, match]));

  const points: ParetoPoint[] = [];

  for (const [slotIndex, run] of runs.entries()) {
    const sprints = sprintsByRunId.get(run.id) || [];

    for (let sprintIndex = 0; sprintIndex < sprints.length; sprintIndex += 1) {
      const sprint = sprints[sprintIndex];
      const metrics = parseSprintMetrics(sprint);
      const exposure = resolveOpponentBlackTokenExposure(
        arenaId,
        run.id,
        slotIndex,
        sprint,
        metrics,
        matchesById,
      );
      const previousSprint = sprintIndex > 0 ? sprints[sprintIndex - 1] : null;
      const previousSprintMetrics = previousSprint ? parseSprintMetrics(previousSprint) : null;
      const previousWinRate = previousSprint && previousSprintMetrics
        ? (
            previousSprint.decision === "commit"
              ? previousSprintMetrics.wins / Math.max(1, previousSprintMetrics.wins + previousSprintMetrics.losses + previousSprintMetrics.draws)
              : metrics.wins / Math.max(1, metrics.wins + metrics.losses + metrics.draws)
          )
        : null;

      points.push(computeParetoPoint(
        run.id,
        slotIndex,
        sprint.sprintNumber,
        metrics,
        exposure.opponentBlackTokens,
        exposure.maxPossibleBlackTokens,
        previousSprint ? roundMetric(previousWinRate ?? 0) : null,
        sprint.genomeAfter,
      ));
    }
  }

  const frontier = buildParetoFrontier(points);
  return {
    ...frontier,
    arenaId,
  };
}
