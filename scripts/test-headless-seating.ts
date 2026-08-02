/**
 * Offline regression checks for HTTP/tournament experiment seating.
 *
 * No server, database, provider, or credentials are used.
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import ts from "typescript";
import {
  getConfigForModel,
  getDefaultConfigForProvider,
} from "@shared/modelRegistry";
import type {
  AIPlayerConfig,
  HeadlessMatchConfig,
  GenomeModules,
} from "@shared/schema";
import {
  CIPHER_ENCRYPT_CANDIDATE_POLICY_ARTIFACT,
} from "../shared/substrate/candidatePolicy";
import { compileGenomePrompts } from "../shared/substrate/compile";
import {
  headlessMatchConfigSchema,
  parseHeadlessMatchConfig,
  tournamentConfigSchema,
} from "../server/headlessConfigSchema";
import { extractUniqueModelConfigs } from "../server/modelValidation";
import { resolveRoleCandidatePolicy } from "../server/headlessPromptAuthority";
import { getPromptStrategy } from "../server/promptStrategies";

const EXACT_MODEL = "deepseek/deepseek-v4-flash-0731";
const EXPECTED_MODEL_DEFAULTS = {
  timeoutMs: 45 * 60 * 1000,
  promptStrategy: "advanced",
  reasoningEffort: "xhigh",
} as const;

let assertions = 0;

function ok(value: unknown, message: string): asserts value {
  assert.ok(value, message);
  assertions += 1;
}

function equal<T>(actual: T, expected: T, message: string): void {
  assert.equal(actual, expected, message);
  assertions += 1;
}

function deepEqual(actual: unknown, expected: unknown, message: string): void {
  assert.deepEqual(actual, expected, message);
  assertions += 1;
}

function assertExactModelDefaults(
  config: AIPlayerConfig | undefined,
  lane: string,
): void {
  ok(config, `${lane} produces an AI config`);
  equal(config.provider, "openrouter", `${lane} preserves provider`);
  equal(config.model, EXACT_MODEL, `${lane} preserves exact dated model`);
  equal(
    config.timeoutMs,
    EXPECTED_MODEL_DEFAULTS.timeoutMs,
    `${lane} resolves the model timeout`,
  );
  equal(
    config.promptStrategy,
    EXPECTED_MODEL_DEFAULTS.promptStrategy,
    `${lane} resolves the advanced prompt strategy`,
  );
  equal(
    config.reasoningEffort,
    EXPECTED_MODEL_DEFAULTS.reasoningEffort,
    `${lane} resolves xhigh reasoning`,
  );
}

const treatmentGenome: GenomeModules = {
  cluePhilosophy:
    "Generate several indirect candidates and reject definition-shaped clues.",
  opponentModeling:
    "Assume a strong interceptor will test first-order semantic associations.",
  riskTolerance:
    "Protect the keyword map while keeping the intended decode reliable.",
  memoryPolicy:
    "Track exposed association families and rotate away from them.",
  executionGuidance:
    "Compare candidate clues by teammate clarity and blind reconstruction risk.",
  deliberationScaffold:
    "State alternatives, confidence, and the strongest counter-hypothesis.",
};

function buildRequestPayload() {
  const compiled = compileGenomePrompts(treatmentGenome);
  return {
    compiled,
    payload: {
      players: [
        {
          name: "Treatment Amber 1",
          aiProvider: "openrouter",
          team: "amber",
          aiConfig: {
            provider: "openrouter",
            model: EXACT_MODEL,
          },
        },
        {
          name: "Treatment Amber 2",
          aiProvider: "openrouter",
          team: "amber",
          aiConfig: {
            provider: "openrouter",
            model: EXACT_MODEL,
          },
        },
        {
          name: "Control Blue 1",
          aiProvider: "openrouter",
          team: "blue",
          aiConfig: {
            provider: "openrouter",
            model: EXACT_MODEL,
          },
        },
        {
          name: "Control Blue 2",
          aiProvider: "openrouter",
          team: "blue",
          aiConfig: {
            provider: "openrouter",
            model: EXACT_MODEL,
          },
        },
      ],
      teamSize: 2,
      strictExecution: true,
      seed: "offline-ab-role-swap-1",
      experimentId: "decrypto-intermediate-hops-v0.1",
      promptOverrides: {
        amber: {
          compiledPrompts: compiled,
          monolithicSystemPrompt: "Fallback treatment prompt",
          candidatePolicy: CIPHER_ENCRYPT_CANDIDATE_POLICY_ARTIFACT,
        },
        blue: {
          compiledPrompts: compiled,
        },
      },
      roleSwapGroupId: "offline-role-swap-group",
      focalTeam: "amber",
      matchKind: "training",
      matchmakingBucket: "diagnostic",
    },
  };
}

async function testExactCompiledTreatmentSurvives(): Promise<void> {
  const { compiled, payload } = buildRequestPayload();
  const parsed = headlessMatchConfigSchema.safeParse(payload);
  ok(parsed.success, "headless request schema accepts the strict A/B fixture");
  if (!parsed.success) return;

  const normalized = parseHeadlessMatchConfig(payload);

  equal(
    normalized.experimentId,
    payload.experimentId,
    "experimentId survives parsing and normalization",
  );
  equal(
    normalized.roleSwapGroupId,
    payload.roleSwapGroupId,
    "role-swap group survives parsing and normalization",
  );
  equal(
    normalized.focalTeam,
    payload.focalTeam,
    "focal team survives parsing and normalization",
  );
  equal(
    normalized.matchKind,
    payload.matchKind,
    "match kind survives parsing and normalization",
  );
  equal(
    normalized.matchmakingBucket,
    payload.matchmakingBucket,
    "matchmaking bucket survives parsing and normalization",
  );
  deepEqual(
    normalized.promptOverrides?.amber?.compiledPrompts,
    compiled,
    "the canonical compiled treatment survives byte-for-byte structurally",
  );
  deepEqual(
    normalized.promptOverrides?.blue?.compiledPrompts,
    compiled,
    "the paired control-side compiled artifact also survives exactly",
  );
  deepEqual(
    normalized.promptOverrides?.amber?.candidatePolicy,
    CIPHER_ENCRYPT_CANDIDATE_POLICY_ARTIFACT,
    "the treated team preserves the exact candidate-policy carrier",
  );
  equal(
    normalized.promptOverrides?.blue?.candidatePolicy,
    undefined,
    "the baseline team does not inherit the candidate-policy carrier",
  );
  equal(
    normalized.promptOverrides?.amber?.compiledPrompts?.genomeHash,
    compiled.genomeHash,
    "canonical genome hash survives",
  );
  equal(
    normalized.promptOverrides?.amber?.compiledPrompts?.legacyGenomeHash,
    compiled.legacyGenomeHash,
    "legacy lineage hash survives",
  );
  equal(
    normalized.promptOverrides?.amber?.compiledPrompts?.substrateVersion,
    compiled.substrateVersion,
    "substrate version survives",
  );

  for (const [role, artifact] of Object.entries(compiled.prompts)) {
    const seated =
      normalized.promptOverrides?.amber?.compiledPrompts?.prompts[
        role as keyof typeof compiled.prompts
      ];
    equal(
      seated?.systemPrompt,
      artifact.systemPrompt,
      `${role} system prompt survives exactly`,
    );
    equal(
      seated?.taskDirectives,
      artifact.taskDirectives,
      `${role} task directives survive exactly`,
    );
    equal(
      seated?.charCount,
      artifact.charCount,
      `${role} character-count integrity survives`,
    );
  }

  ok(normalized.teamRosters, "normalization still derives team rosters");
  ok(normalized.gameRules, "normalization still supplies game rules");

  const tournament = tournamentConfigSchema.safeParse({
    name: "Offline strict treatment tournament",
    matchConfigs: [payload],
    concurrency: 1,
    skipModelValidation: false,
  });
  ok(
    tournament.success,
    "tournament schema accepts the same strict A/B fixture",
  );
  if (tournament.success) {
    deepEqual(
      tournament.data.matchConfigs[0]?.promptOverrides?.amber
        ?.compiledPrompts,
      compiled,
      "tournament parsing preserves the exact compiled treatment",
    );
    deepEqual(
      tournament.data.matchConfigs[0]?.promptOverrides?.amber
        ?.candidatePolicy,
      CIPHER_ENCRYPT_CANDIDATE_POLICY_ARTIFACT,
      "tournament parsing persists exact candidate-policy provenance",
    );
    equal(
      tournament.data.matchConfigs[0]?.experimentId,
      payload.experimentId,
      "tournament parsing preserves experiment provenance",
    );
  }
}

async function testSeatedActorUsesExactModelDefaults(): Promise<void> {
  const registryConfig = getConfigForModel("openrouter", EXACT_MODEL);
  assertExactModelDefaults(registryConfig, "registry");

  const { payload } = buildRequestPayload();
  const normalized = parseHeadlessMatchConfig(payload);
  for (const [index, player] of normalized.players.entries()) {
    assertExactModelDefaults(player.aiConfig, `seated actor ${index + 1}`);
  }

  const validationConfigs = extractUniqueModelConfigs([normalized]);
  equal(
    validationConfigs.length,
    1,
    "validation sees one exact model configuration",
  );
  assertExactModelDefaults(
    validationConfigs[0],
    "validation/actor execution lane",
  );
}

async function testMalformedArtifactsFailClosed(): Promise<void> {
  const { payload } = buildRequestPayload();

  const wrongRole = structuredClone(payload);
  wrongRole.promptOverrides.amber.compiledPrompts.prompts.cluegiver.role =
    "interceptor" as "cluegiver";
  equal(
    headlessMatchConfigSchema.safeParse(wrongRole).success,
    false,
    "role-key/artifact-role mismatch is rejected",
  );

  const wrongCount = structuredClone(payload);
  wrongCount.promptOverrides.amber.compiledPrompts.prompts.cluegiver.charCount +=
    1;
  equal(
    headlessMatchConfigSchema.safeParse(wrongCount).success,
    false,
    "tampered compiled character count is rejected",
  );

  const wrongProvider = structuredClone(payload);
  wrongProvider.players[0].aiConfig.provider = "claude" as "openrouter";
  equal(
    headlessMatchConfigSchema.safeParse(wrongProvider).success,
    false,
    "actor provider mismatch is rejected",
  );

  const unknownProvenance = {
    ...payload,
    unvalidatedExperimentLabel: "silently-strip-me",
  };
  equal(
    headlessMatchConfigSchema.safeParse(unknownProvenance).success,
    false,
    "unknown top-level provenance is rejected instead of silently stripped",
  );

  for (const field of ["id", "instruction", "contentHash"] as const) {
    const changedPolicy = structuredClone(payload);
    changedPolicy.promptOverrides.amber.candidatePolicy[field] += "-changed";
    equal(
      headlessMatchConfigSchema.safeParse(changedPolicy).success,
      false,
      `changed candidate-policy ${field} is rejected`,
    );
  }
}

async function testCandidatePolicyAuthorityIsolation(): Promise<void> {
  const { compiled, payload } = buildRequestPayload();
  const normalized = parseHeadlessMatchConfig(payload);
  const overrides = normalized.promptOverrides;

  const treatedPolicy = resolveRoleCandidatePolicy(
    overrides,
    "amber",
    "cluegiver",
  );
  deepEqual(
    treatedPolicy,
    CIPHER_ENCRYPT_CANDIDATE_POLICY_ARTIFACT,
    "treated amber cluegiver receives the exact canonical policy",
  );
  equal(
    treatedPolicy?.contentHash,
    CIPHER_ENCRYPT_CANDIDATE_POLICY_ARTIFACT.contentHash,
    "treated cluegiver receives the exact canonical policy hash",
  );

  equal(
    resolveRoleCandidatePolicy(overrides, "blue", "cluegiver"),
    undefined,
    "baseline blue cluegiver receives no candidate policy",
  );
  for (const role of [
    "own_guesser",
    "interceptor",
    "own_deliberator",
    "intercept_deliberator",
    "coach",
  ] as const) {
    equal(
      resolveRoleCandidatePolicy(overrides, "amber", role),
      undefined,
      `treated team ${role} receives no candidate policy`,
    );
  }

  const compiledDirectives =
    compiled.prompts.cluegiver.taskDirectives;
  ok(compiledDirectives, "fixture has compiled cluegiver directives");
  const strategy = getPromptStrategy("advanced");
  const treatedPrompt = strategy.clueTemplate({
    keywords: ["factory", "windmill", "falcon", "harbor"],
    targetCode: [1, 2, 3],
    history: [],
    taskDirectives: compiledDirectives,
    candidatePolicy: treatedPolicy,
  });

  const directivesIndex = treatedPrompt.indexOf(compiledDirectives);
  const policyIndex = treatedPrompt.indexOf(
    CIPHER_ENCRYPT_CANDIDATE_POLICY_ARTIFACT.instruction,
  );
  const contractHeaderIndex = treatedPrompt.indexOf(
    "AUTHORITATIVE GAME ACTION AND OUTPUT CONTRACT:",
  );
  const answerIndex = treatedPrompt.indexOf(
    'Put your final answer on its own line starting with "ANSWER:"',
  );
  ok(directivesIndex >= 0, "treated prompt contains compiled directives");
  ok(policyIndex >= 0, "treated prompt contains exact policy instruction");
  ok(
    directivesIndex < policyIndex,
    "compiled directives precede candidate policy",
  );
  ok(
    policyIndex < contractHeaderIndex,
    "candidate policy precedes authoritative contract header",
  );
  ok(
    contractHeaderIndex < answerIndex,
    "template output contract remains last and authoritative",
  );

  const baselinePrompt = strategy.clueTemplate({
    keywords: ["factory", "windmill", "falcon", "harbor"],
    targetCode: [1, 2, 3],
    history: [],
    taskDirectives: compiledDirectives,
  });
  equal(
    baselinePrompt.includes(
      CIPHER_ENCRYPT_CANDIDATE_POLICY_ARTIFACT.instruction,
    ),
    false,
    "baseline prompt contains no candidate-policy text",
  );
  equal(
    baselinePrompt.includes(
      CIPHER_ENCRYPT_CANDIDATE_POLICY_ARTIFACT.contentHash,
    ),
    false,
    "baseline prompt contains no candidate-policy hash",
  );
}

async function loadFunctionBody(
  relativePath: string,
  functionName: string,
): Promise<string> {
  const absolutePath = resolve(process.cwd(), relativePath);
  const sourceText = await readFile(absolutePath, "utf8");
  const sourceFile = ts.createSourceFile(
    absolutePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  let found: ts.FunctionDeclaration | undefined;
  const visit = (node: ts.Node): void => {
    if (
      ts.isFunctionDeclaration(node) &&
      node.name?.text === functionName
    ) {
      found = node;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  ok(found, `found ${functionName} in ${relativePath}`);
  return found!.getText(sourceFile);
}

async function testCoachAndAnchorResolveExactModelDefaults(): Promise<void> {
  const coachConfigBuilder = await loadFunctionBody(
    "server/coachLoop.ts",
    "buildAIConfig",
  );
  ok(
    /getConfigForModel\(provider,\s*model\)/m.test(coachConfigBuilder),
    "coach actor config resolves through model-specific defaults",
  );

  const coachPlayers = await loadFunctionBody(
    "server/coachLoop.ts",
    "buildHeadlessPlayers",
  );
  ok(
    /baseAIConfig\s*=\s*buildAIConfig\(config\.playerProvider,\s*config\.playerModel\)/m.test(
      coachPlayers,
    ),
    "coach seats actors from the resolved model-specific config",
  );

  const coachMetaBuilder = await loadFunctionBody(
    "server/coachPrompts.ts",
    "buildCoachAIConfig",
  );
  ok(
    /getConfigForModel\(config\.coachProvider,\s*config\.coachModel\)/m.test(
      coachMetaBuilder,
    ),
    "coach meta-agent config resolves through model-specific defaults",
  );

  const anchorBuilder = await loadFunctionBody(
    "server/anchorEvaluator.ts",
    "buildAnchorMatchConfig",
  );
  ok(
    /baseAIConfig\s*=\s*getConfigForModel\(\s*input\.playerProvider,\s*input\.playerModel/m.test(
      anchorBuilder,
    ),
    "anchor actors resolve through model-specific defaults",
  );
  ok(
    /aiConfig:\s*\{\s*\.\.\.baseAIConfig\s*\}/m.test(anchorBuilder),
    "anchor seats the resolved config without replacing its defaults",
  );

  const roundRobinBuilder = await loadFunctionBody(
    "server/tournament.ts",
    "buildRoundRobinMatchConfig",
  );
  ok(
    (
      roundRobinBuilder.match(
        /getConfigForModel\((?:amber|blue)\.provider,\s*(?:amber|blue)\.model\)/g,
      ) ?? []
    ).length === 2,
    "both round-robin sides resolve their exact model-specific defaults",
  );
  ok(
    !/timeoutMs:\s*14400000|reasoningEffort:\s*"high"/m.test(
      roundRobinBuilder,
    ),
    "round-robin generation has no silent four-hour/high override",
  );

  const wireReasoning = await loadFunctionBody(
    "server/ai.ts",
    "openRouterReasoningEffort",
  );
  ok(
    /config\.model\s*===\s*DEEPSEEK_V4_FLASH_0731[\s\S]*?config\.reasoningEffort\s*===\s*"xhigh"/m.test(
      wireReasoning,
    ),
    "wire reasoning maps the exact dated model's xhigh setting explicitly",
  );
  ok(
    /return\s+"max"/m.test(wireReasoning),
    "the exact dated model's xhigh setting becomes OpenRouter wire max",
  );
}

async function main(): Promise<void> {
  assertExactModelDefaults(
    getDefaultConfigForProvider("openrouter"),
    "OpenRouter provider default",
  );
  await testExactCompiledTreatmentSurvives();
  await testSeatedActorUsesExactModelDefaults();
  await testMalformedArtifactsFailClosed();
  await testCandidatePolicyAuthorityIsolation();
  await testCoachAndAnchorResolveExactModelDefaults();

  console.log(
    `Headless seating offline checks passed (${assertions} assertions).`,
  );
}

main().catch((error) => {
  console.error("Headless seating offline checks failed:");
  console.error(error);
  process.exitCode = 1;
});
