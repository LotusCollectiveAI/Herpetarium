/**
 * Experiment Runner for Herpetarium (Week 3).
 *
 * Runs a matrix experiment: strategies x models x gamesPerCell.
 * Each cell produces gamesPerCell headless matches, all tagged with
 * the same experimentId for scoped querying and export.
 */

import type { ExperimentConfig, HeadlessMatchConfig, AIPlayerConfig, AblationFlag } from "@shared/schema";
import { runHeadlessMatch } from "./headlessRunner";
import { storage } from "./storage";
import { log } from "./index";
import { bootstrapConfidenceInterval, cohensD } from "./metrics";

interface ExperimentCell {
  strategy: string;
  provider: string;
  model: string;
  cellIndex: number;
}

interface CellResult {
  strategy: string;
  model: string;
  provider: string;
  wins: number;
  losses: number;
  winRate: number;
  winRateCI?: { lower: number; upper: number; point: number };
  interceptionVulnerability: number;
  miscommunicationRate: number;
  avgRounds: number;
  matchIds: number[];
}

interface PairwiseComparison {
  model: string;
  strategyA: string;
  strategyB: string;
  effectSize: number | null;
  effectSizeMagnitude: string;
  winRateDiff: number;
  significanceIndicator: string;
}

function buildExperimentMatrix(config: ExperimentConfig): ExperimentCell[] {
  const cells: ExperimentCell[] = [];
  let cellIndex = 0;
  for (const strategy of config.strategies) {
    for (const { provider, model } of config.models) {
      cells.push({ strategy, provider, model, cellIndex });
      cellIndex++;
    }
  }
  return cells;
}

function buildMatchConfig(
  cell: ExperimentCell,
  gameIndex: number,
  baseSeed: string,
  experimentId: string,
  ablations?: { flags: AblationFlag[] }
): HeadlessMatchConfig {
  const aiConfig: AIPlayerConfig = {
    provider: cell.provider as any,
    model: cell.model,
    timeoutMs: 120000,
    temperature: 0.7,
    promptStrategy: cell.strategy as any,
    reasoningEffort: "high" as const,
  };

  return {
    players: [
      { name: `${cell.strategy}-${cell.model}-A1`, aiProvider: cell.provider as any, team: "amber", aiConfig },
      { name: `${cell.strategy}-${cell.model}-A2`, aiProvider: cell.provider as any, team: "amber", aiConfig },
      { name: `${cell.strategy}-${cell.model}-B1`, aiProvider: cell.provider as any, team: "blue", aiConfig },
      { name: `${cell.strategy}-${cell.model}-B2`, aiProvider: cell.provider as any, team: "blue", aiConfig },
    ],
    seed: `${baseSeed}-cell${cell.cellIndex}-game${gameIndex}`,
    experimentId,
    ablations: ablations as any,
  };
}

