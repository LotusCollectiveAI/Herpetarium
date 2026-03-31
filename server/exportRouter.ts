/**
 * Publication-ready CSV export endpoints for Herpetarium (Week 3).
 *
 * Three CSV export endpoints:
 *   GET /api/export/v2/matches    -- one row per match
 *   GET /api/export/v2/rounds     -- one row per round
 *   GET /api/export/v2/ai-logs    -- one row per AI call (optional include_text=true)
 *
 * Plus a JSON endpoint for experiment reproducibility:
 *   GET /api/export/experiment-config/:id
 */

import type { Express, Request, Response } from "express";
import { storage } from "./storage";

/**
 * Escape a value for CSV output. Handles:
 * - null/undefined -> empty string
 * - commas, double quotes, newlines (standard CSV escaping)
 * - control characters: carriage returns (\r) and tabs (\t)
 */
function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  // Check if the value needs quoting: contains comma, quote, newline, CR, or tab
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r") || str.includes("\t")) {
    // Replace control characters with visible representations inside quoted fields
    const cleaned = str
      .replace(/\r\n/g, "\\n")    // CRLF -> \n
      .replace(/\r/g, "\\r")       // lone CR -> \r
      .replace(/\t/g, "\\t");      // tab -> \t
    return `"${cleaned.replace(/"/g, '""')}"`;
  }
  return str;
}

function csvRow(values: unknown[]): string {
  return values.map(escapeCsv).join(",") + "\n";
}

