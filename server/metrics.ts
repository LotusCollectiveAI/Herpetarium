import type { Match, MatchRound, AiCallLog, MatchPlayerConfig } from "@shared/schema";
import { getStoredPlayerModelId, getStoredTeamRosters } from "@shared/schema";

// --- Bootstrap CI + Cohen's d (Week 1 Statistical Foundation) ---

export interface ConfidenceInterval {
  lower: number;
  upper: number;
  point: number;
}

/**
 * Non-parametric bootstrap confidence interval.
 * Resamples `data` with replacement `nBoot` times, computes `statFn`
 * on each resample, returns percentile-based CI at `1 - alpha` level.
 */
export function bootstrapConfidenceInterval(
  data: number[],
  statFn: (d: number[]) => number,
  options?: { nBoot?: number; alpha?: number }
): ConfidenceInterval {
  const nBoot = options?.nBoot ?? 1000;
  const alpha = options?.alpha ?? 0.05;
  const point = statFn(data);

  if (data.length < 2) {
    return { lower: point, upper: point, point };
  }

  const bootstrapStats: number[] = [];
  for (let b = 0; b < nBoot; b++) {
    const resample: number[] = [];
    for (let i = 0; i < data.length; i++) {
      resample.push(data[Math.floor(Math.random() * data.length)]);
    }
    bootstrapStats.push(statFn(resample));
  }

  bootstrapStats.sort((a, b) => a - b);
  const lowerIdx = Math.floor((alpha / 2) * nBoot);
  const upperIdx = Math.ceil((1 - alpha / 2) * nBoot);

  return {
    lower: bootstrapStats[lowerIdx],
    upper: bootstrapStats[Math.min(upperIdx, nBoot - 1)],
    point,
  };
}

/**
 * Cohen's d for independent samples.
 * Uses pooled standard deviation. Returns 0 if either group is empty
 * or has zero variance.
 */
export function cohensD(groupA: number[], groupB: number[]): number {
  if (groupA.length < 2 || groupB.length < 2) return 0;

  const meanA = groupA.reduce((s, v) => s + v, 0) / groupA.length;
  const meanB = groupB.reduce((s, v) => s + v, 0) / groupB.length;

  const varA = groupA.reduce((s, v) => s + (v - meanA) ** 2, 0) / (groupA.length - 1);
  const varB = groupB.reduce((s, v) => s + (v - meanB) ** 2, 0) / (groupB.length - 1);

  const pooledSD = Math.sqrt(
    ((groupA.length - 1) * varA + (groupB.length - 1) * varB) /
    (groupA.length + groupB.length - 2)
  );

  if (pooledSD === 0) return 0;
  return (meanA - meanB) / pooledSD;
}

export interface MatchMetrics {
  winRate: Record<string, number>;
  interceptionSuccessRate: Record<string, number>;
  interceptionVulnerability: Record<string, number>;
  miscommunicationRate: Record<string, number>;
  avgRoundsPerGame: number;
  clueDiversity: Record<string, number>;
  totalMatches: number;
  totalRounds: number;
}

export interface ParseQualityMetrics {
  model: string;
  totalCalls: number;
  cleanCount: number;
  partialRecoveryCount: number;
  fallbackUsedCount: number;
  errorCount: number;
  cleanRate: number;
  failureRate: number;
  totalTokens: number;
  totalCostUsd: number;
}

export interface ModelMetrics {
  model: string;
  provider: string;
  wins: number;
  losses: number;
  winRate: number;
  totalGames: number;
  interceptionSuccessRate: number;
  interceptionVulnerability: number;
  miscommunicationRate: number;
  avgRounds: number;
  clueDiversity: number;
  parseQuality?: ParseQualityMetrics;
  winRateCI?: ConfidenceInterval;
}

export interface MatchupMetrics {
  modelA: string;
  modelB: string;
  modelAWins: number;
  modelBWins: number;
  totalGames: number;
  modelAWinRate: number;
  modelBWinRate: number;
}

