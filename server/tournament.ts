import { TournamentConfig, HeadlessMatchConfig, AIProvider, AIPlayerConfig, TournamentMatch, normalizeHeadlessMatchConfig } from "@shared/schema";
import { getDefaultConfigForProvider, getModelKey } from "@shared/modelRegistry";
import { runHeadlessMatch } from "./headlessRunner";
import { storage } from "./storage";
import { log } from "./index";
import { ModelHealthTracker } from "./modelHealth";

// ── Round-robin config generator ──────────────────────────────────────

export interface RoundRobinModelSpec {
  name: string;
  provider: AIProvider;
  model: string;
  config?: Partial<AIPlayerConfig>;
}

function buildRoundRobinMatchConfig(
  amber: RoundRobinModelSpec,
  blue: RoundRobinModelSpec,
  teamSize: 2 | 3,
): HeadlessMatchConfig {
  const amberConfig: AIPlayerConfig = {
    provider: amber.provider,
    model: amber.model,
    timeoutMs: 14400000,
    temperature: 0.7,
    promptStrategy: "advanced",
    reasoningEffort: "high",
    ...amber.config,
  };

  const blueConfig: AIPlayerConfig = {
    provider: blue.provider,
    model: blue.model,
    timeoutMs: 14400000,
    temperature: 0.7,
    promptStrategy: "advanced",
    reasoningEffort: "high",
    ...blue.config,
  };

  const players: HeadlessMatchConfig["players"] = [];
  for (let k = 1; k <= teamSize; k++) {
    players.push({
      name: `${amber.name} (A${k})`,
      aiProvider: amber.provider,
      team: "amber",
      aiConfig: { ...amberConfig },
    });
  }
  for (let k = 1; k <= teamSize; k++) {
    players.push({
      name: `${blue.name} (B${k})`,
      aiProvider: blue.provider,
      team: "blue",
      aiConfig: { ...blueConfig },
    });
  }

  return normalizeHeadlessMatchConfig({ players, teamSize });
}

/**
 * Generate balanced HeadlessMatchConfig[] for all C(n,2) pairings in a round-robin.
 * Games are expanded here so each matchup gets mirrored sides.
 */
export function generateRoundRobinConfigs(
  models: RoundRobinModelSpec[],
  teamSize: 2 | 3 = 3,
  gamesPerMatchup = 2,
): HeadlessMatchConfig[] {
  if (gamesPerMatchup % 2 !== 0) {
    throw new Error("gamesPerMatchup must be even for balanced round-robin fixtures");
  }

  const configs: HeadlessMatchConfig[] = [];

  for (let i = 0; i < models.length; i++) {
    for (let j = i + 1; j < models.length; j++) {
      const modelA = models[i];
      const modelB = models[j];
      const half = gamesPerMatchup / 2;

      for (let gameIndex = 0; gameIndex < gamesPerMatchup; gameIndex++) {
        const amber = gameIndex < half ? modelA : modelB;
        const blue = gameIndex < half ? modelB : modelA;
        configs.push(buildRoundRobinMatchConfig(amber, blue, teamSize));
      }
    }
  }

  return configs;
}

// ── Provider-interleaving sort ────────────────────────────────────────

/**
 * Sort match configs so consecutive matches use different providers where possible.
 * Groups by "amberProvider+blueProvider" pair, then round-robin interleaves the groups.
 */
export function interleaveByProvider(configs: HeadlessMatchConfig[]): HeadlessMatchConfig[] {
  // Build a key for each config based on the providers used
  const groups = new Map<string, HeadlessMatchConfig[]>();
  for (const cfg of configs) {
    const amberProvider = cfg.players.find(p => p.team === "amber")?.aiProvider || "unknown";
    const blueProvider = cfg.players.find(p => p.team === "blue")?.aiProvider || "unknown";
    const key = [amberProvider, blueProvider].sort().join("+");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(cfg);
  }

  // Round-robin across groups
  const groupArrays = Array.from(groups.values());
  const result: HeadlessMatchConfig[] = [];
  let remaining = configs.length;
  let idx = 0;
  while (remaining > 0) {
    for (const group of groupArrays) {
      if (idx < group.length) {
        result.push(group[idx]);
        remaining--;
      }
    }
    idx++;
  }

  return result;
}

