/**
 * Fixed two-round mechanism canary. Importing this module has no side effects.
 * The CLI accepts exactly one brand-new output directory.
 */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runCandidatePolicyAbExperiment } from "./run-candidate-policy-ab-experiment";

function isDirectExecution(): boolean {
  return Boolean(
    process.argv[1] &&
      resolve(process.argv[1]) === fileURLToPath(import.meta.url),
  );
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length !== 1 || args[0]!.startsWith("-")) {
    throw new Error(
      "Usage: tsx scripts/run-candidate-policy-ab-mechanism-canary.ts <new-output-directory>",
    );
  }
  const result = await runCandidatePolicyAbExperiment({
    outputDir: args[0]!,
    schedule: "mechanism-canary",
  });
  console.log(
    JSON.stringify(
      {
        status: result.status,
        schedule: result.schedule.id,
        validMatches: result.validMatches,
        plannedMatches: result.plannedMatches,
        purpose: "mechanism_telemetry_only",
        releaseBoundary: result.releaseBoundary,
        tableBotBuildLicenseEligible:
          result.tableBotBuildLicenseEligible,
      },
      null,
      2,
    ),
  );
  if (result.status !== "complete") process.exitCode = 1;
}

if (isDirectExecution()) {
  main().catch((error) => {
    console.error(
      `[candidate-policy-ab-canary] ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    process.exitCode = 1;
  });
}