export interface ClueAnalysis {
  roundNumber: number;
  team: string;
  clueGiver: string;
  keywords: string[];
  code: number[];
  clues: string[];
  clueKeywordMap: Array<{ clue: string; keyword: string; position: number }>;
  ownCorrect: boolean;
  intercepted: boolean;
  status: "good" | "too_obvious" | "too_obscure";
}

export interface ExperimentResult {
  strategyA: {
    name: string;
    wins: number;
    losses: number;
    winRate: number;
    interceptionSuccessRate: number;
    interceptionVulnerability: number;
    miscommunicationRate: number;
    avgRounds: number;
    clueDiversity: number;
  };
  strategyB: {
    name: string;
    wins: number;
    losses: number;
    winRate: number;
    interceptionSuccessRate: number;
    interceptionVulnerability: number;
    miscommunicationRate: number;
    avgRounds: number;
    clueDiversity: number;
  };
  totalGames: number;
  significanceIndicator: string;
  winRateCI_A?: ConfidenceInterval;
  winRateCI_B?: ConfidenceInterval;
  effectSize?: number;
  effectSizeMagnitude?: string;
}

interface PlayerConfig {
  id: string;
  name: string;
  isAI: boolean;
  aiProvider?: string | null;
  aiConfig?: { provider: string; model: string; promptStrategy?: string } | null;
  team: string | null;
  modelKey?: string | null;
  rosterId?: string | null;
  rosterLabel?: string | null;
  rosterCompositionKey?: string | null;
  rosterModels?: string[] | null;
}

function getPlayerConfigs(match: Match): PlayerConfig[] {
  return (match.playerConfigs as PlayerConfig[]) || [];
}

function getTeamModels(match: Match, team: string): string[] {
  const configs = getPlayerConfigs(match);
  return Array.from(new Set(
    configs
      .filter((player) => player.team === team && player.isAI)
      .map((player) => getStoredPlayerModelId(player as MatchPlayerConfig))
      .filter((model): model is string => Boolean(model)),
  ));
}

function getTeamProviders(match: Match, team: string): string[] {
  const configs = getPlayerConfigs(match);
  return Array.from(new Set(
    configs
      .filter((player) => player.team === team && player.isAI)
      .map((player) => player.aiConfig?.provider || player.aiProvider || "unknown"),
  ));
}

function getTeamRoster(match: Match, team: "amber" | "blue") {
  return getStoredTeamRosters(getPlayerConfigs(match) as MatchPlayerConfig[])[team];
}

function getTeamStrategy(match: Match, team: string): string {
  const configs = getPlayerConfigs(match);
  const aiPlayer = configs.find(p => p.team === team && p.isAI);
  return aiPlayer?.aiConfig?.promptStrategy || "default";
}

function getModelProvider(match: Match, model: string): string {
  const configs = getPlayerConfigs(match);
  const player = configs.find((candidate) =>
    candidate.isAI && getStoredPlayerModelId(candidate as MatchPlayerConfig) === model,
  );
  return player?.aiConfig?.provider || player?.aiProvider || "unknown";
}

