/**
 * Quick validation: run a 2-coach ecology with DeepSeek V3.2, 3v3, 2 sprints × 5 matches = 10 games.
 * Expected cost: ~$1.65 + coach overhead ≈ $2.
 *
 * Usage: npx tsx scripts/test-ecology.ts
 */

// Use a different port so we don't conflict with a running dev server
process.env.PORT = "3999";

import { runEcology, type EcologyConfig } from "../server/coachArena";
import { SEED_GENOME_TEMPLATES } from "../server/coachLoop";

async function main() {
  console.log("=== Herpetarium V2: Ecology Validation Run ===");
  console.log("Model: DeepSeek V3.2 via OpenRouter");
  console.log("Format: 3v3 with deliberation");
  console.log("Plan: 2 coaches, 2 sprints, 5 matches/sprint = 10 games");
  console.log("Estimated cost: ~$2");
  console.log("FOIA: OFF (this is a baseline validation run)");
  console.log("");

  const config: EcologyConfig = {
    coachConfig: {
      coachProvider: "openrouter",
      coachModel: "deepseek/deepseek-v3.2",
      playerProvider: "openrouter",
      playerModel: "deepseek/deepseek-v3.2",
      matchesPerSprint: 5, // Test mode — production default is 4
      sprintConcurrency: 3,   // conservative for first run
      totalSprints: 2,
      teamSize: 3,
    },
    totalSprints: 2,
    matchesPerSprint: 5,
    foiaEnabled: false,
    leftSeedGenome: SEED_GENOME_TEMPLATES[0],   // Abstract/metaphorical
    rightSeedGenome: SEED_GENOME_TEMPLATES[1],   // Concrete/sensory
  };

  const startTime = Date.now();

  try {
    const result = await runEcology(config);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log("");
    console.log("=== ECOLOGY COMPLETE ===");
    console.log(`Left run:  ${result.leftRunId}`);
    console.log(`Right run: ${result.rightRunId}`);
    console.log(`Sprints completed: ${result.sprintsCompleted}`);
    console.log(`Wall time: ${elapsed}s`);
    console.log("");
    console.log("Check DB for results:");
    console.log("  psql decrypto_arena -c \"SELECT id, status, current_sprint, actual_cost_usd FROM coach_runs\"");
    console.log("  psql decrypto_arena -c \"SELECT run_id, sprint_number, record, win_rate, decision FROM coach_sprints ORDER BY run_id, sprint_number\"");
  } catch (error) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error("");
    console.error(`=== ECOLOGY FAILED after ${elapsed}s ===`);
    console.error(error);
    process.exit(1);
  }
}

main();