const activeTournaments = new Map<number, boolean>();
const activeTournamentHealthTrackers = new Map<number, ModelHealthTracker>();

export function getMatchConfigModelKeys(config: HeadlessMatchConfig): string[] {
  const keys = new Set<string>();

  for (const player of config.players) {
    const provider = player.aiConfig?.provider ?? player.aiProvider;
    const defaults = getDefaultConfigForProvider(provider);
    const model = player.aiConfig?.model ?? defaults.model;
    keys.add(getModelKey(provider, model));
  }

  return Array.from(keys);
}

export function getTournamentModelKeys(tournamentMatches: TournamentMatch[]): string[] {
  const keys = new Set<string>();

  for (const tournamentMatch of tournamentMatches) {
    const config = tournamentMatch.config as HeadlessMatchConfig;
    for (const key of getMatchConfigModelKeys(config)) {
      keys.add(key);
    }
  }

  return Array.from(keys);
}

export function getActiveTournamentHealthTracker(tournamentId: number): ModelHealthTracker | undefined {
  return activeTournamentHealthTrackers.get(tournamentId);
}

/**
 * Resume any tournaments that were running when the server last shut down.
 * Called once at server startup. Finds tournaments with status "running",
 * and for each, re-runs from incomplete matches.
 */
export async function resumeIncompleteRuns(): Promise<void> {
  try {
    const allTournaments = await storage.getTournaments();
    const stuckTournaments = allTournaments.filter(t => t.status === "running");

    if (stuckTournaments.length === 0) {
      log("[tournament] No incomplete tournaments to resume", "tournament");
      return;
    }

    log(`[tournament] Found ${stuckTournaments.length} incomplete tournament(s) to resume`, "tournament");

    for (const tournament of stuckTournaments) {
      // Reset any "running" tournament matches back to "pending" so they get re-run
      const tournamentMatchesData = await storage.getTournamentMatches(tournament.id);
      const runningMatches = tournamentMatchesData.filter(m => m.status === "running");
      for (const tm of runningMatches) {
        await storage.updateTournamentMatch(tm.id, { status: "pending" });
      }

      log(`[tournament] Resuming tournament ${tournament.id} (${tournament.name}) — ${runningMatches.length} matches reset to pending`, "tournament");

      // Fire and forget — runTournament handles pending matches
      runTournament(tournament.id).catch(err => {
        log(`[tournament] Failed to resume tournament ${tournament.id}: ${err}`, "tournament");
      });
    }
  } catch (err) {
    log(`[tournament] Error during resume check: ${err}`, "tournament");
  }
}

export function isTournamentRunning(id: number): boolean {
  return activeTournaments.get(id) === true;
}

export async function createTournament(config: TournamentConfig, estimatedCostUsd?: string | null) {
  const gamesPerMatchup = config.gamesPerMatchup || 1;
  const allMatchConfigs: HeadlessMatchConfig[] = [];

  for (const mc of config.matchConfigs) {
    for (let i = 0; i < gamesPerMatchup; i++) {
      const matchWithAblations = config.ablations
        ? { ...mc, ablations: mc.ablations || config.ablations }
        : mc;
      const normalizedMatchConfig = normalizeHeadlessMatchConfig(matchWithAblations);
      allMatchConfigs.push(normalizedMatchConfig);
    }
  }

  const tournament = await storage.createTournament({
    name: config.name,
    status: "pending",
    config: config as any,
    totalMatches: allMatchConfigs.length,
    completedMatches: 0,
    budgetCapUsd: config.budgetCapUsd || null,
    estimatedCostUsd: estimatedCostUsd || null,
  });

  for (let i = 0; i < allMatchConfigs.length; i++) {
    await storage.createTournamentMatch({
      tournamentId: tournament.id,
      matchIndex: i,
      status: "pending",
      config: allMatchConfigs[i] as any,
    });
  }

  return tournament;
}