export function computeModelMetrics(
  matches: Match[],
  rounds: MatchRound[][]
): ModelMetrics[] {
  const modelStats: Record<string, {
    wins: number;
    losses: number;
    totalGames: number;
    interceptionSuccesses: number;
    interceptionAttempts: number;
    timesIntercepted: number;
    timesCluesGiven: number;
    miscommunications: number;
    totalOwnGuesses: number;
    totalRounds: number;
    allClues: string[];
  }> = {};

  matches.forEach((match, idx) => {
    const matchRounds = rounds[idx] || [];
    const teams = ["amber", "blue"] as const;

    teams.forEach(team => {
      const models = [...new Set(getTeamModels(match, team))];
      const opponentTeam = team === "amber" ? "blue" : "amber";

      models.forEach(model => {
        if (!modelStats[model]) {
          modelStats[model] = {
            wins: 0, losses: 0, totalGames: 0,
            interceptionSuccesses: 0, interceptionAttempts: 0,
            timesIntercepted: 0, timesCluesGiven: 0,
            miscommunications: 0, totalOwnGuesses: 0,
            totalRounds: 0, allClues: [],
          };
        }

        const stats = modelStats[model];
        stats.totalGames++;
        stats.totalRounds += match.totalRounds;

        if (match.winner === team) stats.wins++;
        else if (match.winner) stats.losses++;

        const teamRounds = matchRounds.filter(r => r.team === team);
        const opponentRounds = matchRounds.filter(r => r.team === opponentTeam);

        teamRounds.forEach(r => {
          stats.timesCluesGiven++;
          stats.allClues.push(...(r.clues as string[]));
          if (r.ownGuess) {
            stats.totalOwnGuesses++;
            if (!r.ownCorrect) stats.miscommunications++;
          }
          if (r.intercepted) stats.timesIntercepted++;
        });

        opponentRounds.forEach(r => {
          if (r.opponentGuess) {
            stats.interceptionAttempts++;
            if (r.intercepted) stats.interceptionSuccesses++;
          }
        });
      });
    });
  });

  return Object.entries(modelStats).map(([model, stats]) => {
    const uniqueClues = new Set(stats.allClues.map(c => c.toLowerCase().trim()));
    let provider = "unknown";
    for (const match of matches) {
      const found = getModelProvider(match, model);
      if (found !== "unknown") { provider = found; break; }
    }

    // Build per-game win indicator array for bootstrap CI
    const winIndicators: number[] = [];
    matches.forEach(match => {
      const teams = ["amber", "blue"] as const;
      for (const team of teams) {
        const models = [...new Set(getTeamModels(match, team))];
        if (models.includes(model)) {
          winIndicators.push(match.winner === team ? 1 : 0);
        }
      }
    });

    const meanFn = (arr: number[]) => arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
    const winRateCI = winIndicators.length >= 2
      ? bootstrapConfidenceInterval(winIndicators, meanFn)
      : undefined;

    return {
      model,
      provider,
      wins: stats.wins,
      losses: stats.losses,
      winRate: stats.totalGames > 0 ? stats.wins / stats.totalGames : 0,
      totalGames: stats.totalGames,
      interceptionSuccessRate: stats.interceptionAttempts > 0
        ? stats.interceptionSuccesses / stats.interceptionAttempts : 0,
      interceptionVulnerability: stats.timesCluesGiven > 0
        ? stats.timesIntercepted / stats.timesCluesGiven : 0,
      miscommunicationRate: stats.totalOwnGuesses > 0
        ? stats.miscommunications / stats.totalOwnGuesses : 0,
      avgRounds: stats.totalGames > 0 ? stats.totalRounds / stats.totalGames : 0,
      clueDiversity: stats.allClues.length > 0
        ? uniqueClues.size / stats.allClues.length : 0,
      winRateCI,
    };
  });
}

export function computeParseQualityMetrics(aiLogs: AiCallLog[]): ParseQualityMetrics[] {
  const byModel: Record<string, {
    totalCalls: number; clean: number; partial: number; fallback: number; error: number;
    totalTokens: number; totalCost: number;
  }> = {};

  for (const log of aiLogs) {
    const model = log.model;
    if (!byModel[model]) {
      byModel[model] = { totalCalls: 0, clean: 0, partial: 0, fallback: 0, error: 0, totalTokens: 0, totalCost: 0 };
    }
    const s = byModel[model];
    s.totalCalls++;
    switch (log.parseQuality) {
      case "clean": s.clean++; break;
      case "partial_recovery": s.partial++; break;
      case "fallback_used": s.fallback++; break;
      case "error": s.error++; break;
    }
    s.totalTokens += log.totalTokens || 0;
    s.totalCost += log.estimatedCostUsd ? parseFloat(log.estimatedCostUsd) : 0;
  }

  return Object.entries(byModel).map(([model, s]) => ({
    model,
    totalCalls: s.totalCalls,
    cleanCount: s.clean,
    partialRecoveryCount: s.partial,
    fallbackUsedCount: s.fallback,
    errorCount: s.error,
    cleanRate: s.totalCalls > 0 ? s.clean / s.totalCalls : 0,
    failureRate: s.totalCalls > 0 ? (s.fallback + s.error) / s.totalCalls : 0,
    totalTokens: s.totalTokens,
    totalCostUsd: Math.round(s.totalCost * 1000000) / 1000000,
  }));
}

