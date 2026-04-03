import { randomUUID } from "crypto";
import type { ArenaConfig, CoachSprint } from "@shared/schema";
import { runArena } from "./arena";
import { computeArenaPareto } from "./pareto";
import { storage } from "./storage";

export interface ValidationGate {
  label: "g10" | "g30" | "g100";
  totalGames: number;
}

export const VALIDATION_GATES: ValidationGate[] = [
  { label: "g10", totalGames: 10 },
  { label: "g30", totalGames: 30 },
  { label: "g100", totalGames: 100 },
];

export interface GateReport {
  gate: ValidationGate;
  arenaId: string;
  gamesPlayed: number;
  cleanMatchRate: number;
  observedCostUsd: number;
  frontierSize: number;
  metricCoverage: Record<string, number>;
  standings: Array<{ slotIndex: number; runId: string; wins: number; losses: number; draws: number; winRate: number }>;
  deceptionSummary: Record<string, { meanScore: number; maxScore: number }>;
}

export interface ValidationReport {
  gates: GateReport[];
  totalGamesPlayed: number;
  totalCostUsd: number;
  finalFrontierSize: number;
}

interface MetricAccumulator {
  values: number[];
  nextSprintPairs: Array<{ x: number; y: number }>;
  commitPairs: Array<{ x: number; y: number }>;
}

function roundMetric(value: number, digits = 6): number {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(digits));
}

