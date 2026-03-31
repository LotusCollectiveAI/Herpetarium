import { SeriesConfig, HeadlessMatchConfig, AIPlayerConfig, getDefaultConfig } from "@shared/schema";
import type { AIProvider } from "@shared/schema";

import { runHeadlessMatch } from "./headlessRunner";
import { generateReflection, ReflectionParams, AICallResult } from "./ai";
import { storage } from "./storage";
import { log } from "./index";
import { createHash } from "crypto";

const activeSeries = new Map<number, boolean>();

export function isSeriesRunning(id: number): boolean {
  return activeSeries.get(id) === true;
}

export function getPlayerConfigHash(provider: string, team: string, name: string): string {
  return createHash("md5").update(`${provider}-${team}-${name}`).digest("hex").slice(0, 16);
}

interface PlayerHashEntry {
  hash: string;
  provider: string;
  team: "amber" | "blue";
  name: string;
  aiConfig?: AIPlayerConfig;
}

function dedupePlayerHashes(players: Array<{ name: string; aiProvider: string; team: string; aiConfig?: AIPlayerConfig }>): PlayerHashEntry[] {
  const seen = new Set<string>();
  const result: PlayerHashEntry[] = [];
  for (const p of players) {
    const hash = getPlayerConfigHash(p.aiProvider, p.team, p.name);
    if (!seen.has(hash)) {
      seen.add(hash);
      result.push({
        hash,
        provider: p.aiProvider,
        team: p.team as "amber" | "blue",
        name: p.name,
        aiConfig: p.aiConfig,
      });
    }
  }
  return result;
}

async function logReflectionCall(matchId: number, gameId: string, provider: string, callResult: AICallResult<string>) {
  try {
    await storage.createAiCallLog({
      matchId,
      gameId,
      roundNumber: 0,
      provider,
      model: callResult.model,
      actionType: "reflection",
      prompt: callResult.prompt,
      rawResponse: callResult.rawResponse || null,
      parsedResult: { notes: callResult.result.slice(0, 500) },
      latencyMs: callResult.latencyMs,
      timedOut: false,
      error: callResult.error || null,
      parseQuality: callResult.parseQuality || null,
      promptTokens: callResult.promptTokens || null,
      completionTokens: callResult.completionTokens || null,
      totalTokens: callResult.totalTokens || null,
      estimatedCostUsd: callResult.estimatedCostUsd || null,
      reasoningTrace: callResult.reasoningTrace || null,
    });
  } catch (err) {
    log(`[series] Failed to log reflection AI call: ${err}`, "series");
  }
}

export async function createSeries(config: SeriesConfig) {
  const tokenBudget = config.noteTokenBudget || 500;

  const s = await storage.createSeries({
    name: `Series: ${config.matchConfig.players.map(p => p.name).join(" vs ")}`,
    config: config as any,
    totalGames: config.totalGames,
    completedGames: 0,
    status: "pending",
    noteTokenBudget: tokenBudget,
    budgetCapUsd: config.budgetCapUsd || null,
    estimatedCostUsd: config.estimatedCostUsd || null,
  });

  return s;
}