export function computeMatchupMetrics(matches: Match[]): MatchupMetrics[] {
  const matchups: Record<string, { modelA: string; modelB: string; aWins: number; bWins: number; total: number }> = {};

  matches.forEach(match => {
    if (!match.winner) return;

    const amberRoster = getTeamRoster(match, "amber");
    const blueRoster = getTeamRoster(match, "blue");

    if (amberRoster.models.length === 0 || blueRoster.models.length === 0) return;

    const modelA = amberRoster.label;
    const modelB = blueRoster.label;
    const key = [amberRoster.compositionKey, blueRoster.compositionKey].sort().join(" vs ");

    const amberSortedFirst = amberRoster.compositionKey <= blueRoster.compositionKey;
    if (!matchups[key]) {
      matchups[key] = amberSortedFirst
        ? { modelA, modelB, aWins: 0, bWins: 0, total: 0 }
        : { modelA: modelB, modelB: modelA, aWins: 0, bWins: 0, total: 0 };
    }

    matchups[key].total++;
    if (match.winner === "amber") {
      if (amberSortedFirst) matchups[key].aWins++;
      else matchups[key].bWins++;
    } else {
      if (!amberSortedFirst) matchups[key].aWins++;
      else matchups[key].bWins++;
    }
  });

  return Object.values(matchups).map(m => ({
    modelA: m.modelA,
    modelB: m.modelB,
    modelAWins: m.aWins,
    modelBWins: m.bWins,
    totalGames: m.total,
    modelAWinRate: m.total > 0 ? m.aWins / m.total : 0,
    modelBWinRate: m.total > 0 ? m.bWins / m.total : 0,
  }));
}

export function analyzeClues(
  match: Match,
  rounds: MatchRound[]
): ClueAnalysis[] {
  const amberKeywords = match.amberKeywords as string[];
  const blueKeywords = match.blueKeywords as string[];
  const configs = getPlayerConfigs(match);

  return rounds.map(round => {
    const keywords = round.team === "amber" ? amberKeywords : blueKeywords;
    const code = round.code as number[];
    const clues = round.clues as string[];
    const clueGiver = configs.find(p => p.id === round.clueGiverId);

    const clueKeywordMap = clues.map((clue, i) => ({
      clue,
      keyword: keywords[code[i] - 1] || `Position ${code[i]}`,
      position: code[i],
    }));

    let status: "good" | "too_obvious" | "too_obscure" = "good";
    if (round.intercepted) status = "too_obvious";
    else if (!round.ownCorrect) status = "too_obscure";

    return {
      roundNumber: round.roundNumber,
      team: round.team,
      clueGiver: clueGiver?.name || round.clueGiverId,
      keywords,
      code,
      clues,
      clueKeywordMap,
      ownCorrect: round.ownCorrect,
      intercepted: round.intercepted,
      status,
    };
  });
}

