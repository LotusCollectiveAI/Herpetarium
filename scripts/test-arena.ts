/**
 * Quick validation: run an 8-coach arena with DeepSeek Chat V3 0324.
 *
 * Usage: npx tsx scripts/test-arena.ts
 */

process.env.PORT = "3998";

import { runArena } from "../server/arena";
import { SEED_GENOME_TEMPLATES } from "../server/coachLoop";

async function main() {
  console.log("=== Herpetarium Arena Validation Run ===");
  console.log("Model: DeepSeek Chat V3 0324 via OpenRouter");
  console.log("Format: 8 coaches, 2 sprints, 2 matches per sprint = 16 total games");
  console.log("FOIA: ON after sprint 1");
  console.log("");

  const startTime = Date.now();
  const result = await runArena({
    arenaId: `arena-${Date.now()}`,
    seedGenomes: SEED_GENOME_TEMPLATES.map((genome) => ({ ...genome })),
    coachConfig: {
      coachProvider: "openrouter",
      coachModel: "deepseek/deepseek-chat-v3-0324",
      playerProvider: "openrouter",
      playerModel: "deepseek/deepseek-chat-v3-0324",
      matchesPerSprint: 2, // Test mode — production default is 4
      sprintConcurrency: 1,
      totalSprints: 2,
      teamSize: 2,
    },
    totalSprints: 2,
    matchesPerSprint: 2,
    globalMatchConcurrency: 4,
    matchmaking: {
      nearPeer: 0.40,
      diagnostic: 0.25,
      mirror: 0.15,
      novelty: 0.10,
      baseline: 0.10,
    },
    foiaEnabled: true,
    foiaDelaySprints: 1,
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const standings = [...result.slots].sort((left, right) => {
    const leftGames = left.wins + left.losses + left.draws;
    const rightGames = right.wins + right.losses + right.draws;
    const leftWinRate = leftGames > 0 ? left.wins / leftGames : 0;
    const rightWinRate = rightGames > 0 ? right.wins / rightGames : 0;

    if (rightWinRate !== leftWinRate) {
      return rightWinRate - leftWinRate;
    }

    if (right.wins !== left.wins) {
      return right.wins - left.wins;
    }

    return left.slotIndex - right.slotIndex;
  });

  console.log("=== FINAL STANDINGS ===");
  for (const slot of standings) {
    const games = slot.wins + slot.losses + slot.draws;
    const winRate = games > 0 ? (slot.wins / games).toFixed(3) : "0.000";
    console.log(
      `slot${slot.slotIndex} ${slot.wins}-${slot.losses}${slot.draws > 0 ? `-${slot.draws}` : ""} winRate=${winRate} runId=${slot.runId}`,
    );
  }

  console.log("");
  console.log(`Arena ID: ${result.arenaId}`);
  console.log(`Sprints completed: ${result.sprintsCompleted}`);
  console.log(`Total games played: ${result.totalGamesPlayed}`);
  console.log(`Wall time: ${elapsed}s`);
}

main().catch((error) => {
  console.error("Arena validation failed:");
  console.error(error);
  process.exit(1);
});
