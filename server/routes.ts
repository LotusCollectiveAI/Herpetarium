import type { Express } from "express";
import type { Server } from "http";
import { setupWebSocket, createGame } from "./websocket";
import { createGameSchema, HeadlessMatchConfig, TournamentConfig, aiPlayerConfigSchema } from "@shared/schema";
import { getModelCost } from "@shared/modelRegistry";
import { storage } from "./storage";
import { runHeadlessMatch } from "./headlessRunner";
import { createTournament, runTournament, isTournamentRunning, generateRoundRobinConfigs, interleaveByProvider } from "./tournament";
import { createSeries, runSeries, isSeriesRunning, getPlayerConfigHash } from "./seriesRunner";
import { createEvolutionRun, runEvolution, isEvolutionRunning, stopEvolutionRun } from "./evolution";
import { z } from "zod";
import { experimentConfigSchema } from "@shared/schema";
import { runExperiment } from "./experimentRunner";
import { registerExportRoutes } from "./exportRouter";
import { computeModelMetrics, computeMatchupMetrics, computeStrategyMetrics, analyzeClues, computeTeamCompositionMetrics, computeSelfPlayMetrics, analyzeCrossModelClues, computeParseQualityMetrics } from "./metrics";
import { getProviderThrottleState } from "./ai";
import { getDefaultConfig, type AIProvider } from "@shared/schema";
import { validateModels } from "./modelValidation";
import { computeMatchTomMetrics, buildTomTimeline } from "./tomAnalyzer";
import { bradleyTerryRatings, btWinProbability } from "./bradleyTerry";

function computeEstimatedCost(players: Array<{ aiProvider?: string; aiConfig?: any }>, totalGames: number, includeReflection = false, teamSize: number = 2): number {
  const AVG_ROUNDS_PER_GAME = 6;
  const CALL_TYPE_TOKENS: Record<string, { input: number; output: number; callsPerRound: number }> = {
    clue:        { input: 900, output: 150, callsPerRound: 1 },
    guess:       { input: 650, output: 80,  callsPerRound: teamSize === 3 ? 0 : 1 },
    intercept:   { input: 750, output: 80,  callsPerRound: teamSize === 3 ? 0 : 0.5 },
    reflection:  { input: 1200, output: 300, callsPerRound: 0 },
    // 3v3 deliberation: avg ~4 exchanges * 2 players per phase
    deliberation_own:       { input: 2000, output: 500, callsPerRound: teamSize === 3 ? 8 : 0 },
    deliberation_intercept: { input: 3000, output: 500, callsPerRound: teamSize === 3 ? 8 : 0 },
  };
  let total = 0;
  const uniqueModels = new Map<string, { provider: string; count: number }>();
  for (const p of players) {
    if (!p.aiProvider) continue;
    const config = p.aiConfig || getDefaultConfig(p.aiProvider as AIProvider);
    const model = config.model || getDefaultConfig(p.aiProvider as AIProvider).model;
    const key = `${p.aiProvider}:${model}`;
    const existing = uniqueModels.get(key);
    if (existing) existing.count++; else uniqueModels.set(key, { provider: p.aiProvider, count: 1 });
  }
  for (const [key, info] of uniqueModels) {
    const [provider, model] = key.split(":");
    const costs = getModelCost(provider as AIProvider, model);
    if (!costs) continue;
    for (const [callType, spec] of Object.entries(CALL_TYPE_TOKENS)) {
      if (callType === "reflection" && !includeReflection) continue;
      const callsPerGame = callType === "reflection" ? 1 : spec.callsPerRound * AVG_ROUNDS_PER_GAME;
      const costPerCall = (spec.input / 1000) * costs.input + (spec.output / 1000) * costs.output;
      total += costPerCall * callsPerGame * info.count * totalGames;
    }
  }
  return +total.toFixed(4);
}

const headlessMatchConfigSchema = z.object({
  players: z.array(z.object({
    name: z.string(),
    aiProvider: z.enum(["chatgpt", "claude", "gemini", "openrouter"]),
    team: z.enum(["amber", "blue"]),
    aiConfig: aiPlayerConfigSchema.optional(),
  })).min(2).max(6),
  fastMode: z.boolean().optional(),
  seed: z.union([z.string(), z.number().int().transform(String)]).optional(),
  teamSize: z.number().int().min(2).max(3).optional(),
});

const ablationFlagSchema = z.enum(["no_history", "no_scratch_notes", "no_opponent_history", "no_chain_of_thought", "random_clues", "no_persona", "no_semantic_context"]);