export function computeStrategyMetrics(
  matches: Match[],
  rounds: MatchRound[][]
): Record<string, ModelMetrics> {
  const strategyStats: Record<string, {
    wins: number;
    losses: number;
    totalGames: number;
    interceptionSuccesses: number;
    interceptionAttempts: number;
    timesIntercepted: number;
    timesCluesGiven: number;
    miscommunications: number;
    totalOwnGuesses: number;
    totalRounds: number;
    allClues: string[];
  }> = {};

  matches.forEach((match, idx) => {
    const matchRounds = rounds[idx] || [];
    const teams = ["amber", "blue"] as const;

    teams.forEach(team => {
      const strategy = getTeamStrategy(match, team);
      const opponentTeam = team === "amber" ? "blue" : "amber";

      if (!strategyStats[strategy]) {
        strategyStats[strategy] = {
          wins: 0, losses: 0, totalGames: 0,
          interceptionSuccesses: 0, interceptionAttempts: 0,
          timesIntercepted: 0, timesCluesGiven: 0,
          miscommunications: 0, totalOwnGuesses: 0,
          totalRounds: 0, allClues: [],
        };
      }

      const stats = strategyStats[strategy];
      stats.totalGames++;
      stats.totalRounds += match.totalRounds;

      if (match.winner === team) stats.wins++;
      else if (match.winner) stats.losses++;

      const teamRounds = matchRounds.filter(r => r.team === team);
      const opponentRounds = matchRounds.filter(r => r.team === opponentTeam);

      teamRounds.forEach(r => {
        stats.timesCluesGiven++;
        stats.allClues.push(...(r.clues as string[]));
        if (r.ownGuess) {
          stats.totalOwnGuesses++;
          if (!r.ownCorrect) stats.miscommunications++;
        }
        if (r.intercepted) stats.timesIntercepted++;
      });

      opponentRounds.forEach(r => {
        if (r.opponentGuess) {
          stats.interceptionAttempts++;
          if (r.intercepted) stats.interceptionSuccesses++;
        }
      });
    });
  });

  const result: Record<string, ModelMetrics> = {};
  for (const [strategy, stats] of Object.entries(strategyStats)) {
    const uniqueClues = new Set(stats.allClues.map(c => c.toLowerCase().trim()));
    result[strategy] = {
      model: strategy,
      provider: "strategy",
      wins: stats.wins,
      losses: stats.losses,
      winRate: stats.totalGames > 0 ? stats.wins / stats.totalGames : 0,
      totalGames: stats.totalGames,
      interceptionSuccessRate: stats.interceptionAttempts > 0
        ? stats.interceptionSuccesses / stats.interceptionAttempts : 0,
      interceptionVulnerability: stats.timesCluesGiven > 0
        ? stats.timesIntercepted / stats.timesCluesGiven : 0,
      miscommunicationRate: stats.totalOwnGuesses > 0
        ? stats.miscommunications / stats.totalOwnGuesses : 0,
      avgRounds: stats.totalGames > 0 ? stats.totalRounds / stats.totalGames : 0,
      clueDiversity: stats.allClues.length > 0
        ? uniqueClues.size / stats.allClues.length : 0,
    };
  }

  return result;
}

export interface TeamCompositionMetrics {
  mixedTeamWins: number;
  mixedTeamLosses: number;
  mixedTeamGames: number;
  mixedTeamWinRate: number;
  homogeneousTeamWins: number;
  homogeneousTeamLosses: number;
  homogeneousTeamGames: number;
  homogeneousTeamWinRate: number;
  synergyScores: Array<{
    rosterLabel: string;
    rosterKey: string;
    wins: number;
    losses: number;
    games: number;
    winRate: number;
    interceptionVulnerability: number;
  }>;
  interceptionByComposition: {
    mixedIntercepted: number;
    mixedCluesGiven: number;
    mixedInterceptionRate: number;
    homogeneousIntercepted: number;
    homogeneousCluesGiven: number;
    homogeneousInterceptionRate: number;
  };
}

export interface SelfPlayMetrics {
  modelStats: Array<{
    model: string;
    games: number;
    amberWins: number;
    blueWins: number;
    winRateVariance: number;
    avgGameLength: number;
    gameLengths: number[];
    tokenAccumulation: Array<{
      round: number;
      avgAmberWhite: number;
      avgAmberBlack: number;
      avgBlueWhite: number;
      avgBlueBlack: number;
    }>;
  }>;
  totalSelfPlayGames: number;
  avgSelfPlayLength: number;
  avgNonSelfPlayLength: number;
}

export interface CrossModelClueAnalysis extends ClueAnalysis {
  clueGiverProvider: string;
  guesserProviders: string[];
  isCrossModel: boolean;
}