function buildMetricAccumulator(): MetricAccumulator {
  return {
    values: [],
    nextSprintPairs: [],
    commitPairs: [],
  };
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function variance(values: number[]): number | null {
  if (values.length === 0) return null;
  const average = mean(values);
  const squaredDeviation = values.reduce((sum, value) => sum + ((value - average) ** 2), 0);
  return squaredDeviation / values.length;
}

function pearsonCorrelation(pairs: Array<{ x: number; y: number }>): number | null {
  if (pairs.length < 2) return null;

  const xs = pairs.map((pair) => pair.x);
  const ys = pairs.map((pair) => pair.y);
  const xMean = mean(xs);
  const yMean = mean(ys);

  let numerator = 0;
  let xVariance = 0;
  let yVariance = 0;

  for (const pair of pairs) {
    const xDelta = pair.x - xMean;
    const yDelta = pair.y - yMean;
    numerator += xDelta * yDelta;
    xVariance += xDelta * xDelta;
    yVariance += yDelta * yDelta;
  }

  if (xVariance === 0 || yVariance === 0) {
    return null;
  }

  return numerator / Math.sqrt(xVariance * yVariance);
}

function extractNumericMetrics(sprint: CoachSprint): Record<string, number> {
  const metrics = sprint.researchMetrics || {};
  const numericMetrics: Record<string, number> = {};

  if (typeof metrics.completedMatches === "number") numericMetrics.completedMatches = metrics.completedMatches;
  if (typeof metrics.wins === "number") numericMetrics.wins = metrics.wins;
  if (typeof metrics.losses === "number") numericMetrics.losses = metrics.losses;
  if (typeof metrics.draws === "number") numericMetrics.draws = metrics.draws;

  if (metrics.deception) {
    for (const [category, values] of Object.entries(metrics.deception)) {
      numericMetrics[`deception.${category}`] = values.meanScore;
      numericMetrics[`deception.${category}.maxScore`] = values.maxScore;
      numericMetrics[`deception.${category}.totalFindings`] = values.totalFindings;
    }
  }

  if (metrics.deliberationPatterns) {
    numericMetrics["deliberation.meanMessageLength"] = metrics.deliberationPatterns.meanMessageLength;
    numericMetrics["deliberation.hedgeRate"] = metrics.deliberationPatterns.hedgeRate;
    numericMetrics["deliberation.disagreementRate"] = metrics.deliberationPatterns.disagreementRate;
    numericMetrics["deliberation.revisionRate"] = metrics.deliberationPatterns.revisionRate;
    numericMetrics["deliberation.phraseOverlap"] = metrics.deliberationPatterns.phraseOverlap;
  }

  return numericMetrics;
}

function parseSprintWinRate(sprint: CoachSprint): number {
  const parsed = Number(sprint.winRate);
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildStandings(
  slots: Array<{ slotIndex: number; runId: string; wins: number; losses: number; draws: number }>,
): GateReport["standings"] {
  return [...slots]
    .map((slot) => {
      const games = slot.wins + slot.losses + slot.draws;
      return {
        ...slot,
        winRate: roundMetric(games > 0 ? slot.wins / games : 0),
      };
    })
    .sort((left, right) =>
      right.winRate - left.winRate
      || right.wins - left.wins
      || left.losses - right.losses
      || left.slotIndex - right.slotIndex,
    );
}

function summarizeDeception(sprints: CoachSprint[]): GateReport["deceptionSummary"] {
  const summary = new Map<string, { totalMeanScore: number; count: number; maxScore: number }>();

  for (const sprint of sprints) {
    if (!sprint.researchMetrics?.deception) continue;

    for (const [category, values] of Object.entries(sprint.researchMetrics.deception)) {
      const current = summary.get(category) || { totalMeanScore: 0, count: 0, maxScore: 0 };
      current.totalMeanScore += values.meanScore;
      current.count += 1;
      current.maxScore = Math.max(current.maxScore, values.maxScore);
      summary.set(category, current);
    }
  }

  return Object.fromEntries(
    Array.from(summary.entries()).map(([category, values]) => [
      category,
      {
        meanScore: roundMetric(values.count > 0 ? values.totalMeanScore / values.count : 0),
        maxScore: roundMetric(values.maxScore),
      },
    ]),
  );
}

function computeGamesPerSprint(coachCount: number, matchesPerSprint: number): number {
  return Math.max(1, Math.floor((coachCount * matchesPerSprint) / 2));
}

function calculateSprintsNeeded(totalGames: number, coachCount: number, matchesPerSprint: number): number {
  const gamesPerSprint = computeGamesPerSprint(coachCount, matchesPerSprint);
  return Math.max(1, Math.ceil(totalGames / gamesPerSprint));
}

async function collectArenaSprints(arenaId: string): Promise<{ sprints: CoachSprint[]; uniqueMatchIds: number[] }> {
  const runs = await storage.getCoachRunsByArenaId(arenaId);
  const nestedSprints = await Promise.all(runs.map((run) => storage.getCoachSprints(run.id)));
  const sprints = nestedSprints.flat();
  const uniqueMatchIds = Array.from(new Set(
    sprints.flatMap((sprint) => sprint.matchIds ?? []),
  ));

  return { sprints, uniqueMatchIds };
}

async function persistMetricYields(arenaId: string, sprints: CoachSprint[]): Promise<Record<string, number>> {
  if (sprints.length === 0) {
    return {};
  }

  const byRunAndSprint = new Map<string, CoachSprint>();

  for (const sprint of sprints) {
    byRunAndSprint.set(`${sprint.runId}:${sprint.sprintNumber}`, sprint);
  }

  const metricAccumulators = new Map<string, MetricAccumulator>();

  for (const sprint of sprints) {
    const metrics = extractNumericMetrics(sprint);
    const nextSprint = byRunAndSprint.get(`${sprint.runId}:${sprint.sprintNumber + 1}`);
    const nextSprintWinRate = nextSprint ? parseSprintWinRate(nextSprint) : null;
    const commitDecision = sprint.decision === "commit" ? 1 : 0;

    for (const [metricKey, value] of Object.entries(metrics)) {
      if (!Number.isFinite(value)) continue;

      const accumulator = metricAccumulators.get(metricKey) || buildMetricAccumulator();
      accumulator.values.push(value);
      accumulator.commitPairs.push({ x: value, y: commitDecision });

      if (nextSprintWinRate !== null) {
        accumulator.nextSprintPairs.push({ x: value, y: nextSprintWinRate });
      }

      metricAccumulators.set(metricKey, accumulator);
    }
  }

  await Promise.all(Array.from(metricAccumulators.entries()).map(async ([metricKey, accumulator]) => {
    await storage.upsertMetricYield({
      arenaId,
      metricKey,
      sampleSize: accumulator.values.length,
      coverage: roundMetric(accumulator.values.length / sprints.length),
      variance: accumulator.values.length > 0 ? roundMetric(variance(accumulator.values) ?? 0) : null,
      correlationWithNextSprintWinRate: (() => {
        const value = pearsonCorrelation(accumulator.nextSprintPairs);
        return value === null ? null : roundMetric(value);
      })(),
      correlationWithCommitDecision: (() => {
        const value = pearsonCorrelation(accumulator.commitPairs);
        return value === null ? null : roundMetric(value);
      })(),
    });
  }));

  const yields = await storage.getMetricYields(arenaId);
  return Object.fromEntries(
    yields.map((yieldEntry) => [yieldEntry.metricKey, roundMetric(yieldEntry.coverage)]),
  );
}

export function buildValidationArenaId(validationPrefix: string, gateLabel: ValidationGate["label"]): string {
  return `${validationPrefix}-${gateLabel}`;
}

export async function runValidationWithPrefix(
  baseConfig: Omit<ArenaConfig, "arenaId" | "totalSprints" | "matchesPerSprint">,
  validationPrefix: string,
  gates: ValidationGate[] = VALIDATION_GATES,
): Promise<ValidationReport> {
  const reports: GateReport[] = [];

  for (const gate of gates) {
    const arenaId = buildValidationArenaId(validationPrefix, gate.label);
    const totalSprints = calculateSprintsNeeded(gate.totalGames, baseConfig.seedGenomes.length, 2);
    const arenaConfig: ArenaConfig = {
      ...baseConfig,
      arenaId,
      totalSprints,
      matchesPerSprint: 2,
      coachConfig: {
        ...baseConfig.coachConfig,
        totalSprints,
        matchesPerSprint: 2,
      },
    };

    console.log(`[validation] Starting ${gate.label} on arena ${arenaId} with ${totalSprints} sprints`);

    const result = await runArena(arenaConfig);
    const frontier = await computeArenaPareto(arenaId);
    const { sprints, uniqueMatchIds } = await collectArenaSprints(arenaId);
    const matches = uniqueMatchIds.length > 0
      ? await storage.getMatchesByIds(uniqueMatchIds)
      : [];
    const observedCostUsd = uniqueMatchIds.length > 0
      ? await storage.getCumulativeCost(uniqueMatchIds)
      : 0;
    const cleanMatchCount = matches.filter((match) => match.qualityStatus === "clean").length;
    const metricCoverage = await persistMetricYields(arenaId, sprints);

    const report: GateReport = {
      gate,
      arenaId,
      gamesPlayed: result.totalGamesPlayed,
      cleanMatchRate: roundMetric(matches.length > 0 ? cleanMatchCount / matches.length : 0),
      observedCostUsd: roundMetric(observedCostUsd, 4),
      frontierSize: frontier.frontierSize,
      metricCoverage,
      standings: buildStandings(result.slots),
      deceptionSummary: summarizeDeception(sprints),
    };

    reports.push(report);
    console.log(
      `[validation] ${gate.label} completed: ${report.gamesPlayed} games, frontier=${report.frontierSize}, clean=${report.cleanMatchRate.toFixed(3)}, cost=$${report.observedCostUsd.toFixed(4)}`,
    );
  }

  return {
    gates: reports,
    totalGamesPlayed: reports.reduce((sum, report) => sum + report.gamesPlayed, 0),
    totalCostUsd: roundMetric(reports.reduce((sum, report) => sum + report.observedCostUsd, 0), 4),
    finalFrontierSize: reports.length > 0 ? reports[reports.length - 1].frontierSize : 0,
  };
}

export async function runValidation(
  baseConfig: Omit<ArenaConfig, "arenaId" | "totalSprints" | "matchesPerSprint">,
  gates: ValidationGate[] = VALIDATION_GATES,
): Promise<ValidationReport> {
  const validationPrefix = `validation-${randomUUID().slice(0, 8)}`;
  return runValidationWithPrefix(baseConfig, validationPrefix, gates);
}