const tournamentConfigSchema = z.object({
  name: z.string().min(1).max(200),
  matchConfigs: z.array(headlessMatchConfigSchema).min(1),
  gamesPerMatchup: z.number().int().min(1).max(100).optional(),
  budgetCapUsd: z.string().optional(),
  concurrency: z.number().int().min(1).max(20).optional(),
  delayBetweenMatchesMs: z.number().int().min(0).max(60000).optional(),
  skipModelValidation: z.boolean().optional(),
  ablations: z.object({ flags: z.array(ablationFlagSchema).min(1) }).optional(),
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  setupWebSocket(httpServer);
  
  app.post("/api/games", (req, res) => {
    try {
      const parsed = createGameSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request body" });
      }
      
      const result = createGame(parsed.data.hostName);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to create game" });
    }
  });

  app.get("/api/matches", async (req, res) => {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
      const model = req.query.model as string | undefined;
      const winner = req.query.winner as string | undefined;
      const dateFrom = req.query.dateFrom as string | undefined;
      const dateTo = req.query.dateTo as string | undefined;
      const experimentId = req.query.experimentId as string | undefined;

      const result = await storage.getMatches({ page, limit, model, winner, dateFrom, dateTo, experimentId });
      const matchIds = result.matches.map(m => m.id);
      const traceMatchIds = await storage.getMatchIdsWithTraces(matchIds);
      res.json({
        matches: result.matches,
        total: result.total,
        page,
        limit,
        totalPages: Math.ceil(result.total / limit),
        matchIdsWithTraces: Array.from(traceMatchIds),
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to fetch matches" });
    }
  });

  app.get("/api/matches/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid match ID" });
      }

      const match = await storage.getMatch(id);
      if (!match) {
        return res.status(404).json({ error: "Match not found" });
      }

      const rounds = await storage.getMatchRounds(id);
      const aiLogs = await storage.getAiCallLogs(id);

      res.json({ match, rounds, aiLogs });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to fetch match" });
    }
  });

  app.post("/api/matches/run", async (req, res) => {
    try {
      const parsed = headlessMatchConfigSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid match configuration", details: parsed.error.issues });
      }

      const config = parsed.data as HeadlessMatchConfig;

      const amberCount = config.players.filter(p => p.team === "amber").length;
      const blueCount = config.players.filter(p => p.team === "blue").length;
      if (amberCount < 2 || blueCount < 2) {
        return res.status(400).json({ error: "Each team must have at least 2 players" });
      }

      res.json({ status: "started", message: "Match is running. Check /api/matches for results." });

      runHeadlessMatch(config).catch(err => {
        console.error("Headless match failed:", err);
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to start match" });
    }
  });

  app.post("/api/matches/run/sync", async (req, res) => {
    try {
      const parsed = headlessMatchConfigSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid match configuration", details: parsed.error.issues });
      }

      const config = parsed.data as HeadlessMatchConfig;

      const amberCount = config.players.filter(p => p.team === "amber").length;
      const blueCount = config.players.filter(p => p.team === "blue").length;
      if (amberCount < 2 || blueCount < 2) {
        return res.status(400).json({ error: "Each team must have at least 2 players" });
      }

      const result = await runHeadlessMatch(config);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to run match" });
    }
  });

  app.post("/api/tournaments", async (req, res) => {
    try {
      const parsed = tournamentConfigSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid tournament configuration", details: parsed.error.issues });
      }

      const { skipModelValidation, ...config } = parsed.data;
      const tournamentConfig = config as TournamentConfig;

      for (const mc of tournamentConfig.matchConfigs) {
        const amberCount = mc.players.filter(p => p.team === "amber").length;
        const blueCount = mc.players.filter(p => p.team === "blue").length;
        if (amberCount < 2 || blueCount < 2) {
          return res.status(400).json({ error: "Each team in every matchup must have at least 2 players" });
        }
      }

      if (!skipModelValidation) {
        const validation = await validateModels(tournamentConfig.matchConfigs);
        if (!validation.ok) {
          return res.status(400).json({ error: "Model validation failed", validation });
        }
      }

      const gamesPerMatchup = tournamentConfig.gamesPerMatchup || 1;
      let estimatedCost = 0;
      for (const mc of tournamentConfig.matchConfigs) {
        estimatedCost += computeEstimatedCost(mc.players, gamesPerMatchup);
      }

      const tournament = await createTournament(tournamentConfig, estimatedCost > 0 ? estimatedCost.toFixed(4) : null);

      runTournament(tournament.id).catch(err => {
        console.error("Tournament execution failed:", err);
      });

      res.json({ id: tournament.id, status: "started" });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to create tournament" });
    }
  });

  // ── Round-robin tournament endpoint ─────────────────────────────────
  const roundRobinSchema = z.object({
    name: z.string().min(1).max(200),
    models: z.array(z.object({
      name: z.string(),
      provider: z.enum(["chatgpt", "claude", "gemini", "openrouter"]),
      model: z.string(),
      reasoningEffort: z.enum(["low", "medium", "high", "xhigh"]).optional(),
    })).min(2),
    gamesPerMatchup: z.number().int().min(1).max(100).default(4),
    concurrency: z.number().int().min(1).max(20).default(10),
    delayBetweenMatchesMs: z.number().int().min(0).max(60000).default(12000),
    budgetCapUsd: z.string().default("250.00"),
    teamSize: z.number().int().min(2).max(3).default(3),
    skipModelValidation: z.boolean().optional(),
  });

  app.post("/api/tournaments/round-robin", async (req, res) => {
    try {
      const parsed = roundRobinSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid round-robin configuration", details: parsed.error.issues });
      }

      const { name, models, gamesPerMatchup, concurrency, delayBetweenMatchesMs, budgetCapUsd, teamSize, skipModelValidation } = parsed.data;

      // Build model specs — all models get advanced strategy, per-model reasoning effort
      const modelSpecs = models.map(m => ({
        name: m.name,
        provider: m.provider as AIProvider,
        model: m.model,
        config: {
          timeoutMs: 14400000 as const,
          promptStrategy: "advanced" as const,
          reasoningEffort: (m.reasoningEffort || "xhigh") as "low" | "medium" | "high" | "xhigh",
        },
      }));

      const rawConfigs = generateRoundRobinConfigs(modelSpecs, teamSize as 2 | 3);
      const matchConfigs = interleaveByProvider(rawConfigs);

      if (!skipModelValidation) {
        const validation = await validateModels(matchConfigs);
        if (!validation.ok) {
          return res.status(400).json({ error: "Model validation failed", validation });
        }
      }

      const tournamentConfig: TournamentConfig = {
        name,
        matchConfigs,
        gamesPerMatchup,
        concurrency,
        delayBetweenMatchesMs,
        budgetCapUsd,
      };

      // Estimate cost
      let estimatedCost = 0;
      for (const mc of matchConfigs) {
        estimatedCost += computeEstimatedCost(mc.players, gamesPerMatchup, false, teamSize);
      }

      const tournament = await createTournament(tournamentConfig, estimatedCost > 0 ? estimatedCost.toFixed(4) : null);

      runTournament(tournament.id).catch(err => {
        console.error("Round-robin tournament execution failed:", err);
      });

      const totalMatchups = (models.length * (models.length - 1)) / 2;
      res.json({
        id: tournament.id,
        status: "started",
        totalMatchups,
        totalMatches: totalMatchups * gamesPerMatchup,
        estimatedCostUsd: estimatedCost.toFixed(4),
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to create round-robin tournament" });
    }
  });

  app.get("/api/tournaments", async (req, res) => {
    try {
      const allTournaments = await storage.getTournaments();
      res.json(allTournaments);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to fetch tournaments" });
    }
  });

  app.get("/api/tournaments/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid tournament ID" });
      }

      const tournament = await storage.getTournament(id);
      if (!tournament) {
        return res.status(404).json({ error: "Tournament not found" });
      }

      const tournamentMatchesData = await storage.getTournamentMatches(id);

      const completedMatchIds = tournamentMatchesData
        .filter(tm => tm.matchId)
        .map(tm => tm.matchId as number);

      const matchDetails: any[] = [];
      for (const matchId of completedMatchIds) {
        const match = await storage.getMatch(matchId);
        if (match) matchDetails.push(match);
      }

      const stats = computeTournamentStats(matchDetails);

      // Compute Bradley-Terry ratings from tournament match results
      const btResults: Array<{ winner: string; loser: string }> = [];
      for (const match of matchDetails) {
        if (!match.winner) continue;
        const configs = match.playerConfigs as PlayerConfig[];
        const winnerTeam = match.winner;
        const loserTeam = winnerTeam === "amber" ? "blue" : "amber";
        const winnerPlayer = configs.find((c) => c.team === winnerTeam && c.isAI);
        const loserPlayer = configs.find((c) => c.team === loserTeam && c.isAI);
        const winnerModel = winnerPlayer ? getModelLabel(winnerPlayer) : "unknown";
        const loserModel = loserPlayer ? getModelLabel(loserPlayer) : "unknown";
        if (winnerModel !== "unknown" && loserModel !== "unknown" && winnerModel !== loserModel) {
          btResults.push({ winner: winnerModel, loser: loserModel });
        }
      }

      const btRatingsResult = bradleyTerryRatings(btResults);
      const btRatings = Object.fromEntries(btRatingsResult.ratings);

      res.json({ tournament, matches: tournamentMatchesData, matchDetails, stats, btRatings });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to fetch tournament" });
    }
  });

  app.get("/api/matches/:id/analysis", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid match ID" });
      }

      const match = await storage.getMatch(id);
      if (!match) {
        return res.status(404).json({ error: "Match not found" });
      }

      const rounds = await storage.getMatchRounds(id);
      const analysis = analyzeClues(match, rounds);
      const crossModelAnalysis = analyzeCrossModelClues(match, rounds);

      res.json({ match, analysis, crossModelAnalysis });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to analyze match" });
    }
  });

  app.get("/api/eval/metrics", async (req, res) => {
    try {
      const model = req.query.model as string | undefined;
      const strategy = req.query.strategy as string | undefined;
      const dateFrom = req.query.dateFrom as string | undefined;
      const dateTo = req.query.dateTo as string | undefined;
      const experimentId = req.query.experimentId as string | undefined;

      const allMatches = await storage.getAllMatches({ model, strategy, dateFrom, dateTo, experimentId });
      const matchIds = allMatches.map(m => m.id);
      const allRounds = await storage.getMatchRoundsForMatches(matchIds);

      const roundsByMatch = allMatches.map(m =>
        allRounds.filter(r => r.matchId === m.id)
      );

      const modelMetrics = computeModelMetrics(allMatches, roundsByMatch);
      const matchupMetrics = computeMatchupMetrics(allMatches);
      const strategyMetrics = computeStrategyMetrics(allMatches, roundsByMatch);

      const totalMatches = allMatches.length;
      const totalRounds = allRounds.length;
      const avgRoundsPerGame = totalMatches > 0 ? totalRounds / totalMatches / 2 : 0;

      const teamCompositionMetrics = computeTeamCompositionMetrics(allMatches, roundsByMatch);
      const selfPlayMetrics = computeSelfPlayMetrics(allMatches, roundsByMatch);

      const allAiLogs = await storage.getAllAiCallLogs(matchIds);
      const parseQualityMetrics = computeParseQualityMetrics(allAiLogs);

      // Compute Bradley-Terry global strength ratings from all matches
      const btResults: Array<{ winner: string; loser: string }> = [];
      for (const match of allMatches) {
        if (!match.winner) continue;
        const configs = match.playerConfigs as PlayerConfig[];
        const winnerTeam = match.winner;
        const loserTeam = winnerTeam === "amber" ? "blue" : "amber";
        const winnerPlayer = configs.find((c) => c.team === winnerTeam && c.isAI);
        const loserPlayer = configs.find((c) => c.team === loserTeam && c.isAI);
        const winnerModel = winnerPlayer ? getModelLabel(winnerPlayer) : "unknown";
        const loserModel = loserPlayer ? getModelLabel(loserPlayer) : "unknown";
        if (winnerModel !== "unknown" && loserModel !== "unknown" && winnerModel !== loserModel) {
          btResults.push({ winner: winnerModel, loser: loserModel });
        }
      }

      const btRatingsResult = bradleyTerryRatings(btResults);
      const btRatings = Object.fromEntries(btRatingsResult.ratings);

      res.json({
        modelMetrics,
        matchupMetrics,
        strategyMetrics,
        teamCompositionMetrics,
        selfPlayMetrics,
        parseQualityMetrics,
        btRatings,
        summary: {
          totalMatches,
          totalRounds,
          avgRoundsPerGame,
        },
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to compute metrics" });
    }
  });

  app.post("/api/experiments", async (req, res) => {
    try {
      const { name, model, provider, strategyA, strategyB, numGames } = req.body;
      if (!name || !model || !provider || !strategyA || !strategyB) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const experiment = await storage.createExperiment({
        name,
        model,
        provider,
        strategyA,
        strategyB,
        numGames: numGames || 10,
        status: "pending",
        matchIdsA: [],
        matchIdsB: [],
        results: null,
      });

      res.json(experiment);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to create experiment" });
    }
  });

  app.get("/api/experiments", async (req, res) => {
    try {
      const exps = await storage.getExperiments();
      res.json(exps);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to fetch experiments" });
    }
  });

  app.get("/api/experiments/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid experiment ID" });
      }

      const experiment = await storage.getExperiment(id);
      if (!experiment) {
        return res.status(404).json({ error: "Experiment not found" });
      }

      const matchIdsA = (experiment.matchIdsA as number[]) || [];
      const matchIdsB = (experiment.matchIdsB as number[]) || [];

      const matchesA = await storage.getMatchesByIds(matchIdsA);
      const matchesB = await storage.getMatchesByIds(matchIdsB);

      const allMatchIds = [...matchIdsA, ...matchIdsB];
      const allRounds = await storage.getMatchRoundsForMatches(allMatchIds);

      const roundsA = matchesA.map(m => allRounds.filter(r => r.matchId === m.id));
      const roundsB = matchesB.map(m => allRounds.filter(r => r.matchId === m.id));

      const modelMetricsA = computeModelMetrics(matchesA, roundsA);
      const modelMetricsB = computeModelMetrics(matchesB, roundsB);

      res.json({
        experiment,
        metricsA: modelMetricsA,
        metricsB: modelMetricsB,
        matchesA,
        matchesB,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to fetch experiment" });
    }
  });

  app.get("/api/export/matches", async (req, res) => {
    try {
      const format = (req.query.format as string) || "json";
      const model = req.query.model as string | undefined;
      const dateFrom = req.query.dateFrom as string | undefined;
      const dateTo = req.query.dateTo as string | undefined;
      const allMatches = await storage.getAllMatches({ model, dateFrom, dateTo });
      const matchIds = allMatches.map(m => m.id);
      const allRounds = await storage.getMatchRoundsForMatches(matchIds);

      if (format === "csv") {
        const csvRows = ["id,gameId,gameSeed,createdAt,completedAt,winner,totalRounds,amberWhiteTokens,amberBlackTokens,blueWhiteTokens,blueBlackTokens,amberKeywords,blueKeywords,playerConfigs"];
        allMatches.forEach(m => {
          const esc = (v: any) => typeof v === 'string' && v.includes(',') ? `"${v.replace(/"/g, '""')}"` : (v ?? "");
          csvRows.push([
            m.id, m.gameId,
            m.gameSeed || "",
            m.createdAt ? new Date(m.createdAt).toISOString() : "",
            m.completedAt ? new Date(m.completedAt).toISOString() : "",
            m.winner || "",
            m.totalRounds,
            m.amberWhiteTokens, m.amberBlackTokens,
            m.blueWhiteTokens, m.blueBlackTokens,
            esc(JSON.stringify(m.amberKeywords)),
            esc(JSON.stringify(m.blueKeywords)),
            esc(JSON.stringify(m.playerConfigs)),
          ].join(","));
        });
        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", "attachment; filename=matches.csv");
        res.send(csvRows.join("\n"));
      } else {
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Content-Disposition", "attachment; filename=matches.json");
        res.json({ matches: allMatches, rounds: allRounds });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to export matches" });
    }
  });

  app.get("/api/export/rounds", async (req, res) => {
    try {
      const format = (req.query.format as string) || "json";
      const model = req.query.model as string | undefined;
      const dateFrom = req.query.dateFrom as string | undefined;
      const dateTo = req.query.dateTo as string | undefined;

      const allMatches = await storage.getAllMatches({ model, dateFrom, dateTo });
      const matchIds = allMatches.map(m => m.id);
      const allRounds = await storage.getMatchRoundsForMatches(matchIds);

      if (format === "csv") {
        const csvRows = ["id,matchId,roundNumber,team,clues,code,ownGuess,opponentGuess,ownCorrect,intercepted,clueGiverId"];
        allRounds.forEach(r => {
          const esc = (v: unknown) => typeof v === 'string' && v.includes(',') ? `"${v.replace(/"/g, '""')}"` : (v ?? "");
          csvRows.push([
            r.id, r.matchId, r.roundNumber, r.team,
            esc(JSON.stringify(r.clues)),
            esc(JSON.stringify(r.code)),
            esc(JSON.stringify(r.ownGuess)),
            esc(JSON.stringify(r.opponentGuess)),
            r.ownCorrect ?? "",
            r.intercepted ?? "",
            r.clueGiverId || "",
          ].join(","));
        });
        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", "attachment; filename=rounds.csv");
        res.send(csvRows.join("\n"));
      } else {
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Content-Disposition", "attachment; filename=rounds.json");
        res.json(allRounds);
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Failed to export rounds";
      res.status(500).json({ error: msg });
    }
  });

  app.get("/api/export/ai-logs", async (req, res) => {
    try {
      const format = (req.query.format as string) || "json";
      const model = req.query.model as string | undefined;
      const dateFrom = req.query.dateFrom as string | undefined;
      const dateTo = req.query.dateTo as string | undefined;

      const allMatches = model || dateFrom || dateTo
        ? await storage.getAllMatches({ model, dateFrom, dateTo })
        : undefined;
      const matchIds = allMatches?.map(m => m.id);
      const allLogs = await storage.getAllAiCallLogs(matchIds);

      if (format === "csv") {
        const csvRows = ["id,matchId,gameId,roundNumber,provider,model,actionType,latencyMs,timedOut,parseQuality,promptTokens,completionTokens,totalTokens,estimatedCostUsd,error,createdAt"];
        allLogs.forEach(l => {
          csvRows.push([
            l.id, l.matchId || "", l.gameId || "",
            l.roundNumber || "",
            l.provider, l.model, l.actionType,
            l.latencyMs || "",
            l.timedOut,
            l.parseQuality || "",
            l.promptTokens || "",
            l.completionTokens || "",
            l.totalTokens || "",
            l.estimatedCostUsd || "",
            l.error ? `"${l.error.replace(/"/g, '""')}"` : "",
            l.createdAt ? new Date(l.createdAt).toISOString() : "",
          ].join(","));
        });
        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", "attachment; filename=ai-logs.csv");
        res.send(csvRows.join("\n"));
      } else {
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Content-Disposition", "attachment; filename=ai-logs.json");
        res.json(allLogs);
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to export AI logs" });
    }
  });

  const seriesConfigSchema = z.object({
    matchConfig: headlessMatchConfigSchema,
    totalGames: z.number().int().min(1).max(100),
    noteTokenBudget: z.number().int().min(100).max(5000).optional(),
    budgetCapUsd: z.string().optional(),
  });

  app.post("/api/series", async (req, res) => {
    try {
      const parsed = seriesConfigSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid series configuration", details: parsed.error.issues });
      }

      const config = parsed.data;
      const matchConfig = config.matchConfig as HeadlessMatchConfig;

      const amberCount = matchConfig.players.filter(p => p.team === "amber").length;
      const blueCount = matchConfig.players.filter(p => p.team === "blue").length;
      if (amberCount < 2 || blueCount < 2) {
        return res.status(400).json({ error: "Each team must have at least 2 players" });
      }

      const estimatedCost = computeEstimatedCost(matchConfig.players, config.totalGames, true);

      const s = await createSeries({
        matchConfig,
        totalGames: config.totalGames,
        noteTokenBudget: config.noteTokenBudget,
        budgetCapUsd: config.budgetCapUsd,
        estimatedCostUsd: estimatedCost > 0 ? estimatedCost.toFixed(4) : undefined,
      });

      runSeries(s.id).catch(err => {
        console.error("Series execution failed:", err);
      });

      res.json({ id: s.id, status: "started" });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to create series" });
    }
  });

  app.get("/api/series", async (req, res) => {
    try {
      const allSeries = await storage.getAllSeries();
      res.json(allSeries);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to fetch series" });
    }
  });

  app.get("/api/series/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid series ID" });
      }

      const s = await storage.getSeries(id);
      if (!s) {
        return res.status(404).json({ error: "Series not found" });
      }

      const notes = await storage.getScratchNotes(id);
      const running = isSeriesRunning(id);

      const config = s.config as any;
      const playerHashes = config.matchConfig?.players?.map((p: any) => ({
        hash: getPlayerConfigHash(p.aiProvider, p.team, p.name),
        provider: p.aiProvider,
        team: p.team,
        name: p.name,
      })) || [];

      const notesByPlayer: Record<string, any[]> = {};
      for (const ph of playerHashes) {
        notesByPlayer[ph.hash] = notes
          .filter(n => n.playerConfigHash === ph.hash)
          .map(n => ({
            ...n,
            playerName: ph.name,
            provider: ph.provider,
            team: ph.team,
          }));
      }

      const matchIds = [...new Set(notes.filter(n => n.matchId).map(n => n.matchId as number))];
      const unsortedDetails = await storage.getMatchesByIds(matchIds);
      const matchDetailsWithRounds = await Promise.all(
        unsortedDetails.sort((a: any, b: any) => a.id - b.id).map(async (m) => {
          const rounds = await storage.getMatchRounds(m.id);
          return { ...m, rounds };
        })
      );

      res.json({
        series: s,
        notes,
        notesByPlayer,
        playerHashes,
        matchDetails: matchDetailsWithRounds,
        running,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to fetch series" });
    }
  });

  app.get("/api/throttle-state", (_req, res) => {
    res.json(getProviderThrottleState());
  });

  app.get("/api/series/:id/tom", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid series ID" });
      }

      const s = await storage.getSeries(id);
      if (!s) {
        return res.status(404).json({ error: "Series not found" });
      }

      const notes = await storage.getScratchNotes(id);
      const config = s.config as any;
      const players = config.matchConfig?.players || [];

      const matchIds = [...new Set(notes.filter(n => n.matchId).map(n => n.matchId as number))];
      const allLogs = await storage.getAllAiCallLogs(matchIds);

      const timelines = players.map((p: any) => {
        const hash = getPlayerConfigHash(p.aiProvider, p.team, p.name);
        const playerNotes = notes
          .filter(n => n.playerConfigHash === hash)
          .map(n => ({ gameIndex: n.gameIndex, notesText: n.notesText, matchId: n.matchId }));

        return buildTomTimeline(allLogs, playerNotes, p.name, p.aiProvider, p.team);
      });

      res.json({ seriesId: id, timelines });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to compute ToM analysis" });
    }
  });

  app.get("/api/eval/tom", async (req, res) => {
    try {
      const model = req.query.model as string | undefined;
      const dateFrom = req.query.dateFrom as string | undefined;
      const dateTo = req.query.dateTo as string | undefined;

      const allMatches = await storage.getAllMatches({ model, dateFrom, dateTo });
      const matchIds = allMatches.map(m => m.id);
      const allLogs = await storage.getAllAiCallLogs(matchIds);

      const tomByModel: Record<string, { totalLevel: number; count: number; maxLevel: number; scores: number[] }> = {};
      for (const log of allLogs) {
        if (!log.rawResponse && !log.reasoningTrace) continue;
        const key = `${log.provider}:${log.model}`;
        const tom = computeMatchTomMetrics([log]);
        const analysis = Object.values(tom)[0];
        if (!analysis) continue;

        if (!tomByModel[key]) {
          tomByModel[key] = { totalLevel: 0, count: 0, maxLevel: 0, scores: [] };
        }
        tomByModel[key].totalLevel += analysis.level;
        tomByModel[key].count++;
        tomByModel[key].maxLevel = Math.max(tomByModel[key].maxLevel, analysis.level);
        tomByModel[key].scores.push(analysis.score);
      }

      const summary = Object.entries(tomByModel).map(([key, data]) => {
        const [provider, model] = key.split(":");
        return {
          provider,
          model,
          avgLevel: +(data.totalLevel / data.count).toFixed(2),
          maxLevel: data.maxLevel,
          avgScore: +(data.scores.reduce((a, b) => a + b, 0) / data.scores.length).toFixed(2),
          sampleSize: data.count,
        };
      });

      res.json({ summary });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to compute ToM metrics" });
    }
  });

  app.get("/api/eval/ablations", async (req, res) => {
    try {
      const allMatches = await storage.getAllMatches({});

      interface AblationGroup {
        condition: string;
        wins: number;
        losses: number;
        totalMatches: number;
        avgRounds: number;
        totalInterceptions: number;
        totalMiscommunications: number;
      }

      const groups: Record<string, AblationGroup> = {};

      for (const match of allMatches) {
        if (!match.winner) continue;

        const ablations = match.ablations as { flags: string[] } | null;
        const condition = ablations?.flags?.length
          ? ablations.flags.sort().join("+")
          : "baseline";

        if (!groups[condition]) {
          groups[condition] = { condition, wins: 0, losses: 0, totalMatches: 0, avgRounds: 0, totalInterceptions: 0, totalMiscommunications: 0 };
        }

        const g = groups[condition];
        g.totalMatches++;
        g.avgRounds += match.totalRounds;
        g.totalInterceptions += match.amberBlackTokens + match.blueBlackTokens;
        g.totalMiscommunications += match.amberWhiteTokens + match.blueWhiteTokens;

        if (match.winner === "amber") g.wins++;
        else g.losses++;
      }

      const comparison = Object.values(groups).map(g => ({
        ...g,
        avgRounds: g.totalMatches > 0 ? +(g.avgRounds / g.totalMatches).toFixed(1) : 0,
        winRate: g.totalMatches > 0 ? +((g.wins / g.totalMatches) * 100).toFixed(1) : 0,
        avgInterceptions: g.totalMatches > 0 ? +(g.totalInterceptions / g.totalMatches).toFixed(2) : 0,
        avgMiscommunications: g.totalMatches > 0 ? +(g.totalMiscommunications / g.totalMatches).toFixed(2) : 0,
      }));

      res.json({ comparison });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Failed to compute ablation comparison";
      res.status(500).json({ error: msg });
    }
  });

  app.post("/api/cost-estimate", (req, res) => {
    try {
      const { players, totalGames, includeReflection } = req.body;
      if (!players || !totalGames) {
        return res.status(400).json({ error: "Missing players or totalGames" });
      }

      const AVG_ROUNDS_PER_GAME = 6;
      const CALL_TYPE_TOKENS = {
        clue:        { input: 900, output: 150, callsPerRound: 1 },
        guess:       { input: 650, output: 80,  callsPerRound: 1 },
        intercept:   { input: 750, output: 80,  callsPerRound: 0.5 },
        reflection:  { input: 1200, output: 300, callsPerRound: 0 },
      };

      let totalEstimate = 0;
      const breakdown: Array<{
        model: string;
        provider: string;
        costPerGame: number;
        totalCost: number;
        callTypeBreakdown: Record<string, { callsPerGame: number; costPerGame: number }>;
      }> = [];

      const uniqueModels = new Map<string, { provider: string; count: number }>();
      for (const p of players) {
        const config = p.aiConfig || getDefaultConfig(p.aiProvider);
        const model = config.model || getDefaultConfig(p.aiProvider).model;
        const key = `${p.aiProvider}:${model}`;
        const existing = uniqueModels.get(key);
        if (existing) {
          existing.count++;
        } else {
          uniqueModels.set(key, { provider: p.aiProvider, count: 1 });
        }
      }

      for (const [key, info] of uniqueModels) {
        const [provider, model] = key.split(":");
        const costs = getModelCost(provider as AIProvider, model);
        if (!costs) continue;

        let costPerGame = 0;
        const callTypeBreakdown: Record<string, { callsPerGame: number; costPerGame: number }> = {};

        for (const [callType, spec] of Object.entries(CALL_TYPE_TOKENS)) {
          if (callType === "reflection" && !includeReflection) continue;
          const callsPerGame = callType === "reflection"
            ? 1
            : spec.callsPerRound * AVG_ROUNDS_PER_GAME;
          const costPerCall = (spec.input / 1000) * costs.input + (spec.output / 1000) * costs.output;
          const typeCostPerGame = costPerCall * callsPerGame * info.count;
          costPerGame += typeCostPerGame;
          callTypeBreakdown[callType] = {
            callsPerGame: callsPerGame * info.count,
            costPerGame: +typeCostPerGame.toFixed(6),
          };
        }

        const totalCost = costPerGame * totalGames;
        totalEstimate += totalCost;
        breakdown.push({
          model,
          provider: info.provider,
          costPerGame: +costPerGame.toFixed(6),
          totalCost: +totalCost.toFixed(6),
          callTypeBreakdown,
        });
      }

      res.json({
        estimatedTotalCost: +totalEstimate.toFixed(4),
        perGameCost: +(totalEstimate / totalGames).toFixed(6),
        totalGames,
        avgRoundsPerGame: AVG_ROUNDS_PER_GAME,
        breakdown,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to estimate cost" });
    }
  });

  const evolutionConfigSchema = z.object({
    baseProvider: z.enum(["chatgpt", "claude", "gemini", "openrouter"]),
    baseModel: z.string(),
    populationSize: z.number().min(4).max(20).default(8),
    totalGenerations: z.number().min(1).max(50).default(10),
    mutationRate: z.number().min(0).max(1).default(0.3),
    crossoverRate: z.number().min(0).max(1).default(0.7),
    elitismCount: z.number().min(0).max(10).default(2),
    matchesPerEvaluation: z.number().min(1).max(10).default(5),
    budgetCapUsd: z.string().optional(),
  });

  app.post("/api/evolution", async (req, res) => {
    try {
      const config = evolutionConfigSchema.parse(req.body);
      const run = await createEvolutionRun(config);
      runEvolution(run.id).catch(err => console.error(`[evolution] Background run error:`, err));
      res.json(run);
    } catch (error: any) {
      res.status(400).json({ error: error.message || "Failed to create evolution run" });
    }
  });

  app.get("/api/evolution", async (_req, res) => {
    try {
      const runs = await storage.getEvolutionRuns();
      res.json(runs);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to fetch evolution runs" });
    }
  });

  app.get("/api/evolution/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid run ID" });
      const run = await storage.getEvolutionRun(id);
      if (!run) return res.status(404).json({ error: "Evolution run not found" });

      const gens = await storage.getGenerations(id);
      const currentGenGenomes = run.currentGeneration > 0
        ? await storage.getStrategyGenomes(id, run.currentGeneration - 1)
        : await storage.getStrategyGenomes(id, 0);

      res.json({
        ...run,
        generations: gens,
        currentPopulation: currentGenGenomes,
        isRunning: isEvolutionRunning(id),
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to fetch evolution run" });
    }
  });

  app.get("/api/evolution/:id/genomes", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid run ID" });
      const gen = req.query.generation !== undefined ? parseInt(req.query.generation as string) : undefined;
      if (gen !== undefined && isNaN(gen)) return res.status(400).json({ error: "Invalid generation number" });
      const genomes = await storage.getStrategyGenomes(id, gen);
      res.json(genomes);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to fetch genomes" });
    }
  });

  app.get("/api/evolution/:id/genome/:genomeId", async (req, res) => {
    try {
      const genomeId = parseInt(req.params.genomeId);
      if (isNaN(genomeId)) return res.status(400).json({ error: "Invalid genome ID" });
      const genome = await storage.getStrategyGenome(genomeId);
      if (!genome) return res.status(404).json({ error: "Genome not found" });

      const parents = genome.parentIds && (genome.parentIds as number[]).length > 0
        ? await Promise.all((genome.parentIds as number[]).map(pid => storage.getStrategyGenome(pid)))
        : [];

      res.json({ ...genome, parents: parents.filter(Boolean) });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to fetch genome" });
    }
  });

  // Week 3: Reproducible experiment runner (v2 endpoint)
  app.post("/api/experiments/v2", async (req, res) => {
    try {
      const parsed = experimentConfigSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid experiment config", details: parsed.error.issues });
      }

      const config = parsed.data;
      const totalMatches = config.gamesPerCell * config.strategies.length * config.models.length;

      const experiment = await storage.createExperiment({
        name: config.name,
        model: config.models.map(m => m.model).join(", "),
        provider: config.models.map(m => m.provider).join(", "),
        strategyA: config.strategies[0],
        strategyB: config.strategies.length > 1 ? config.strategies[1] : config.strategies[0],
        numGames: totalMatches,
        status: "pending",
        matchIdsA: [],
        matchIdsB: [],
        results: null,
      });

      // Run in background -- do not await
      runExperiment(experiment.id, config).catch(err => {
        console.error(`[experiment] Experiment ${experiment.id} failed:`, err);
      });

      res.json({ id: experiment.id, status: "started", totalMatches });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to create experiment" });
    }
  });

  app.post("/api/evolution/:id/stop", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid run ID" });
      stopEvolutionRun(id);
      await storage.updateEvolutionRun(id, { status: "stopped" });
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to stop evolution run" });
    }
  });

  // Week 3: Publication-ready CSV export routes
  registerExportRoutes(app);

  return httpServer;
}

