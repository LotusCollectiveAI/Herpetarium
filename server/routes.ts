import type { Express } from "express";
import type { Server } from "http";
import { setupWebSocket, createGame } from "./websocket";
import { createGameSchema, HeadlessMatchConfig, TournamentConfig } from "@shared/schema";
import { storage } from "./storage";
import { runHeadlessMatch } from "./headlessRunner";
import { createTournament, runTournament, isTournamentRunning } from "./tournament";
import { z } from "zod";

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