export function computeTeamCompositionMetrics(
  matches: Match[],
  rounds: MatchRound[][]
): TeamCompositionMetrics {
  let mixedWins = 0, mixedLosses = 0, mixedGames = 0;
  let homoWins = 0, homoLosses = 0, homoGames = 0;
  let mixedIntercepted = 0, mixedCluesGiven = 0;
  let homoIntercepted = 0, homoCluesGiven = 0;

  const pairStats: Record<string, { label: string; wins: number; losses: number; games: number; intercepted: number; cluesGiven: number }> = {};

  matches.forEach((match, idx) => {
    const matchRounds = rounds[idx] || [];
    const teams = ["amber", "blue"] as const;

    teams.forEach(team => {
      const roster = getTeamRoster(match, team as "amber" | "blue");
      const uniqueModels = Array.from(new Set(roster.models));
      const isMixed = uniqueModels.length > 1;
      const pairKey = roster.compositionKey;
      const teamRounds = matchRounds.filter(r => r.team === team);

      if (!pairStats[pairKey]) {
        pairStats[pairKey] = { label: roster.label, wins: 0, losses: 0, games: 0, intercepted: 0, cluesGiven: 0 };
      }
      pairStats[pairKey].games++;

      const teamIntercepted = teamRounds.filter(r => r.intercepted).length;
      const teamCluesGiven = teamRounds.length;

      pairStats[pairKey].intercepted += teamIntercepted;
      pairStats[pairKey].cluesGiven += teamCluesGiven;

      if (isMixed) {
        mixedGames++;
        mixedIntercepted += teamIntercepted;
        mixedCluesGiven += teamCluesGiven;
        if (match.winner === team) { mixedWins++; pairStats[pairKey].wins++; }
        else if (match.winner) { mixedLosses++; pairStats[pairKey].losses++; }
      } else {
        homoGames++;
        homoIntercepted += teamIntercepted;
        homoCluesGiven += teamCluesGiven;
        if (match.winner === team) { homoWins++; pairStats[pairKey].wins++; }
        else if (match.winner) { homoLosses++; pairStats[pairKey].losses++; }
      }
    });
  });

  const synergyScores = Object.entries(pairStats).map(([key, stats]) => {
    return {
      rosterLabel: stats.label,
      rosterKey: key,
      wins: stats.wins,
      losses: stats.losses,
      games: stats.games,
      winRate: stats.games > 0 ? stats.wins / stats.games : 0,
      interceptionVulnerability: stats.cluesGiven > 0 ? stats.intercepted / stats.cluesGiven : 0,
    };
  });

  return {
    mixedTeamWins: mixedWins,
    mixedTeamLosses: mixedLosses,
    mixedTeamGames: mixedGames,
    mixedTeamWinRate: mixedGames > 0 ? mixedWins / mixedGames : 0,
    homogeneousTeamWins: homoWins,
    homogeneousTeamLosses: homoLosses,
    homogeneousTeamGames: homoGames,
    homogeneousTeamWinRate: homoGames > 0 ? homoWins / homoGames : 0,
    synergyScores,
    interceptionByComposition: {
      mixedIntercepted,
      mixedCluesGiven,
      mixedInterceptionRate: mixedCluesGiven > 0 ? mixedIntercepted / mixedCluesGiven : 0,
      homogeneousIntercepted: homoIntercepted,
      homogeneousCluesGiven: homoCluesGiven,
      homogeneousInterceptionRate: homoCluesGiven > 0 ? homoIntercepted / homoCluesGiven : 0,
    },
  };
}

