import type { Express } from "express";
import type { Server } from "http";
import { setupWebSocket, createGame } from "./websocket";
import { createGameSchema } from "@shared/schema";
import { storage } from "./storage";

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

  return httpServer;
}
