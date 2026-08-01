/**
 * Offline regression checks for durable headless strategy lineage.
 *
 * No server, database, provider, or credentials are used.
 */

import assert from "node:assert/strict";
import type { HeadlessPromptOverrides } from "@shared/schema";
import {
  CIPHER_ENCRYPT_CANDIDATE_POLICY_ARTIFACT,
  INTERMEDIATE_HOPS_SOURCE,
  compileStrategyArtifact,
  contentHash,
  mintStrategyArtifact,
  sha256Hex,
} from "../shared/substrate";
import { buildHeadlessStrategyLineage } from "../server/headlessLineage";

let assertions = 0;

function equal<T>(actual: T, expected: T, message: string): void {
  assert.equal(actual, expected, message);
  assertions += 1;
}

function deepEqual(actual: unknown, expected: unknown, message: string): void {
  assert.deepEqual(actual, expected, message);
  assertions += 1;
}

function ok(value: unknown, message: string): asserts value {
  assert.ok(value, message);
  assertions += 1;
}

const intermediateHops = compileStrategyArtifact(
  mintStrategyArtifact(INTERMEDIATE_HOPS_SOURCE),
);

function treatmentOverrides(): HeadlessPromptOverrides {
  return {
    amber: {
      compiledPrompts: JSON.parse(
        JSON.stringify(intermediateHops.compiled),
      ),
      monolithicSystemPrompt: "Unused fallback treatment prompt",
      candidatePolicy: CIPHER_ENCRYPT_CANDIDATE_POLICY_ARTIFACT,
    },
    blue: {
      compiledPrompts: JSON.parse(
        JSON.stringify(intermediateHops.compiled),
      ),
    },
  };
}

function testExactTreatmentBinding(): void {
  const overrides = treatmentOverrides();
  const lineage = buildHeadlessStrategyLineage(overrides);
  ok(lineage, "prompt overrides produce a lineage snapshot");

  equal(lineage.lineageVersion, "0.1", "lineage version is explicit");
  deepEqual(
    lineage.promptOverrides,
    overrides,
    "normalized prompt overrides survive exactly",
  );
  equal(
    lineage.promptOverridesHash,
    contentHash(overrides),
    "the exact normalized carrier is content-hashed",
  );

  equal(
    lineage.teams.amber?.artifact?.id,
    intermediateHops.artifactId,
    "treated team binds to the named shared artifact",
  );
  equal(
    lineage.teams.amber?.artifact?.contentHash,
    intermediateHops.artifactContentHash,
    "treated team binds to the exact artifact content hash",
  );
  equal(
    lineage.teams.amber?.compilation?.compiledPromptsHash,
    contentHash(intermediateHops.compiled),
    "treated team binds the complete compiled carrier",
  );
  equal(
    lineage.teams.amber?.compilation?.compilerVersion,
    intermediateHops.compiled.compilerVersion,
    "treated team binds the compiler version",
  );
  equal(
    lineage.teams.amber?.compilation?.substrateVersion,
    intermediateHops.compiled.substrateVersion,
    "treated team binds the substrate version",
  );
  equal(
    lineage.teams.amber?.candidatePolicy?.contentHash,
    CIPHER_ENCRYPT_CANDIDATE_POLICY_ARTIFACT.contentHash,
    "treated team binds the candidate-policy hash",
  );
  deepEqual(
    lineage.teams.amber?.candidatePolicy?.appliesToRoles,
    ["cluegiver"],
    "candidate policy is explicitly scoped to the cluegiver role",
  );
  equal(
    lineage.teams.amber?.roles.cluegiver.candidatePolicyHash,
    CIPHER_ENCRYPT_CANDIDATE_POLICY_ARTIFACT.contentHash,
    "cluegiver role carries the candidate policy",
  );
  equal(
    lineage.teams.amber?.roles.own_guesser.candidatePolicyHash,
    undefined,
    "own guesser does not inherit the candidate policy",
  );
  equal(
    lineage.teams.blue?.candidatePolicy,
    undefined,
    "control team does not receive a candidate policy",
  );
  equal(
    lineage.teams.blue?.artifact?.id,
    intermediateHops.artifactId,
    "control team still binds its exact compiled artifact",
  );
  equal(
    lineage.teams.amber?.roles.cluegiver.systemPromptHash,
    sha256Hex(intermediateHops.compiled.prompts.cluegiver.systemPrompt),
    "effective cluegiver system prompt is hashed",
  );
  equal(
    lineage.teams.amber?.roles.coach.usedByHeadlessRunner,
    false,
    "lineage does not imply the compiled coach prompt powered reflection",
  );
}

function testUnknownCompilationIsNotMisnamed(): void {
  const overrides = treatmentOverrides();
  const amber = overrides.amber;
  ok(amber?.compiledPrompts, "fixture has compiled amber prompts");
  amber.compiledPrompts = {
    ...amber.compiledPrompts,
    prompts: {
      ...amber.compiledPrompts.prompts,
      cluegiver: {
        ...amber.compiledPrompts.prompts.cluegiver,
        systemPrompt:
          `${amber.compiledPrompts.prompts.cluegiver.systemPrompt}\nChanged`,
        charCount:
          amber.compiledPrompts.prompts.cluegiver.charCount +
          "\nChanged".length,
      },
    },
  };

  const lineage = buildHeadlessStrategyLineage(overrides);
  ok(lineage, "modified compilation still produces reproducible lineage");
  equal(
    lineage.teams.amber?.artifact,
    undefined,
    "modified compiled bytes cannot inherit a known artifact identity",
  );
  ok(
    lineage.teams.amber?.compilation?.compiledPromptsHash,
    "unknown compiled bytes retain an exact compilation hash",
  );
}

function testSnapshotDoesNotAliasCaller(): void {
  const overrides = treatmentOverrides();
  const lineage = buildHeadlessStrategyLineage(overrides);
  ok(lineage, "lineage exists before caller mutation");
  const originalHash = lineage.promptOverridesHash;

  if (overrides.amber?.compiledPrompts) {
    overrides.amber.compiledPrompts.prompts.cluegiver.systemPrompt =
      "mutated after snapshot";
  }

  equal(
    lineage.promptOverridesHash,
    originalHash,
    "caller mutation cannot rewrite the persisted lineage hash",
  );
  equal(
    lineage.promptOverrides.amber?.compiledPrompts?.prompts.cluegiver
      .systemPrompt,
    intermediateHops.compiled.prompts.cluegiver.systemPrompt,
    "caller mutation cannot rewrite the exact lineage snapshot",
  );
}

equal(
  buildHeadlessStrategyLineage(undefined),
  null,
  "matches without overrides store no synthetic strategy lineage",
);
testExactTreatmentBinding();
testUnknownCompilationIsNotMisnamed();
testSnapshotDoesNotAliasCaller();

console.log(`headless lineage checks passed (${assertions} assertions)`);