export function registerExportRoutes(app: Express): void {

  // --- Matches CSV export ---
  app.get("/api/export/v2/matches", async (req: Request, res: Response) => {
    try {
      const experimentId = req.query.experimentId as string | undefined;
      const matches = await storage.getAllMatches(experimentId ? { experimentId } : {});

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition",
        `attachment; filename="matches${experimentId ? `-${experimentId}` : ""}-${new Date().toISOString().slice(0, 10)}.csv"`
      );

      // Header row
      res.write(csvRow([
        "match_id", "experiment_id", "game_id", "game_seed",
        "created_at", "completed_at", "winner", "total_rounds",
        "amber_keywords", "blue_keywords",
        "amber_white_tokens", "amber_black_tokens",
        "blue_white_tokens", "blue_black_tokens",
        "amber_model", "amber_provider", "amber_strategy", "amber_temperature",
        "blue_model", "blue_provider", "blue_strategy", "blue_temperature",
        "ablation_flags",
      ]));

      for (const match of matches) {
        const configs = (match.playerConfigs as any[]) || [];
        const amberAI = configs.find((c: any) => c.team === "amber" && (c.isAI || c.aiProvider));
        const blueAI = configs.find((c: any) => c.team === "blue" && (c.isAI || c.aiProvider));
        const ablations = match.ablations as { flags?: string[] } | null;

        res.write(csvRow([
          match.id,
          match.experimentId || "",
          match.gameId,
          match.gameSeed || "",
          match.createdAt ? new Date(match.createdAt).toISOString() : "",
          match.completedAt ? new Date(match.completedAt).toISOString() : "",
          match.winner || "",
          match.totalRounds,
          JSON.stringify(match.amberKeywords),
          JSON.stringify(match.blueKeywords),
          match.amberWhiteTokens,
          match.amberBlackTokens,
          match.blueWhiteTokens,
          match.blueBlackTokens,
          amberAI?.aiConfig?.model || amberAI?.aiProvider || "",
          amberAI?.aiConfig?.provider || amberAI?.aiProvider || "",
          amberAI?.aiConfig?.promptStrategy || "default",
          amberAI?.aiConfig?.temperature ?? "",
          blueAI?.aiConfig?.model || blueAI?.aiProvider || "",
          blueAI?.aiConfig?.provider || blueAI?.aiProvider || "",
          blueAI?.aiConfig?.promptStrategy || "default",
          blueAI?.aiConfig?.temperature ?? "",
          ablations?.flags?.join(";") || "",
        ]));
      }

      res.end();
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Export failed" });
    }
  });

  // --- Rounds CSV export ---
  app.get("/api/export/v2/rounds", async (req: Request, res: Response) => {
    try {
      const experimentId = req.query.experimentId as string | undefined;
      const matches = await storage.getAllMatches(experimentId ? { experimentId } : {});
      const matchIds = matches.map(m => m.id);
      const rounds = await storage.getMatchRoundsForMatches(matchIds);

      // Fetch all team chatter for these matches (for 3v3 deliberation columns)
      const allChatter = matchIds.length > 0
        ? await Promise.all(matchIds.map(id => storage.getTeamChatter(id))).then(arrays => arrays.flat())
        : [];

      // Index chatter by matchId-roundNumber-team-phase
      const chatterIndex = new Map<string, any>();
      for (const c of allChatter) {
        const key = `${c.matchId}-${c.roundNumber}-${c.team}-${c.phase}`;
        chatterIndex.set(key, c);
      }

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition",
        `attachment; filename="rounds${experimentId ? `-${experimentId}` : ""}-${new Date().toISOString().slice(0, 10)}.csv"`
      );

      res.write(csvRow([
        "match_id", "round_number", "team", "clue_giver_id",
        "code_1", "code_2", "code_3",
        "clue_1", "clue_2", "clue_3",
        "own_guess_1", "own_guess_2", "own_guess_3",
        "opponent_guess_1", "opponent_guess_2", "opponent_guess_3",
        "own_correct", "intercepted",
        "own_deliberation_transcript", "own_deliberation_exchanges", "own_deliberation_consensus",
        "intercept_deliberation_transcript", "intercept_deliberation_exchanges", "intercept_deliberation_consensus",
      ]));

      for (const r of rounds) {
        const code = r.code as number[];
        const clues = r.clues as string[];
        const ownGuess = r.ownGuess as number[] | null;
        const oppGuess = r.opponentGuess as number[] | null;

        const ownDelib = chatterIndex.get(`${r.matchId}-${r.roundNumber}-${r.team}-own_guess_deliberation`);
        const interceptDelib = chatterIndex.get(`${r.matchId}-${r.roundNumber}-${r.team}-opponent_intercept_deliberation`);

        res.write(csvRow([
          r.matchId, r.roundNumber, r.team, r.clueGiverId,
          code?.[0] ?? "", code?.[1] ?? "", code?.[2] ?? "",
          clues?.[0] || "", clues?.[1] || "", clues?.[2] || "",
          ownGuess?.[0] ?? "", ownGuess?.[1] ?? "", ownGuess?.[2] ?? "",
          oppGuess?.[0] ?? "", oppGuess?.[1] ?? "", oppGuess?.[2] ?? "",
          r.ownCorrect, r.intercepted,
          ownDelib ? JSON.stringify(ownDelib.messages) : "",
          ownDelib?.totalExchanges ?? "",
          ownDelib?.consensusReached ?? "",
          interceptDelib ? JSON.stringify(interceptDelib.messages) : "",
          interceptDelib?.totalExchanges ?? "",
          interceptDelib?.consensusReached ?? "",
        ]));
      }

      res.end();
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Export failed" });
    }
  });

  // --- AI Call Logs CSV export ---
  app.get("/api/export/v2/ai-logs", async (req: Request, res: Response) => {
    try {
      const experimentId = req.query.experimentId as string | undefined;
      const includeText = req.query.include_text === "true";
      const matches = await storage.getAllMatches(experimentId ? { experimentId } : {});
      const matchIds = matches.map(m => m.id);
      const logs = await storage.getAllAiCallLogs(matchIds.length > 0 ? matchIds : undefined);

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition",
        `attachment; filename="ai-logs${experimentId ? `-${experimentId}` : ""}-${new Date().toISOString().slice(0, 10)}.csv"`
      );

      const headers = [
        "match_id", "round_number", "provider", "model", "action_type",
        "latency_ms", "timed_out", "parse_quality",
        "prompt_tokens", "completion_tokens", "total_tokens", "estimated_cost_usd",
        "has_reasoning_trace", "reasoning_trace_length",
        "created_at",
      ];
      if (includeText) {
        headers.push("prompt", "raw_response", "reasoning_trace");
      }
      res.write(csvRow(headers));

      for (const l of logs) {
        const row: unknown[] = [
          l.matchId ?? "", l.roundNumber ?? "", l.provider, l.model, l.actionType,
          l.latencyMs ?? "", l.timedOut, l.parseQuality || "",
          l.promptTokens ?? "", l.completionTokens ?? "", l.totalTokens ?? "", l.estimatedCostUsd || "",
          l.reasoningTrace ? true : false,
          l.reasoningTrace ? l.reasoningTrace.length : 0,
          l.createdAt ? new Date(l.createdAt).toISOString() : "",
        ];
        if (includeText) {
          row.push(l.prompt || "", l.rawResponse || "", l.reasoningTrace || "");
        }
        res.write(csvRow(row));
      }

      res.end();
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Export failed" });
    }
  });

  // --- Experiment config JSON endpoint for reproducibility ---
  app.get("/api/export/experiment-config/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id as string);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid experiment ID" });
      }

      const experiment = await storage.getExperiment(id);
      if (!experiment) {
        return res.status(404).json({ error: "Experiment not found" });
      }

      // The results field contains the full config used for the experiment
      const results = experiment.results as any;
      const experimentConfig = results?.config || {
        name: experiment.name,
        model: experiment.model,
        provider: experiment.provider,
        strategyA: experiment.strategyA,
        strategyB: experiment.strategyB,
        numGames: experiment.numGames,
      };

      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition",
        `attachment; filename="experiment-config-${id}.json"`
      );

      res.json({
        experimentId: id,
        name: experiment.name,
        status: experiment.status,
        createdAt: experiment.createdAt,
        completedAt: experiment.completedAt,
        config: experimentConfig,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to fetch experiment config" });
    }
  });
}
