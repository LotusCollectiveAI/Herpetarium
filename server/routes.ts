import type { Express } from "express";
import type { Server } from "http";
import { setupWebSocket, createGame } from "./websocket";
import { createGameSchema, HeadlessMatchConfig, TournamentConfig } from "@shared/schema";
import { storage } from "./storage";
import { runHeadlessMatch } from "./headlessRunner";
import { createTournament, runTournament, isTournamentRunning } from "./tournament";
import { createSeries, runSeries, isSeriesRunning, getPlayerConfigHash } from "./seriesRunner";
import { z } from "zod";
import { computeModelMetrics, computeMatchupMetrics, computeStrategyMetrics, analyzeClues, computeTeamCompositionMetrics, computeSelfPlayMetrics, analyzeCrossModelClues } from "./metrics";

const headlessMatchConfigSchema = z.object({
  players: z.array(z.object({
    name: z.string(),
    aiProvider: z.enum(["chatgpt", "claude", "gemini"]),
    team: z.enum(["amber", "blue"]),
  })).min(2).max(4),
  fastMode: z.boolean().optional(),
});

const tournamentConfigSchema = z.object({
  name: z.string().min(1).max(200),
  matchConfigs: z.array(headlessMatchConfigSchema).min(1),
  gamesPerMatchup: z.number().int().min(1).max(100).optional(),
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

      const result = await storage.getMatches({ page, limit, model, winner, dateFrom, dateTo });
      res.json({
        matches: result.matches,
        total: result.total,
        page,
        limit,
        totalPages: Math.ceil(result.total / limit),
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
      if (amberCount < 1 || blueCount < 1) {
        return res.status(400).json({ error: "Each team must have at least 1 player" });
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
      if (amberCount < 1 || blueCount < 1) {
        return res.status(400).json({ error: "Each team must have at least 1 player" });
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

      const config = parsed.data as TournamentConfig;

      for (const mc of config.matchConfigs) {
        const amberCount = mc.players.filter(p => p.team === "amber").length;
        const blueCount = mc.players.filter(p => p.team === "blue").length;
        if (amberCount < 1 || blueCount < 1) {
          return res.status(400).json({ error: "Each team in every matchup must have at least 1 player" });
        }
      }

      const tournament = await createTournament(config);

      runTournament(tournament.id).catch(err => {
        console.error("Tournament execution failed:", err);
      });

      res.json({ id: tournament.id, status: "started" });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to create tournament" });
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

      res.json({ tournament, matches: tournamentMatchesData, matchDetails, stats });
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

      const allMatches = await storage.getAllMatches({ model, strategy, dateFrom, dateTo });
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

      res.json({
        modelMetrics,
        matchupMetrics,
        strategyMetrics,
        teamCompositionMetrics,
        selfPlayMetrics,
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
      const allMatches = await storage.getAllMatches();
      const matchIds = allMatches.map(m => m.id);
      const allRounds = await storage.getMatchRoundsForMatches(matchIds);

      if (format === "csv") {
        const csvRows = ["id,gameId,createdAt,completedAt,winner,totalRounds,amberWhiteTokens,amberBlackTokens,blueWhiteTokens,blueBlackTokens"];
        allMatches.forEach(m => {
          csvRows.push([
            m.id, m.gameId,
            m.createdAt ? new Date(m.createdAt).toISOString() : "",
            m.completedAt ? new Date(m.completedAt).toISOString() : "",
            m.winner || "",
            m.totalRounds,
            m.amberWhiteTokens, m.amberBlackTokens,
            m.blueWhiteTokens, m.blueBlackTokens,
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

  app.get("/api/export/ai-logs", async (req, res) => {
    try {
      const format = (req.query.format as string) || "json";
      const allLogs = await storage.getAllAiCallLogs();

      if (format === "csv") {
        const csvRows = ["id,matchId,gameId,roundNumber,provider,model,actionType,latencyMs,timedOut,error,createdAt"];
        allLogs.forEach(l => {
          csvRows.push([
            l.id, l.matchId || "", l.gameId || "",
            l.roundNumber || "",
            l.provider, l.model, l.actionType,
            l.latencyMs || "",
            l.timedOut,
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
      if (amberCount < 1 || blueCount < 1) {
        return res.status(400).json({ error: "Each team must have at least 1 player" });
      }

      const s = await createSeries({
        matchConfig,
        totalGames: config.totalGames,
        noteTokenBudget: config.noteTokenBudget,
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
      const matchDetails = await storage.getMatchesByIds(matchIds);

      res.json({
        series: s,
        notes,
        notesByPlayer,
        playerHashes,
        matchDetails,
        running,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to fetch series" });
    }
  });

  return httpServer;
}

interface PlayerConfig {
  id: string;
  name: string;
  isAI: boolean;
  aiProvider: string | null;
  team: string;
}

function computeTournamentStats(matchDetails: any[]) {
  const modelStats: Record<string, { wins: number; losses: number; games: number; interceptions: number; miscommunications: number }> = {};

  for (const match of matchDetails) {
    if (!match.winner) continue;
    const players = match.playerConfigs as PlayerConfig[];

    for (const p of players) {
      if (!p.aiProvider) continue;
      if (!modelStats[p.aiProvider]) {
        modelStats[p.aiProvider] = { wins: 0, losses: 0, games: 0, interceptions: 0, miscommunications: 0 };
      }
      modelStats[p.aiProvider].games++;
      if (p.team === match.winner) {
        modelStats[p.aiProvider].wins++;
      } else {
        modelStats[p.aiProvider].losses++;
      }
    }

    const amberWhite = match.amberWhiteTokens || 0;
    const blueWhite = match.blueWhiteTokens || 0;
    const amberBlack = match.amberBlackTokens || 0;
    const blueBlack = match.blueBlackTokens || 0;

    for (const p of players) {
      if (!p.aiProvider) continue;
      if (p.team === "amber") {
        modelStats[p.aiProvider].miscommunications += amberWhite;
        modelStats[p.aiProvider].interceptions += blueBlack;
      } else {
        modelStats[p.aiProvider].miscommunications += blueWhite;
        modelStats[p.aiProvider].interceptions += amberBlack;
      }
    }
  }

  return {
    totalGames: matchDetails.length,
    completedGames: matchDetails.filter(m => m.winner).length,
    modelStats,
  };
}