export function computeSelfPlayMetrics(
  matches: Match[],
  rounds: MatchRound[][]
): SelfPlayMetrics {
  const selfPlayByRoster: Record<string, {
    label: string;
    games: number;
    amberWins: number;
    blueWins: number;
    gameLengths: number[];
    outcomes: number[];
    roundData: Record<number, {
      amberMiscomm: number[];
      amberIntercept: number[];
      blueMiscomm: number[];
      blueIntercept: number[];
    }>;
  }> = {};

  let totalSelfPlayLength = 0;
  let totalSelfPlayGames = 0;
  let totalNonSelfPlayLength = 0;
  let totalNonSelfPlayGames = 0;

  matches.forEach((match, idx) => {
    const amberRoster = getTeamRoster(match, "amber");
    const blueRoster = getTeamRoster(match, "blue");
    const isSelfPlay = amberRoster.models.length > 0 &&
      amberRoster.compositionKey === blueRoster.compositionKey;

    if (isSelfPlay) {
      const rosterKey = amberRoster.compositionKey;
      if (!selfPlayByRoster[rosterKey]) {
        selfPlayByRoster[rosterKey] = {
          label: amberRoster.label,
          games: 0,
          amberWins: 0,
          blueWins: 0,
          gameLengths: [],
          outcomes: [],
          roundData: {},
        };
      }
      const stats = selfPlayByRoster[rosterKey];
      stats.games++;
      stats.gameLengths.push(match.totalRounds);
      totalSelfPlayLength += match.totalRounds;
      totalSelfPlayGames++;

      if (match.winner === "amber") { stats.amberWins++; stats.outcomes.push(1); }
      else if (match.winner === "blue") { stats.blueWins++; stats.outcomes.push(0); }

      const matchRounds = rounds[idx] || [];
      let awCum = 0, abCum = 0, bwCum = 0, bbCum = 0;

      const maxRound = Math.max(...matchRounds.map(r => r.roundNumber), 0);
      for (let r = 1; r <= maxRound; r++) {
        const amberRounds = matchRounds.filter(mr => mr.roundNumber === r && mr.team === "amber");
        const blueRounds = matchRounds.filter(mr => mr.roundNumber === r && mr.team === "blue");

        for (const ar of amberRounds) {
          if (!ar.ownCorrect) awCum++;
          if (ar.intercepted) abCum++;
        }
        for (const br of blueRounds) {
          if (!br.ownCorrect) bwCum++;
          if (br.intercepted) bbCum++;
        }

        if (!stats.roundData[r]) {
          stats.roundData[r] = { amberMiscomm: [], amberIntercept: [], blueMiscomm: [], blueIntercept: [] };
        }
        stats.roundData[r].amberMiscomm.push(awCum);
        stats.roundData[r].amberIntercept.push(abCum);
        stats.roundData[r].blueMiscomm.push(bwCum);
        stats.roundData[r].blueIntercept.push(bbCum);
      }
    } else {
      totalNonSelfPlayLength += match.totalRounds;
      totalNonSelfPlayGames++;
    }
  });

  const modelStats = Object.entries(selfPlayByRoster).map(([, stats]) => {
    const winRate = stats.games > 0 ? stats.amberWins / stats.games : 0.5;
    const winRateVariance = stats.outcomes.length > 1
      ? stats.outcomes.reduce((acc, w) => acc + Math.pow(w - winRate, 2), 0) / stats.outcomes.length
      : 0;

    const avgGameLength = stats.gameLengths.length > 0
      ? stats.gameLengths.reduce((a, b) => a + b, 0) / stats.gameLengths.length
      : 0;

    const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

    const tokenAccumulation = Object.entries(stats.roundData)
      .sort(([a], [b]) => parseInt(a) - parseInt(b))
      .map(([round, data]) => ({
        round: parseInt(round),
        avgAmberWhite: avg(data.amberMiscomm),
        avgAmberBlack: avg(data.amberIntercept),
        avgBlueWhite: avg(data.blueMiscomm),
        avgBlueBlack: avg(data.blueIntercept),
      }));

    return {
      model: stats.label,
      games: stats.games,
      amberWins: stats.amberWins,
      blueWins: stats.blueWins,
      winRateVariance,
      avgGameLength,
      gameLengths: stats.gameLengths,
      tokenAccumulation,
    };
  });

  return {
    modelStats,
    totalSelfPlayGames,
    avgSelfPlayLength: totalSelfPlayGames > 0 ? totalSelfPlayLength / totalSelfPlayGames : 0,
    avgNonSelfPlayLength: totalNonSelfPlayGames > 0 ? totalNonSelfPlayLength / totalNonSelfPlayGames : 0,
  };
}

