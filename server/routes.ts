import type { Express } from "express";
import type { Server } from "http";
import { setupWebSocket, createGame } from "./websocket";
import { createGameSchema } from "@shared/schema";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Setup WebSocket server
  setupWebSocket(httpServer);
  
  // API Routes
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

  return httpServer;
}
