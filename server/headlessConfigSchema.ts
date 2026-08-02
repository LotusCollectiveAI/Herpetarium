/**
 * Side-effect-free request schemas for headless research execution.
 *
 * Keep these outside routes.ts so HTTP/tournament seating can be verified
 * offline without importing the database, starting Express, or resuming jobs.
 */

import { z } from "zod";
import {
  gameRulesSchema,
  normalizeHeadlessMatchConfig,
  type HeadlessMatchConfig,
  type PromptRole,
} from "@shared/schema";
import { getConfigForModel } from "@shared/modelRegistry";
import { CIPHER_ENCRYPT_CANDIDATE_POLICY_ARTIFACT } from "@shared/substrate";

const aiProviderSchema = z.enum([
  "chatgpt",
  "claude",
  "gemini",
  "openrouter",
]);
const teamSchema = z.enum(["amber", "blue"]);
const promptRoleSchema = z.enum([
  "cluegiver",
  "own_guesser",
  "interceptor",
  "own_deliberator",
  "intercept_deliberator",
  "coach",
]);

const MAX_SYSTEM_PROMPT_CHARS = 24_000;
const MAX_TASK_DIRECTIVE_CHARS = 12_000;
const MAX_COMPILED_PROMPT_CHARS =
  MAX_SYSTEM_PROMPT_CHARS + MAX_TASK_DIRECTIVE_CHARS;

const hashSchema = z
  .string()
  .regex(
    /^(?:[a-f0-9]{8}|[a-f0-9]{64})$/i,
    "Expected an 8-character legacy hash or 64-character SHA-256 hash",
  );

function compiledPromptArtifactSchemaFor(role: PromptRole) {
  return z
    .object({
      role: z.literal(role),
      systemPrompt: z
        .string()
        .min(1)
        .max(MAX_SYSTEM_PROMPT_CHARS),
      taskDirectives: z
        .string()
        .min(1)
        .max(MAX_TASK_DIRECTIVE_CHARS)
        .nullable(),
      tokenEstimate: z.number().int().min(1).max(100_000),
      charCount: z
        .number()
        .int()
        .min(1)
        .max(MAX_COMPILED_PROMPT_CHARS),
    })
    .strict()
    .superRefine((artifact, context) => {
      const expectedCharCount =
        artifact.systemPrompt.length +
        (artifact.taskDirectives?.length ?? 0);
      if (artifact.charCount !== expectedCharCount) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["charCount"],
          message: `Expected ${expectedCharCount} characters`,
        });
      }

      const expectedTokenEstimate = Math.ceil(expectedCharCount / 4);
      if (artifact.tokenEstimate !== expectedTokenEstimate) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["tokenEstimate"],
          message: `Expected token estimate ${expectedTokenEstimate}`,
        });
      }
    });
}

export const compiledGenomePromptsSchema = z
  .object({
    genomeHash: hashSchema,
    legacyGenomeHash: z.string().regex(/^[a-f0-9]{8}$/i).optional(),
    compilerVersion: z
      .string()
      .min(1)
      .max(32)
      .regex(/^[a-z0-9._+-]+$/i),
    substrateVersion: z
      .string()
      .min(1)
      .max(32)
      .regex(/^[a-z0-9._+-]+$/i)
      .optional(),
    prompts: z
      .object({
        cluegiver: compiledPromptArtifactSchemaFor("cluegiver"),
        own_guesser: compiledPromptArtifactSchemaFor("own_guesser"),
        interceptor: compiledPromptArtifactSchemaFor("interceptor"),
        own_deliberator:
          compiledPromptArtifactSchemaFor("own_deliberator"),
        intercept_deliberator:
          compiledPromptArtifactSchemaFor("intercept_deliberator"),
        coach: compiledPromptArtifactSchemaFor("coach"),
      })
      .strict(),
  })
  .strict();