export async function runTournament(tournamentId: number, healthTracker: ModelHealthTracker = new ModelHealthTracker()) {
  if (activeTournaments.get(tournamentId)) {
    log(`[tournament] Tournament ${tournamentId} is already running`, "tournament");
    return;
  }

  activeTournaments.set(tournamentId, true);
  activeTournamentHealthTrackers.set(tournamentId, healthTracker);

  try {
    const tournament = await storage.getTournament(tournamentId);
    if (!tournament) {
      throw new Error(`Tournament ${tournamentId} not found`);
    }
    const budgetCap = tournament?.budgetCapUsd ? parseFloat(tournament.budgetCapUsd) : null;

    await storage.updateTournament(tournamentId, {
      status: "running",
      startedAt: new Date(),
    });

    const tournamentMatches = await storage.getTournamentMatches(tournamentId);
    const pendingMatches = tournamentMatches.filter(m => m.status === "pending");
    const totalMatchCount = tournamentMatches.length;

    log(`[tournament] Starting tournament ${tournamentId} with ${pendingMatches.length} matches${budgetCap ? ` (budget cap: $${budgetCap})` : ""}`, "tournament");

    const tournamentConfig = tournament.config as TournamentConfig | undefined;
    const concurrency = Math.max(1, Math.min(20, tournamentConfig?.concurrency || 1));
    const delayBetweenMatches = tournamentConfig?.delayBetweenMatchesMs || 0;

    const TERMINAL_STATUSES = new Set(["completed", "failed", "skipped"]);

    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    async function getTournamentSnapshot() {
      const currentMatches = await storage.getTournamentMatches(tournamentId);
      const completedMatchIds = currentMatches
        .filter(m => m.status === "completed" && m.matchId)
        .map(m => m.matchId as number);
      const terminalCount = currentMatches.filter(m => TERMINAL_STATUSES.has(m.status)).length;
      const failedCount = currentMatches.filter(m => m.status === "failed").length;
      const skippedCount = currentMatches.filter(m => m.status === "skipped").length;
      return { currentMatches, completedMatchIds, terminalCount, failedCount, skippedCount };
    }

    async function syncTournamentProgress() {
      const snapshot = await getTournamentSnapshot();
      await storage.updateTournament(tournamentId, {
        completedMatches: snapshot.terminalCount,
      });
      return snapshot;
    }

    async function syncActualCost() {
      const snapshot = await getTournamentSnapshot();
      const currentCost = snapshot.completedMatchIds.length > 0
        ? await storage.getCumulativeCost(snapshot.completedMatchIds)
        : 0;
      await storage.updateTournament(tournamentId, { actualCostUsd: currentCost.toFixed(6) });
      return { ...snapshot, currentCost };
    }

    function getMatchProviders(tm: TournamentMatch): Set<string> {
      const cfg = tm.config as HeadlessMatchConfig;
      const providers = new Set<string>();
      for (const p of cfg.players) {
        providers.add(p.aiProvider);
      }
      return providers;
    }

    function getMatchHealthState(tm: TournamentMatch) {
      const statuses = getMatchConfigModelKeys(tm.config as HeadlessMatchConfig).map((key) => healthTracker.getStatus(key));
      const pausedUntil = statuses
        .filter((status) => status.state === "paused" && status.pausedUntil !== null)
        .reduce<number | null>((earliest, status) => {
          if (status.pausedUntil === null) return earliest;
          if (earliest === null) return status.pausedUntil;
          return Math.min(earliest, status.pausedUntil);
        }, null);

      return {
        statuses,
        hasDisabled: statuses.some((status) => status.state === "disabled"),
        pausedUntil,
        available: statuses.every((status) => status.state === "healthy"),
      };
    }

    async function runSingleMatch(tm: TournamentMatch): Promise<void> {
      await storage.updateTournamentMatch(tm.id, { status: "running" });

      try {
        const matchConfig = tm.config as HeadlessMatchConfig;
        const result = await runHeadlessMatch(matchConfig, undefined, undefined, healthTracker);

        await storage.updateTournamentMatch(tm.id, {
          status: "completed",
          matchId: result.matchId,
          result: {
            winner: result.winner,
            totalRounds: result.totalRounds,
            matchId: result.matchId,
          } as any,
          completedAt: new Date(),
        });

        const snapshot = await syncTournamentProgress();
        log(`[tournament] Tournament ${tournamentId} - Match ${snapshot.terminalCount}/${totalMatchCount} complete`, "tournament");
      } catch (err) {
        log(`[tournament] Match failed in tournament ${tournamentId}: ${err}`, "tournament");
        await storage.updateTournamentMatch(tm.id, {
          status: "failed",
          result: { error: String(err) } as any,
          completedAt: new Date(),
        });
        await syncTournamentProgress();
      }
    }

    async function markMatchSkipped(tm: TournamentMatch, reason: string, details: Record<string, unknown>) {
      await storage.updateTournamentMatch(tm.id, {
        status: "skipped",
        result: {
          reason,
          ...details,
        } as any,
        completedAt: new Date(),
      });
      await syncTournamentProgress();
      log(`[tournament] Tournament ${tournamentId} - Skipped match index ${tm.matchIndex}: ${reason}`, "tournament");
    }

    async function runQueue(initialQueue: TournamentMatch[], maxConcurrency: number) {
      const queue = [...initialQueue];
      const running = new Map<number, { promise: Promise<void>; providers: Set<string> }>();
      let stopped = false;

      function pickNextCandidate(candidates: TournamentMatch[]): TournamentMatch {
        if (candidates.length <= 1) return candidates[0];

        const inUse = new Set<string>();
        for (const entry of running.values()) {
          for (const provider of entry.providers) {
            inUse.add(provider);
          }
        }
        if (inUse.size === 0) return candidates[0];

        let bestMatch = candidates[0];
        let bestScore = -1;
        for (const candidate of candidates) {
          let score = 0;
          for (const provider of getMatchProviders(candidate)) {
            if (!inUse.has(provider)) score += 1;
          }
          if (score > bestScore) {
            bestScore = score;
            bestMatch = candidate;
          }
        }

        return bestMatch;
      }

      async function launchNext(): Promise<{ kind: "launched" | "empty" | "wait"; waitMs?: number }> {
        if (queue.length === 0 || stopped) {
          return { kind: "empty" };
        }

        if (!activeTournaments.get(tournamentId)) {
          log(`[tournament] Tournament ${tournamentId} was stopped`, "tournament");
          stopped = true;
          return { kind: "empty" };
        }

        if (budgetCap) {
          const { currentCost } = await syncActualCost();
          if (currentCost >= budgetCap) {
            log(`[tournament] Tournament ${tournamentId} - Budget cap exceeded ($${currentCost.toFixed(4)} >= $${budgetCap})`, "tournament");
            stopped = true;
            return { kind: "empty" };
          }
        }

        let earliestPausedUntil: number | null = null;
        const launchable: TournamentMatch[] = [];

        for (let idx = queue.length - 1; idx >= 0; idx--) {
          const tm = queue[idx];
          const health = getMatchHealthState(tm);

          if (health.hasDisabled) {
            queue.splice(idx, 1);
            await markMatchSkipped(tm, "model_disabled", {
              modelHealth: Object.fromEntries(health.statuses.map((status) => [status.key, status])),
            });
            continue;
          }

          if (!health.available) {
            if (health.pausedUntil !== null) {
              earliestPausedUntil = earliestPausedUntil === null
                ? health.pausedUntil
                : Math.min(earliestPausedUntil, health.pausedUntil);
            }
            continue;
          }

          launchable.push(tm);
        }

        if (launchable.length === 0) {
          if (earliestPausedUntil !== null) {
            return { kind: "wait", waitMs: Math.max(250, earliestPausedUntil - Date.now()) };
          }
          return { kind: "empty" };
        }

        const nextMatch = pickNextCandidate(launchable);
        const queueIndex = queue.findIndex((entry) => entry.id === nextMatch.id);
        if (queueIndex < 0) {
          return { kind: "empty" };
        }

        queue.splice(queueIndex, 1);
        const providers = getMatchProviders(nextMatch);
        const promise = runSingleMatch(nextMatch).finally(() => {
          running.delete(nextMatch.id);
        });
        running.set(nextMatch.id, { promise, providers });

        if (delayBetweenMatches > 0) {
          await sleep(delayBetweenMatches);
        }

        return { kind: "launched" };
      }

      while (queue.length > 0 || running.size > 0) {
        if (stopped && running.size === 0) {
          break;
        }

        while (running.size < maxConcurrency && queue.length > 0 && !stopped) {
          const launchResult = await launchNext();
          if (launchResult.kind === "launched") continue;
          if (launchResult.kind === "wait") {
            if (running.size === 0 && launchResult.waitMs) {
              await sleep(launchResult.waitMs);
              continue;
            }
            break;
          }
          break;
        }

        if (running.size > 0) {
          await Promise.race(Array.from(running.values()).map((entry) => entry.promise));
        } else if (queue.length > 0 && !stopped) {
          const launchResult = await launchNext();
          if (launchResult.kind === "wait" && launchResult.waitMs) {
            await sleep(launchResult.waitMs);
          } else if (launchResult.kind === "empty") {
            break;
          }
        }
      }
    }

    await syncTournamentProgress();
    await runQueue(pendingMatches, concurrency);

    await syncActualCost();

    const matchesAfterFirstPass = await storage.getTournamentMatches(tournamentId);
    const failedAfterFirstPass = matchesAfterFirstPass.filter(m => m.status === "failed");

    if (failedAfterFirstPass.length > 0 && activeTournaments.get(tournamentId)) {
      log(`[tournament] Tournament ${tournamentId} — retrying ${failedAfterFirstPass.length} failed match(es)`, "tournament");

      for (const fm of failedAfterFirstPass) {
        await storage.updateTournamentMatch(fm.id, { status: "pending", result: null as any, completedAt: null });
      }

      await syncTournamentProgress();
      const retryQueue = (await storage.getTournamentMatches(tournamentId)).filter(m => m.status === "pending");
      await runQueue(retryQueue, 1);
      await syncActualCost();
    }

    const finalSnapshot = await getTournamentSnapshot();
    const finalCost = finalSnapshot.completedMatchIds.length > 0
      ? await storage.getCumulativeCost(finalSnapshot.completedMatchIds)
      : 0;
    const budgetExceeded = budgetCap !== null && finalCost >= budgetCap;
    const finalStatus = budgetExceeded
      ? "budget_exceeded"
      : finalSnapshot.failedCount + finalSnapshot.skippedCount > 0
        ? "completed_with_errors"
        : "completed";

    await storage.updateTournament(tournamentId, {
      status: finalStatus,
      completedMatches: finalSnapshot.terminalCount,
      actualCostUsd: finalCost.toFixed(6),
      completedAt: new Date(),
    });

    log(`[tournament] Tournament ${tournamentId} ${finalStatus} (${finalSnapshot.failedCount} failures, ${finalSnapshot.skippedCount} skipped)`, "tournament");
  } catch (err) {
    log(`[tournament] Tournament ${tournamentId} error: ${err}`, "tournament");
    await storage.updateTournament(tournamentId, {
      status: "failed",
    });
  } finally {
    activeTournaments.delete(tournamentId);
    activeTournamentHealthTrackers.delete(tournamentId);
  }
}