export async function runExperiment(experimentId: number, config: ExperimentConfig): Promise<void> {
  const cells = buildExperimentMatrix(config);
  const baseSeed = config.seed || `exp-${experimentId}`;
  const experimentTag = `exp-${experimentId}`;
  let totalCost = 0;
  const totalMatches = cells.length * config.gamesPerCell;

  log(`[experiment] Starting experiment ${experimentId}: ${cells.length} cells x ${config.gamesPerCell} games = ${totalMatches} matches`, "experiment");

  await storage.updateExperiment(experimentId, { status: "running" });

  // Track match IDs per cell for results computation
  const cellMatchIds: Map<number, number[]> = new Map();
  for (const cell of cells) {
    cellMatchIds.set(cell.cellIndex, []);
  }

  let completedCount = 0;

  for (const cell of cells) {
    for (let gameIdx = 0; gameIdx < config.gamesPerCell; gameIdx++) {
      // Budget check
      if (config.budgetCapUsd && totalCost >= parseFloat(config.budgetCapUsd)) {
        log(`[experiment] Budget cap reached at $${totalCost.toFixed(4)}, stopping after ${completedCount}/${totalMatches} matches`, "experiment");
        await storage.updateExperiment(experimentId, {
          status: "budget_exceeded",
          results: { error: "budget_exceeded", totalCostUsd: totalCost.toFixed(4), completedMatches: completedCount },
        });
        return;
      }

      const matchConfig = buildMatchConfig(cell, gameIdx, baseSeed, experimentTag, config.ablations);

      try {
        const result = await runHeadlessMatch(matchConfig);
        cellMatchIds.get(cell.cellIndex)!.push(result.matchId);
        completedCount++;

        // Cost tracking: query ai_call_logs for this match to accumulate cost
        try {
          const matchCost = await storage.getCumulativeCost([result.matchId]);
          if (matchCost > 0) {
            totalCost += matchCost;
          } else {
            log(`[experiment] Warning: cost tracking returned $0 for match ${result.matchId} -- cost may be approximate`, "experiment");
          }
        } catch (costErr) {
          log(`[experiment] Warning: failed to query cost for match ${result.matchId}: ${costErr}`, "experiment");
        }

        log(`[experiment] ${cell.strategy}/${cell.model} game ${gameIdx + 1}/${config.gamesPerCell}: winner=${result.winner} (cost so far: $${totalCost.toFixed(4)})`, "experiment");
      } catch (err) {
        log(`[experiment] Match failed for ${cell.strategy}/${cell.model} game ${gameIdx + 1}: ${err}`, "experiment");
      }
    }
  }

  // Compute results: build per-cell statistics
  log(`[experiment] Computing results for experiment ${experimentId}...`, "experiment");

  const meanFn = (arr: number[]) => arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
  const cellResults: CellResult[] = [];

  for (const cell of cells) {
    const matchIds = cellMatchIds.get(cell.cellIndex) || [];
    const cellMatches = await storage.getMatchesByIds(matchIds);

    let wins = 0;
    let losses = 0;
    let totalRounds = 0;
    let totalInterceptions = 0;
    let totalMiscommunications = 0;
    const winArray: number[] = [];

    for (const m of cellMatches) {
      if (!m.winner) continue;
      totalRounds += m.totalRounds;
      // In self-play, amber always uses the cell strategy. Count amber wins.
      if (m.winner === "amber") {
        wins++;
        winArray.push(1);
      } else {
        losses++;
        winArray.push(0);
      }
      // Interception vulnerability = black tokens received by amber (opponent intercepted amber)
      totalInterceptions += m.amberBlackTokens;
      // Miscommunication rate = white tokens for amber (amber team miscommunicated)
      totalMiscommunications += m.amberWhiteTokens;
    }

    const totalGames = wins + losses;
    const winRate = totalGames > 0 ? wins / totalGames : 0;
    const winRateCI = winArray.length >= 2
      ? bootstrapConfidenceInterval(winArray, meanFn)
      : undefined;

    cellResults.push({
      strategy: cell.strategy,
      model: cell.model,
      provider: cell.provider,
      wins,
      losses,
      winRate: +winRate.toFixed(4),
      winRateCI,
      interceptionVulnerability: totalGames > 0 ? +(totalInterceptions / totalGames).toFixed(4) : 0,
      miscommunicationRate: totalGames > 0 ? +(totalMiscommunications / totalGames).toFixed(4) : 0,
      avgRounds: totalGames > 0 ? +(totalRounds / totalGames).toFixed(1) : 0,
      matchIds,
    });
  }

  // Compute pairwise comparisons: for each model, compare each pair of strategies
  const pairwiseComparisons: PairwiseComparison[] = [];
  const models = config.models.map(m => m.model);
  const strategies = config.strategies;

  for (const model of models) {
    for (let i = 0; i < strategies.length; i++) {
      for (let j = i + 1; j < strategies.length; j++) {
        const cellA = cellResults.find(c => c.model === model && c.strategy === strategies[i]);
        const cellB = cellResults.find(c => c.model === model && c.strategy === strategies[j]);

        if (!cellA || !cellB) continue;

        const matchesA = await storage.getMatchesByIds(cellA.matchIds);
        const matchesB = await storage.getMatchesByIds(cellB.matchIds);

        const winsA = matchesA.map(m => m.winner === "amber" ? 1 : 0);
        const winsB = matchesB.map(m => m.winner === "amber" ? 1 : 0);

        let effectSize: number | null = null;
        let effectSizeMagnitude = "insufficient_data";

        if (winsA.length >= 2 && winsB.length >= 2) {
          effectSize = cohensD(winsA, winsB);
          const abs = Math.abs(effectSize);
          effectSizeMagnitude = abs < 0.2 ? "negligible" : abs < 0.5 ? "small" : abs < 0.8 ? "medium" : "large";
        }

        const winRateDiff = cellA.winRate - cellB.winRate;
        const totalGames = matchesA.length + matchesB.length;
        const absDiff = Math.abs(winRateDiff);
        let significanceIndicator = "Not significant";
        if (totalGames >= 20 && absDiff > 0.2) significanceIndicator = "Likely significant";
        else if (totalGames >= 10 && absDiff > 0.3) significanceIndicator = "Possibly significant";
        else if (totalGames < 5) significanceIndicator = "Insufficient data";

        pairwiseComparisons.push({
          model,
          strategyA: strategies[i],
          strategyB: strategies[j],
          effectSize,
          effectSizeMagnitude,
          winRateDiff: +winRateDiff.toFixed(4),
          significanceIndicator,
        });
      }
    }
  }

  const results = {
    matrix: cellResults,
    pairwiseComparisons,
    totalMatches: completedCount,
    totalCostUsd: totalCost.toFixed(4),
    baseSeed,
    config: {
      name: config.name,
      description: config.description,
      hypothesis: config.hypothesis,
      strategies: config.strategies,
      models: config.models,
      gamesPerCell: config.gamesPerCell,
      ablations: config.ablations,
    },
  };

  await storage.updateExperiment(experimentId, {
    status: "completed",
    completedAt: new Date(),
    results,
  });

  log(`[experiment] Experiment ${experimentId} completed: ${completedCount} matches, $${totalCost.toFixed(4)} total cost`, "experiment");
}