export function analyzeCrossModelClues(
  match: Match,
  rounds: MatchRound[]
): CrossModelClueAnalysis[] {
  const baseAnalysis = analyzeClues(match, rounds);
  const configs = getPlayerConfigs(match);

  return baseAnalysis.map((analysis, i) => {
    const round = rounds[i];
    const clueGiver = configs.find(p => p.id === round.clueGiverId);
    const clueGiverProvider = clueGiver?.aiConfig?.provider || clueGiver?.aiProvider || "unknown";

    const teammates = configs.filter(p =>
      p.team === round.team && p.id !== round.clueGiverId && p.isAI
    );
    const guesserProviders = teammates.map(p =>
      p.aiConfig?.provider || p.aiProvider || "unknown"
    );

    const isCrossModel = guesserProviders.some(gp => gp !== clueGiverProvider);

    return {
      ...analysis,
      clueGiverProvider,
      guesserProviders,
      isCrossModel,
    };
  });
}

export function computeExperimentResults(
  strategyAName: string,
  strategyBName: string,
  matchesA: Match[],
  matchesB: Match[],
  roundsA: MatchRound[][],
  roundsB: MatchRound[][]
): ExperimentResult {
  const metricsA = computeStrategyMetrics(matchesA, roundsA);
  const metricsB = computeStrategyMetrics(matchesB, roundsB);

  const aStats = metricsA[strategyAName] || {
    wins: 0, losses: 0, winRate: 0, totalGames: 0,
    interceptionSuccessRate: 0, interceptionVulnerability: 0,
    miscommunicationRate: 0, avgRounds: 0, clueDiversity: 0,
  };
  const bStats = metricsB[strategyBName] || {
    wins: 0, losses: 0, winRate: 0, totalGames: 0,
    interceptionSuccessRate: 0, interceptionVulnerability: 0,
    miscommunicationRate: 0, avgRounds: 0, clueDiversity: 0,
  };

  const totalGames = matchesA.length + matchesB.length;
  const winDiff = Math.abs(aStats.winRate - bStats.winRate);
  let significanceIndicator = "Not significant";
  if (totalGames >= 20 && winDiff > 0.2) significanceIndicator = "Likely significant";
  else if (totalGames >= 10 && winDiff > 0.3) significanceIndicator = "Possibly significant";
  else if (totalGames < 5) significanceIndicator = "Insufficient data";

  // Build per-match win indicator arrays for CIs and effect size
  const meanFn = (arr: number[]) => arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  const winsArrayA = matchesA.map(m => {
    // Strategy A's team wins if the match winner matches a team using strategy A
    const configs = (m.playerConfigs as any[]) || [];
    for (const p of configs) {
      const strat = p.aiConfig?.promptStrategy || "default";
      if (strat === strategyAName && m.winner === p.team) return 1;
    }
    return 0;
  });

  const winsArrayB = matchesB.map(m => {
    const configs = (m.playerConfigs as any[]) || [];
    for (const p of configs) {
      const strat = p.aiConfig?.promptStrategy || "default";
      if (strat === strategyBName && m.winner === p.team) return 1;
    }
    return 0;
  });

  const winRateCI_A = winsArrayA.length >= 2
    ? bootstrapConfidenceInterval(winsArrayA, meanFn)
    : undefined;
  const winRateCI_B = winsArrayB.length >= 2
    ? bootstrapConfidenceInterval(winsArrayB, meanFn)
    : undefined;

  const effectSize = (winsArrayA.length >= 2 && winsArrayB.length >= 2)
    ? cohensD(winsArrayA, winsArrayB)
    : undefined;

  const abs = effectSize !== undefined ? Math.abs(effectSize) : 0;
  const effectSizeMagnitude = effectSize !== undefined
    ? (abs < 0.2 ? "negligible" : abs < 0.5 ? "small" : abs < 0.8 ? "medium" : "large")
    : undefined;

  return {
    strategyA: { name: strategyAName, ...aStats },
    strategyB: { name: strategyBName, ...bStats },
    totalGames,
    significanceIndicator,
    winRateCI_A,
    winRateCI_B,
    effectSize,
    effectSizeMagnitude,
  };
}
