/**
 * Quick validation ladder smoke test: run only the g10 gate with DeepSeek Chat V3 0324.
 *
 * Usage: npx tsx scripts/test-validation.ts
 */

process.env.PORT = "3998";

import { SEED_GENOME_TEMPLATES } from "../server/coachLoop";
import { VALIDATION_GATES, runValidation } from "../server/validationHarness";

async function main() {
  console.log("=== Herpetarium Validation Ladder Smoke Test ===");
  console.log("Gate: g10 only");
  console.log("Model: DeepSeek Chat V3 0324 via OpenRouter");
  console.log("Arena: 8 coaches, matchesPerSprint=2, FOIA enabled after sprint 1");
  console.log("");

  const startTime = Date.now();
  const report = await runValidation(
    {
      seedGenomes: SEED_GENOME_TEMPLATES.map((genome) => ({ ...genome })),
      coachConfig: {
        coachProvider: "openrouter",
        coachModel: "deepseek/deepseek-chat-v3-0324",
        playerProvider: "openrouter",
        playerModel: "deepseek/deepseek-chat-v3-0324",
        matchesPerSprint: 2,
        sprintConcurrency: 1,
        totalSprints: 1,
        teamSize: 2,
      },
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
    },
    [VALIDATION_GATES[0]],
  );

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const gate = report.gates[0];

  console.log("=== GATE REPORT ===");
  console.log(`Arena ID: ${gate.arenaId}`);
  console.log(`Games played: ${gate.gamesPlayed}`);
  console.log(`Clean match rate: ${gate.cleanMatchRate.toFixed(3)}`);
  console.log(`Pareto frontier size: ${gate.frontierSize}`);
  console.log("");

  console.log("Standings:");
  for (const standing of gate.standings) {
    console.log(
      `slot${standing.slotIndex} ${standing.wins}-${standing.losses}${standing.draws > 0 ? `-${standing.draws}` : ""} winRate=${standing.winRate.toFixed(3)} runId=${standing.runId}`,
    );
  }

  console.log("");
  console.log("Metric coverage:");
  for (const [metricKey, coverage] of Object.entries(gate.metricCoverage).sort(([left], [right]) => left.localeCompare(right))) {
    console.log(`${metricKey}: ${coverage.toFixed(3)}`);
  }

  console.log("");
  console.log(`Total cost: $${report.totalCostUsd.toFixed(4)}`);
  console.log(`Wall time: ${elapsed}s`);
}

main().catch((error) => {
  console.error("Validation smoke test failed:");
  console.error(error);
  process.exit(1);
});