export async function runSeries(seriesId: number) {
  if (activeSeries.get(seriesId)) {
    log(`[series] Series ${seriesId} is already running`, "series");
    return;
  }

  activeSeries.set(seriesId, true);

  try {
    const s = await storage.getSeries(seriesId);
    if (!s) {
      throw new Error(`Series ${seriesId} not found`);
    }

    const config = s.config as SeriesConfig;
    const tokenBudget = s.noteTokenBudget || 500;
    const budgetCap = s.budgetCapUsd ? parseFloat(s.budgetCapUsd) : null;

    await storage.updateSeries(seriesId, {
      status: "running",
      startedAt: new Date(),
    });

    log(`[series] Starting series ${seriesId} with ${config.totalGames} games${budgetCap ? ` (budget cap: $${budgetCap})` : ""}`, "series");

    const playerHashes = dedupePlayerHashes(config.matchConfig.players);

    const existingNotes = await storage.getScratchNotes(seriesId);
    const completedMatchIds: number[] = existingNotes
      .filter(n => n.matchId != null)
      .map(n => n.matchId as number)
      .filter((id, idx, arr) => arr.indexOf(id) === idx);

    let completed = s.completedGames || 0;
    let failedCount = 0;

    for (let gameIndex = completed; gameIndex < config.totalGames; gameIndex++) {
      if (!activeSeries.get(seriesId)) {
        log(`[series] Series ${seriesId} was stopped`, "series");
        break;
      }

      if (budgetCap && completedMatchIds.length > 0) {
        const currentCost = await storage.getCumulativeCost(completedMatchIds);
        await storage.updateSeries(seriesId, { actualCostUsd: currentCost.toFixed(6) });
        if (currentCost >= budgetCap) {
          log(`[series] Series ${seriesId} - Budget cap exceeded ($${currentCost.toFixed(4)} >= $${budgetCap})`, "series");
          break;
        }
      }

      log(`[series] Series ${seriesId} - Game ${gameIndex + 1}/${config.totalGames}`, "series");

      try {
        const scratchNotesMap: Record<string, string> = {};
        for (const ph of playerHashes) {
          const latestNote = await storage.getLatestScratchNote(seriesId, ph.hash);
          if (latestNote) {
            scratchNotesMap[`${ph.provider}-${ph.team}`] = latestNote.notesText;
          }
        }

        const result = await runHeadlessMatch(config.matchConfig, scratchNotesMap);
        completedMatchIds.push(result.matchId);

        for (const ph of playerHashes) {
          const latestNote = await storage.getLatestScratchNote(seriesId, ph.hash);
          const currentNotes = latestNote?.notesText || "";

          const opponentTeam = ph.team === "amber" ? "blue" : "amber";
          const aiConfig = ph.aiConfig || getDefaultConfig(ph.provider as AIProvider);

          const reflectionParams: ReflectionParams = {
            teamKeywords: result.teams[ph.team].keywords,
            teamHistory: result.teams[ph.team].history.map(h => ({
              clues: h.clues,
              targetCode: h.targetCode,
            })),
            opponentHistory: result.teams[opponentTeam].history.map(h => ({
              clues: h.clues,
              targetCode: h.targetCode,
            })),
            winner: result.winner,
            myTeam: ph.team,
            whiteTokens: result.teams[ph.team].whiteTokens,
            blackTokens: result.teams[ph.team].blackTokens,
            opponentWhiteTokens: result.teams[opponentTeam].whiteTokens,
            opponentBlackTokens: result.teams[opponentTeam].blackTokens,
            currentNotes,
            tokenBudget,
          };

          const reflectionResult = await generateReflection(aiConfig, reflectionParams);

          await logReflectionCall(result.matchId, result.gameId, ph.provider, reflectionResult);

          const approxTokens = Math.ceil(reflectionResult.result.length / 4);
          await storage.createScratchNote({
            seriesId,
            playerConfigHash: ph.hash,
            gameIndex,
            notesText: reflectionResult.result,
            tokenCount: approxTokens,
            matchId: result.matchId,
          });

          log(`[series] Series ${seriesId} - ${ph.name} notes updated (${approxTokens} tokens)`, "series");
        }

        completed++;
        await storage.updateSeries(seriesId, { completedGames: completed });

        log(`[series] Series ${seriesId} - Game ${completed}/${config.totalGames} complete (winner: ${result.winner})`, "series");
      } catch (err) {
        log(`[series] Game ${gameIndex + 1} failed in series ${seriesId}: ${err}`, "series");
        failedCount++;
        completed++;
        await storage.updateSeries(seriesId, { completedGames: completed });
      }
    }

    if (completedMatchIds.length > 0) {
      const finalCost = await storage.getCumulativeCost(completedMatchIds);
      await storage.updateSeries(seriesId, { actualCostUsd: finalCost.toFixed(6) });
    }

    const budgetExceeded = budgetCap && completedMatchIds.length > 0 &&
      (await storage.getCumulativeCost(completedMatchIds)) >= budgetCap;
    const finalStatus = budgetExceeded ? "budget_exceeded" : failedCount > 0 ? (failedCount === config.totalGames ? "failed" : "completed_with_errors") : "completed";
    await storage.updateSeries(seriesId, {
      status: finalStatus,
      completedAt: new Date(),
    });

    log(`[series] Series ${seriesId} ${finalStatus} (${failedCount} failures)`, "series");
  } catch (err) {
    log(`[series] Series ${seriesId} error: ${err}`, "series");
    await storage.updateSeries(seriesId, { status: "failed" });
  } finally {
    activeSeries.delete(seriesId);
  }
}
