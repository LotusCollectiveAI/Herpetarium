import type { AIPlayerConfig, HeadlessMatchConfig } from "@shared/schema";
import {
  getConfigForModel,
  getDefaultConfigForProvider,
  getModelEntry,
  getModelKey,
} from "@shared/modelRegistry";
import { callAI } from "./ai";

const VALIDATION_SYSTEM_PROMPT = "You are a model validation check. Reply with OK.";
const VALIDATION_USER_PROMPT = "Reply with OK";
const VALIDATION_MAX_TOKENS = 50;

export interface ValidatedModel {
  key: string;
  provider: AIPlayerConfig["provider"];
  model: string;
  displayName: string;
  responseText?: string;
  providerMetadata?: Record<string, unknown>;
}

export interface FailedModelValidation {
  key: string;
  provider: AIPlayerConfig["provider"];
  model: string;
  displayName: string;
  reason: string;
}

export interface ModelValidationReport {
  ok: boolean;
  totalModels: number;
  passed: ValidatedModel[];
  failed: FailedModelValidation[];
}

function resolvePlayerConfig(player: HeadlessMatchConfig["players"][number]): AIPlayerConfig {
  const providerDefaults = getDefaultConfigForProvider(player.aiProvider);
  const model = player.aiConfig?.model ?? providerDefaults.model;
  const defaults = getConfigForModel(player.aiProvider, model);
  return {
    ...defaults,
    ...(player.aiConfig ?? {}),
    provider: player.aiProvider,
    model,
  };
}

export function extractUniqueModelConfigs(matchConfigs: HeadlessMatchConfig[]): AIPlayerConfig[] {
  const uniqueConfigs = new Map<string, AIPlayerConfig>();

  for (const matchConfig of matchConfigs) {
    for (const player of matchConfig.players) {
      const config = resolvePlayerConfig(player);
      const key = getModelKey(config);
      if (!uniqueConfigs.has(key)) {
        uniqueConfigs.set(key, config);
      }
    }
  }

  return Array.from(uniqueConfigs.values());
}

async function validateModel(config: AIPlayerConfig): Promise<ValidatedModel | FailedModelValidation> {
  const entry = getModelEntry(config);
  const displayName = entry?.displayName ?? config.model;
  const key = getModelKey(config);

  if (!entry) {
    return {
      key,
      provider: config.provider,
      model: config.model,
      displayName,
      reason: "Model is not registered in MODEL_REGISTRY",
    };
  }

  try {
    const response = await callAI(
      {
        ...config,
        promptStrategy: "default",
      },
      VALIDATION_SYSTEM_PROMPT,
      VALIDATION_USER_PROMPT,
      {
        maxTokens: VALIDATION_MAX_TOKENS,
        disableReasoning: true,
        strictExecution: true,
      },
    );

    const responseText = response.text.trim();
    if (!responseText) {
      return {
        key,
        provider: config.provider,
        model: config.model,
        displayName,
        reason: "Model returned an empty response to the validation prompt",
      };
    }

    return {
      key,
      provider: config.provider,
      model: config.model,
      displayName,
      responseText: responseText.slice(0, 80),
      providerMetadata: response.providerMetadata,
    };
  } catch (error) {
    return {
      key,
      provider: config.provider,
      model: config.model,
      displayName,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function validateModels(matchConfigs: HeadlessMatchConfig[]): Promise<ModelValidationReport> {
  const uniqueConfigs = extractUniqueModelConfigs(matchConfigs);
  const results = await Promise.all(uniqueConfigs.map((config) => validateModel(config)));

  const passed = results.filter((result): result is ValidatedModel => !("reason" in result));
  const failed = results.filter((result): result is FailedModelValidation => "reason" in result);

  return {
    ok: failed.length === 0,
    totalModels: uniqueConfigs.length,
    passed,
    failed,
  };
}