const headlessTeamPromptOverridesSchema = z
  .object({
    monolithicSystemPrompt: z
      .string()
      .min(1)
      .max(MAX_SYSTEM_PROMPT_CHARS)
      .optional(),
    compiledPrompts: compiledGenomePromptsSchema.optional(),
    candidatePolicy: z
      .object({
        id: z.literal(CIPHER_ENCRYPT_CANDIDATE_POLICY_ARTIFACT.id),
        instruction: z.literal(
          CIPHER_ENCRYPT_CANDIDATE_POLICY_ARTIFACT.instruction,
        ),
        contentHash: z.literal(
          CIPHER_ENCRYPT_CANDIDATE_POLICY_ARTIFACT.contentHash,
        ),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.monolithicSystemPrompt !== undefined ||
      value.compiledPrompts !== undefined ||
      value.candidatePolicy !== undefined,
    "At least one prompt override is required",
  );

export const headlessPromptOverridesSchema = z
  .object({
    amber: headlessTeamPromptOverridesSchema.optional(),
    blue: headlessTeamPromptOverridesSchema.optional(),
  })
  .strict()
  .refine(
    (value) => value.amber !== undefined || value.blue !== undefined,
    "At least one team prompt override is required",
  );

const headlessAIConfigInputSchema = z
  .object({
    provider: aiProviderSchema.optional(),
    model: z.string().trim().min(1).max(200),
    timeoutMs: z.number().int().min(10_000).max(14_400_000).optional(),
    temperature: z.number().min(0).max(2).optional(),
    promptStrategy: z
      .enum(["default", "advanced", "k-level", "enriched"])
      .optional(),
    reasoningEffort: z
      .enum(["low", "medium", "high", "xhigh"])
      .optional(),
  })
  .strict();

const headlessPlayerSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    aiProvider: aiProviderSchema,
    team: teamSchema,
    aiConfig: headlessAIConfigInputSchema.optional(),
  })
  .strict()
  .superRefine((player, context) => {
    if (
      player.aiConfig?.provider !== undefined &&
      player.aiConfig.provider !== player.aiProvider
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["aiConfig", "provider"],
        message: "aiConfig.provider must match aiProvider",
      });
    }
  })
  .transform((player) => {
    if (!player.aiConfig) return player;

    const defaults = getConfigForModel(
      player.aiProvider,
      player.aiConfig.model,
    );
    return {
      ...player,
      aiConfig: {
        ...defaults,
        ...player.aiConfig,
        provider: player.aiProvider,
        model: player.aiConfig.model,
      },
    };
  });

const teamRosterSchema = z
  .object({
    rosterId: z.string().trim().min(1).max(200),
    label: z.string().trim().min(1).max(200),
    compositionKey: z.string().trim().min(1).max(500),
    models: z.array(z.string().trim().min(1).max(200)).min(1).max(6),
  })
  .strict();

const provenanceText = (max: number) =>
  z.string().trim().min(1).max(max);

const ablationFlagSchema = z.enum([
  "no_history",
  "no_scratch_notes",
  "no_opponent_history",
  "no_opponent_transcript",
  "no_chain_of_thought",
  "random_clues",
  "no_persona",
  "no_semantic_context",
]);

export const headlessMatchConfigSchema = z
  .object({
    players: z.array(headlessPlayerSchema).min(2).max(6),
    teamRosters: z
      .object({
        amber: teamRosterSchema,
        blue: teamRosterSchema,
      })
      .strict()
      .optional(),
    fastMode: z.boolean().optional(),
    strictExecution: z.boolean().optional(),
    ablations: z
      .object({ flags: z.array(ablationFlagSchema).min(1) })
      .strict()
      .optional(),
    enablePostMatchReflection: z.boolean().optional(),
    seed: z
      .union([z.string().min(1).max(200), z.number().int().transform(String)])
      .optional(),
    teamSize: z.union([z.literal(2), z.literal(3)]).optional(),
    gameRules: gameRulesSchema.optional(),
    experimentId: provenanceText(100).optional(),
    promptOverrides: headlessPromptOverridesSchema.optional(),
    roleSwapGroupId: provenanceText(64).optional(),
    focalTeam: teamSchema.optional(),
    matchKind: provenanceText(24).optional(),
    matchmakingBucket: provenanceText(24).optional(),
  })
  .strict();

export const tournamentConfigSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    matchConfigs: z.array(headlessMatchConfigSchema).min(1).max(10_000),
    gamesPerMatchup: z.number().int().min(1).max(100).optional(),
    budgetCapUsd: z.string().max(40).optional(),
    concurrency: z.number().int().min(1).max(20).optional(),
    delayBetweenMatchesMs: z.number().int().min(0).max(60_000).optional(),
    skipModelValidation: z.boolean().optional(),
    ablations: z
      .object({ flags: z.array(ablationFlagSchema).min(1) })
      .strict()
      .optional(),
  })
  .strict();

export function parseHeadlessMatchConfig(input: unknown): HeadlessMatchConfig {
  const parsed = headlessMatchConfigSchema.parse(input);
  return normalizeHeadlessMatchConfig(parsed as HeadlessMatchConfig);
}
