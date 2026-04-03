/**
 * 30-game arena run: 8 coaches, 4 sprints, ~32 games on DeepSeek V3.2 3v3.
 *
 * Usage: npx tsx scripts/run-30game-arena.ts
 */

process.env.PORT = "3998";

import { runArena } from "../server/arena";
import { SEED_GENOME_TEMPLATES } from "../server/coachLoop";
import { computeArenaPareto } from "../server/pareto";

async function main() {
  console.log("=== Herpetarium 30-Game Arena Run ===");
  console.log("Model: DeepSeek Chat V3 0324 via OpenRouter");
  console.log("Format: 8 coaches, 4 sprints, 2 matches per sprint = ~32 games");
  console.log("Teams: 3v3");
  console.log("FOIA: ON after sprint 1");
  console.log("");

  const startTime = Date.now();
  const result = await runArena({
    arenaId: `arena-30g-${Date.now()}`,
    seedGenomes: SEED_GENOME_TEMPLATES.map((genome) => ({ ...genome })),
    coachConfig: {
      coachProvider: "openrouter",
      coachModel: "deepseek/deepseek-chat-v3-0324",
      playerProvider: "openrouter",
      playerModel: "deepseek/deepseek-chat-v3-0324",
      matchesPerSprint: 2,
      sprintConcurrency: 1,
      totalSprints: 4,
      teamSize: 3,
    },
    totalSprints: 4,
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

  // Compute Pareto frontier
  let frontierSize = 0;
  try {
    const frontier = await computeArenaPareto(result.arenaId);
    frontierSize = frontier.frontierSize;
    console.log(`\nPareto frontier size: ${frontierSize}`);
    console.log("Frontier points:");
    for (const p of frontier.points) {
      console.log(
        `  slot${p.slotIndex} sprint${p.sprintNumber}: winRate=${p.winRate.toFixed(3)} intercept=${p.interceptionResistance.toFixed(3)} adapt=${p.adaptationSpeed.toFixed(3)} complexity=${p.complexity}`,
      );
    }
  } catch (e) {
    console.log(`Pareto computation failed: ${e}`);
  }

  // Standings
  const standings = [...result.slots].sort((left, right) => {
    const leftGames = left.wins + left.losses + left.draws;
    const rightGames = right.wins + right.losses + right.draws;
    const leftWinRate = leftGames > 0 ? left.wins / leftGames : 0;
    const rightWinRate = rightGames > 0 ? right.wins / rightGames : 0;
    if (rightWinRate !== leftWinRate) return rightWinRate - leftWinRate;
    if (right.wins !== left.wins) return right.wins - left.wins;
    return left.slotIndex - right.slotIndex;
  });

  console.log("\n=== FINAL STANDINGS ===");
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
  console.log(`Pareto frontier: ${frontierSize} non-dominated points`);
  console.log(`Wall time: ${elapsed}s`);
  console.log(`Estimated cost: ~$${(result.totalGamesPlayed * 0.014).toFixed(2)}`);
}

main().catch((error) => {
  console.error("Arena run failed:");
  console.error(error);
  process.exit(1);
});
