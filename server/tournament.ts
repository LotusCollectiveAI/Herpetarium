import { TournamentConfig, HeadlessMatchConfig, AIProvider, AIPlayerConfig } from "@shared/schema";
import { runHeadlessMatch } from "./headlessRunner";
import { storage } from "./storage";
import { log } from "./index";
import { getProviderThrottleState } from "./ai";

// ── Round-robin config generator ──────────────────────────────────────

export interface RoundRobinModelSpec {
  name: string;
  provider: AIProvider;
  model: string;
  config?: Partial<AIPlayerConfig>;
}

/**
 * Generate HeadlessMatchConfig[] for all C(n,2) pairings in a round-robin.
 * Each pairing produces one config with `teamSize` players per team.
 * Player names follow the pattern "ModelName (A1)" for amber, "ModelName (B1)" for blue.
 */
export function generateRoundRobinConfigs(
  models: RoundRobinModelSpec[],
  teamSize: 2 | 3 = 3,
): HeadlessMatchConfig[] {
  const configs: HeadlessMatchConfig[] = [];

  for (let i = 0; i < models.length; i++) {
    for (let j = i + 1; j < models.length; j++) {
      const amber = models[i];
      const blue = models[j];

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

      configs.push({ players, teamSize });
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
      allMatchConfigs.push(matchWithAblations);
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

export async function runTournament(tournamentId: number) {
  if (activeTournaments.get(tournamentId)) {
    log(`[tournament] Tournament ${tournamentId} is already running`, "tournament");
    return;
  }

  activeTournaments.set(tournamentId, true);

  try {
    const tournament = await storage.getTournament(tournamentId);
    const budgetCap = tournament?.budgetCapUsd ? parseFloat(tournament.budgetCapUsd) : null;

    await storage.updateTournament(tournamentId, {
      status: "running",
      startedAt: new Date(),
    });

    const tournamentMatches = await storage.getTournamentMatches(tournamentId);
    const pendingMatches = tournamentMatches.filter(m => m.status === "pending");

    log(`[tournament] Starting tournament ${tournamentId} with ${pendingMatches.length} matches${budgetCap ? ` (budget cap: $${budgetCap})` : ""}`, "tournament");

    let completed = tournamentMatches.filter(m => m.status === "completed").length;
    const completedMatchIds: number[] = tournamentMatches
      .filter(m => m.status === "completed" && m.matchId)
      .map(m => m.matchId as number);

    const tournamentConfig = tournament?.config as TournamentConfig | undefined;
    const concurrency = Math.max(1, Math.min(20, tournamentConfig?.concurrency || 1));
    const delayBetweenMatches = tournamentConfig?.delayBetweenMatchesMs || 0;

    /** Extract the set of AI providers used by a match config */
    function getMatchProviders(tm: typeof pendingMatches[0]): Set<string> {
      const cfg = tm.config as HeadlessMatchConfig;
      const providers = new Set<string>();
      for (const p of cfg.players) {
        if (p.aiProvider) providers.add(p.aiProvider);
      }
      return providers;
    }

    async function runSingleMatch(tm: typeof pendingMatches[0]): Promise<void> {
      await storage.updateTournamentMatch(tm.id, { status: "running" });

      try {
        const matchConfig = tm.config as HeadlessMatchConfig;
        const result = await runHeadlessMatch(matchConfig);

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

        completedMatchIds.push(result.matchId);
        completed++;
        await storage.updateTournament(tournamentId, {
          completedMatches: completed,
        });

        log(`[tournament] Tournament ${tournamentId} - Match ${completed}/${tournamentMatches.length} complete`, "tournament");
      } catch (err) {
        log(`[tournament] Match failed in tournament ${tournamentId}: ${err}`, "tournament");
        await storage.updateTournamentMatch(tm.id, {
          status: "failed",
          result: { error: String(err) } as any,
        });
        completed++;
        await storage.updateTournament(tournamentId, {
          completedMatches: completed,
        });
      }
    }

    // ── Rolling concurrent pool with provider-aware scheduling ─────────
    {
      const queue = [...pendingMatches]; // matches still waiting to launch
      const running = new Map<number, { promise: Promise<void>; providers: Set<string> }>(); // tm.id -> info
      let stopped = false;

      /**
       * Pick the best next match from `queue` given currently-running providers.
       * Prefers matches whose providers have the least overlap with running ones.
       * Returns the index into `queue`, or 0 if nothing scores better.
       */
      function pickNext(): number {
        if (queue.length <= 1) return 0;

        // Collect all providers currently in use
        const inUse = new Set<string>();
        for (const r of running.values()) {
          for (const p of r.providers) inUse.add(p);
        }
        if (inUse.size === 0) return 0;

        let bestIdx = 0;
        let bestScore = -1;
        for (let qi = 0; qi < queue.length; qi++) {
          const providers = getMatchProviders(queue[qi]);
          let score = 0;
          for (const p of providers) {
            if (!inUse.has(p)) score++;
          }
          if (score > bestScore) {
            bestScore = score;
            bestIdx = qi;
          }
        }
        return bestIdx;
      }

      /** Launch one match from the queue, applying delay and budget checks first. */
      async function launchNext(): Promise<boolean> {
        if (queue.length === 0 || stopped) return false;

        if (!activeTournaments.get(tournamentId)) {
          log(`[tournament] Tournament ${tournamentId} was stopped`, "tournament");
          stopped = true;
          return false;
        }

        // Budget cap check
        if (budgetCap && completedMatchIds.length > 0) {
          const currentCost = await storage.getCumulativeCost(completedMatchIds);
          await storage.updateTournament(tournamentId, { actualCostUsd: currentCost.toFixed(6) });
          if (currentCost >= budgetCap) {
            log(`[tournament] Tournament ${tournamentId} - Budget cap exceeded ($${currentCost.toFixed(4)} >= $${budgetCap})`, "tournament");
            stopped = true;
            return false;
          }
        }

        // Provider-aware pick
        const idx = pickNext();
        const tm = queue.splice(idx, 1)[0];
        const providers = getMatchProviders(tm);

        const promise = runSingleMatch(tm).finally(() => {
          running.delete(tm.id);
        });
        running.set(tm.id, { promise, providers });

        // Stagger starts
        if (delayBetweenMatches > 0) {
          await new Promise(resolve => setTimeout(resolve, delayBetweenMatches));
        }

        return true;
      }

      // Fill initial pool up to concurrency
      while (running.size < concurrency && queue.length > 0 && !stopped) {
        const launched = await launchNext();
        if (!launched) break;
      }

      // As matches complete, launch new ones to keep the pool full
      while (running.size > 0) {
        // Wait for any one running match to finish
        await Promise.race(Array.from(running.values()).map(r => r.promise));

        // Refill slots
        while (running.size < concurrency && queue.length > 0 && !stopped) {
          const launched = await launchNext();
          if (!launched) break;
        }
      }
    }

    if (completedMatchIds.length > 0) {
      const finalCost = await storage.getCumulativeCost(completedMatchIds);
      await storage.updateTournament(tournamentId, { actualCostUsd: finalCost.toFixed(6) });
    }

    // ── Single retry pass for failed matches ──────────────────────────
    const matchesAfterFirstPass = await storage.getTournamentMatches(tournamentId);
    const failedAfterFirstPass = matchesAfterFirstPass.filter(m => m.status === "failed");

    if (failedAfterFirstPass.length > 0 && activeTournaments.get(tournamentId)) {
      log(`[tournament] Tournament ${tournamentId} — retrying ${failedAfterFirstPass.length} failed match(es)`, "tournament");

      // Reset failed matches to pending
      for (const fm of failedAfterFirstPass) {
        await storage.updateTournamentMatch(fm.id, { status: "pending", result: null as any });
      }

      // Re-run them sequentially with delay
      for (const fm of failedAfterFirstPass) {
        if (!activeTournaments.get(tournamentId)) break;

        // Check budget before retry
        if (budgetCap && completedMatchIds.length > 0) {
          const currentCost = await storage.getCumulativeCost(completedMatchIds);
          if (currentCost >= budgetCap) {
            log(`[tournament] Tournament ${tournamentId} — budget cap reached during retry`, "tournament");
            break;
          }
        }

        log(`[tournament] Retrying match index ${fm.matchIndex}`, "tournament");
        await runSingleMatch(fm);

        if (delayBetweenMatches > 0) {
          await new Promise(resolve => setTimeout(resolve, delayBetweenMatches));
        }
      }

      // Update cost after retries
      if (completedMatchIds.length > 0) {
        const retryCost = await storage.getCumulativeCost(completedMatchIds);
        await storage.updateTournament(tournamentId, { actualCostUsd: retryCost.toFixed(6) });
      }
    }

    const finalMatches = await storage.getTournamentMatches(tournamentId);
    const failedCount = finalMatches.filter(m => m.status === "failed").length;
    const budgetExceeded = budgetCap && completedMatchIds.length > 0 &&
      (await storage.getCumulativeCost(completedMatchIds)) >= budgetCap;
    const finalStatus = budgetExceeded ? "budget_exceeded" : failedCount > 0 ? "completed_with_errors" : "completed";

    await storage.updateTournament(tournamentId, {
      status: finalStatus,
      completedAt: new Date(),
    });

    log(`[tournament] Tournament ${tournamentId} ${finalStatus} (${failedCount} failures)`, "tournament");
  } catch (err) {
    log(`[tournament] Tournament ${tournamentId} error: ${err}`, "tournament");
    await storage.updateTournament(tournamentId, {
      status: "failed",
    });
  } finally {
    activeTournaments.delete(tournamentId);
  }
}
