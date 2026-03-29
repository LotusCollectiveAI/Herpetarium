import { TournamentConfig, HeadlessMatchConfig } from "@shared/schema";
import { runHeadlessMatch } from "./headlessRunner";
import { storage } from "./storage";
import { log } from "./index";

const activeTournaments = new Map<number, boolean>();

export function isTournamentRunning(id: number): boolean {
  return activeTournaments.get(id) === true;
}

export async function createTournament(config: TournamentConfig) {
  const gamesPerMatchup = config.gamesPerMatchup || 1;
  const allMatchConfigs: HeadlessMatchConfig[] = [];

  for (const mc of config.matchConfigs) {
    for (let i = 0; i < gamesPerMatchup; i++) {
      allMatchConfigs.push(mc);
    }
  }

  const tournament = await storage.createTournament({
    name: config.name,
    status: "pending",
    config: config as any,
    totalMatches: allMatchConfigs.length,
    completedMatches: 0,
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
    await storage.updateTournament(tournamentId, {
      status: "running",
      startedAt: new Date(),
    });

    const tournamentMatches = await storage.getTournamentMatches(tournamentId);
    const pendingMatches = tournamentMatches.filter(m => m.status === "pending");

    log(`[tournament] Starting tournament ${tournamentId} with ${pendingMatches.length} matches`, "tournament");

    let completed = tournamentMatches.filter(m => m.status === "completed").length;

    for (const tm of pendingMatches) {
      if (!activeTournaments.get(tournamentId)) {
        log(`[tournament] Tournament ${tournamentId} was stopped`, "tournament");
        break;
      }

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

    const finalMatches = await storage.getTournamentMatches(tournamentId);
    const failedCount = finalMatches.filter(m => m.status === "failed").length;
    const finalStatus = failedCount > 0 ? "completed_with_errors" : "completed";

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
