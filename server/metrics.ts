import type { Match, MatchRound, AiCallLog } from "@shared/schema";

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
}

interface PlayerConfig {
  id: string;
  name: string;
  isAI: boolean;
  aiProvider?: string;
  aiConfig?: { provider: string; model: string; promptStrategy?: string };
  team: string;
}

function getPlayerConfigs(match: Match): PlayerConfig[] {
  return (match.playerConfigs as PlayerConfig[]) || [];
}

function getTeamModels(match: Match, team: string): string[] {
  const configs = getPlayerConfigs(match);
  return configs
    .filter(p => p.team === team && p.isAI)
    .map(p => p.aiConfig?.model || p.aiProvider || "unknown");
}

function getTeamStrategy(match: Match, team: string): string {
  const configs = getPlayerConfigs(match);
  const aiPlayer = configs.find(p => p.team === team && p.isAI);
  return aiPlayer?.aiConfig?.promptStrategy || "default";
}

function getModelProvider(match: Match, model: string): string {
  const configs = getPlayerConfigs(match);
  const player = configs.find(p => p.isAI && (p.aiConfig?.model === model || p.aiProvider === model));
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
    };
  });
}

export function computeMatchupMetrics(matches: Match[]): MatchupMetrics[] {
  const matchups: Record<string, { modelA: string; modelB: string; aWins: number; bWins: number; total: number }> = {};

  matches.forEach(match => {
    if (!match.winner) return;

    const amberModels = getTeamModels(match, "amber");
    const blueModels = getTeamModels(match, "blue");

    if (amberModels.length === 0 || blueModels.length === 0) return;

    const modelA = amberModels[0];
    const modelB = blueModels[0];
    const key = [modelA, modelB].sort().join(" vs ");

    if (!matchups[key]) {
      matchups[key] = { modelA: [modelA, modelB].sort()[0], modelB: [modelA, modelB].sort()[1], aWins: 0, bWins: 0, total: 0 };
    }

    matchups[key].total++;
    const sortedFirst = [modelA, modelB].sort()[0];
    if (match.winner === "amber") {
      if (modelA === sortedFirst) matchups[key].aWins++;
      else matchups[key].bWins++;
    } else {
      if (modelB === sortedFirst) matchups[key].aWins++;
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

  return {
    strategyA: { name: strategyAName, ...aStats },
    strategyB: { name: strategyBName, ...bStats },
    totalGames,
    significanceIndicator,
  };
}