interface PlayerConfig {
  id: string;
  name: string;
  isAI: boolean;
  aiProvider: string | null;
  team: string;
}

function getModelLabel(player: PlayerConfig): string {
  // Extract model label from player name, e.g. "GPT-5.4 (A1)" -> "GPT-5.4"
  const match = player.name.match(/^(.+?)\s*\([AB]\d\)$/);
  return match ? match[1].trim() : player.aiProvider || "unknown";
}

function computeTournamentStats(matchDetails: any[]) {
  const modelStats: Record<string, { wins: number; losses: number; games: number; interceptions: number; miscommunications: number }> = {};

  for (const match of matchDetails) {
    if (!match.winner) continue;
    const players = match.playerConfigs as PlayerConfig[];

    // Deduplicate by team — all players on the same team are the same model
    const teamModels = new Map<string, string>();
    for (const p of players) {
      if (!p.aiProvider) continue;
      if (!teamModels.has(p.team)) {
        teamModels.set(p.team, getModelLabel(p));
      }
    }

    for (const [team, model] of teamModels) {
      if (!modelStats[model]) {
        modelStats[model] = { wins: 0, losses: 0, games: 0, interceptions: 0, miscommunications: 0 };
      }
      modelStats[model].games++;
      if (team === match.winner) {
        modelStats[model].wins++;
      } else {
        modelStats[model].losses++;
      }
    }

    const amberWhite = match.amberWhiteTokens || 0;
    const blueWhite = match.blueWhiteTokens || 0;
    const amberBlack = match.amberBlackTokens || 0;
    const blueBlack = match.blueBlackTokens || 0;

    for (const [team, model] of teamModels) {
      if (team === "amber") {
        modelStats[model].miscommunications += amberWhite;
        modelStats[model].interceptions += blueBlack;
      } else {
        modelStats[model].miscommunications += blueWhite;
        modelStats[model].interceptions += amberBlack;
      }
    }
  }

  return {
    totalGames: matchDetails.length,
    completedGames: matchDetails.filter(m => m.winner).length,
    modelStats,
  };
}
