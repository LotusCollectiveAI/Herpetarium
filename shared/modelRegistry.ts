import type { AIPlayerConfig, AIProvider } from "./schema";

export type ReasoningMode =
  | "none"
  | "openai_reasoning_effort"
  | "anthropic_thinking"
  | "gemini_thinking"
  | "openrouter_reasoning";

export interface ModelSpec {
  key: string;
  provider: AIProvider;
  model: string;
  displayName: string;
  optionLabel?: string;
  costPer1K?: { input: number; output: number };
  reasoningMode: ReasoningMode;
  supportsTemperature: boolean;
  defaults: Pick<AIPlayerConfig, "timeoutMs" | "promptStrategy" | "reasoningEffort"> & {
    temperature?: number;
  };
  thinkingBudgetByEffort?: Partial<Record<AIPlayerConfig["reasoningEffort"], number>>;
  tags?: string[];
  deprecated?: boolean;
  experimental?: boolean;
}

type ProviderModelLike = Pick<AIPlayerConfig, "provider" | "model">;
type ModelOption = { value: string; label: string; isReasoning?: boolean };

const DEFAULT_MODEL_DEFAULTS: ModelSpec["defaults"] = {
  timeoutMs: 120000,
  temperature: 0.7,
  promptStrategy: "default",
  reasoningEffort: "high",
};

const ANTHROPIC_THINKING_BUDGET: NonNullable<ModelSpec["thinkingBudgetByEffort"]> = {
  low: 5000,
  medium: 15000,
  high: 30000,
  xhigh: 50000,
};

const GEMINI_THINKING_BUDGET: NonNullable<ModelSpec["thinkingBudgetByEffort"]> = {
  low: 5000,
  medium: 15000,
  high: 32000,
  xhigh: 50000,
};

function createSpec(spec: Omit<ModelSpec, "key" | "defaults"> & { defaults?: Partial<ModelSpec["defaults"]> }): ModelSpec {
  return {
    ...spec,
    key: `${spec.provider}:${spec.model}`,
    defaults: {
      ...DEFAULT_MODEL_DEFAULTS,
      ...spec.defaults,
    },
  };
}

const MODEL_SPECS = [
  createSpec({
    provider: "chatgpt",
    model: "gpt-5.4",
    displayName: "GPT-5.4",
    costPer1K: { input: 0.0025, output: 0.015 },
    reasoningMode: "openai_reasoning_effort",
    supportsTemperature: false,
    tags: ["ui", "default", "tournament2"],
  }),
  createSpec({
    provider: "chatgpt",
    model: "gpt-5.4-mini",
    displayName: "GPT-5.4 Mini",
    costPer1K: { input: 0.0004, output: 0.0016 },
    reasoningMode: "openai_reasoning_effort",
    supportsTemperature: false,
    tags: ["ui"],
  }),
  createSpec({
    provider: "chatgpt",
    model: "codex-5.3",
    displayName: "Codex 5.3",
    costPer1K: { input: 0.003, output: 0.015 },
    reasoningMode: "openai_reasoning_effort",
    supportsTemperature: false,
    tags: ["ui"],
  }),
  createSpec({
    provider: "chatgpt",
    model: "o3",
    displayName: "o3",
    optionLabel: "o3 (Reasoning)",
    costPer1K: { input: 0.002, output: 0.008 },
    reasoningMode: "openai_reasoning_effort",
    supportsTemperature: false,
    tags: ["ui", "ui_reasoning", "combined_prompt"],
  }),
  createSpec({
    provider: "chatgpt",
    model: "o4-mini",
    displayName: "o4-mini",
    optionLabel: "o4-mini (Reasoning)",
    costPer1K: { input: 0.0011, output: 0.0044 },
    reasoningMode: "openai_reasoning_effort",
    supportsTemperature: false,
    tags: ["ui", "ui_reasoning", "combined_prompt"],
  }),
  createSpec({
    provider: "chatgpt",
    model: "gpt-4o",
    displayName: "GPT-4o",
    costPer1K: { input: 0.0025, output: 0.01 },
    reasoningMode: "none",
    supportsTemperature: true,
    tags: ["legacy"],
  }),
  createSpec({
    provider: "chatgpt",
    model: "gpt-4o-mini",
    displayName: "GPT-4o Mini",
    costPer1K: { input: 0.00015, output: 0.0006 },
    reasoningMode: "none",
    supportsTemperature: true,
    tags: ["legacy"],
  }),
  createSpec({
    provider: "chatgpt",
    model: "o1",
    displayName: "o1",
    costPer1K: { input: 0.015, output: 0.06 },
    reasoningMode: "openai_reasoning_effort",
    supportsTemperature: false,
    tags: ["legacy", "ui_reasoning", "combined_prompt"],
    deprecated: true,
  }),
  createSpec({
    provider: "chatgpt",
    model: "o3-mini",
    displayName: "o3-mini",
    costPer1K: { input: 0.0011, output: 0.0044 },
    reasoningMode: "openai_reasoning_effort",
    supportsTemperature: false,
    tags: ["legacy", "ui_reasoning", "combined_prompt"],
    deprecated: true,
  }),

  createSpec({
    provider: "claude",
    model: "claude-opus-4-6",
    displayName: "Claude Opus 4.6",
    costPer1K: { input: 0.005, output: 0.025 },
    reasoningMode: "anthropic_thinking",
    supportsTemperature: false,
    thinkingBudgetByEffort: ANTHROPIC_THINKING_BUDGET,
    tags: ["ui", "tournament2"],
  }),
  createSpec({
    provider: "claude",
    model: "claude-sonnet-4-6",
    displayName: "Claude Sonnet 4.6",
    costPer1K: { input: 0.003, output: 0.015 },
    reasoningMode: "anthropic_thinking",
    supportsTemperature: false,
    thinkingBudgetByEffort: ANTHROPIC_THINKING_BUDGET,
    tags: ["ui", "default"],
  }),
  createSpec({
    provider: "claude",
    model: "claude-sonnet-4-20250514",
    displayName: "Claude Sonnet 4",
    costPer1K: { input: 0.003, output: 0.015 },
    reasoningMode: "anthropic_thinking",
    supportsTemperature: false,
    thinkingBudgetByEffort: ANTHROPIC_THINKING_BUDGET,
    tags: ["ui"],
  }),
  createSpec({
    provider: "claude",
    model: "claude-haiku-4-5-20251001",
    displayName: "Claude Haiku 4.5",
    costPer1K: { input: 0.001, output: 0.005 },
    reasoningMode: "anthropic_thinking",
    supportsTemperature: false,
    thinkingBudgetByEffort: ANTHROPIC_THINKING_BUDGET,
    tags: ["ui"],
  }),
  createSpec({
    provider: "claude",
    model: "claude-opus-4-20250514",
    displayName: "Claude Opus 4",
    costPer1K: { input: 0.015, output: 0.075 },
    reasoningMode: "anthropic_thinking",
    supportsTemperature: false,
    thinkingBudgetByEffort: ANTHROPIC_THINKING_BUDGET,
    tags: ["legacy"],
    deprecated: true,
  }),
  createSpec({
    provider: "claude",
    model: "claude-haiku-4-20250414",
    displayName: "Claude Haiku 4",
    costPer1K: { input: 0.0008, output: 0.004 },
    reasoningMode: "anthropic_thinking",
    supportsTemperature: false,
    thinkingBudgetByEffort: ANTHROPIC_THINKING_BUDGET,
    tags: ["legacy"],
    deprecated: true,
  }),
  createSpec({
    provider: "claude",
    model: "claude-3-5-sonnet-20241022",
    displayName: "Claude 3.5 Sonnet",
    costPer1K: { input: 0.003, output: 0.015 },
    reasoningMode: "anthropic_thinking",
    supportsTemperature: false,
    thinkingBudgetByEffort: ANTHROPIC_THINKING_BUDGET,
    tags: ["legacy"],
    deprecated: true,
  }),

  createSpec({
    provider: "gemini",
    model: "gemini-3.1-pro-preview",
    displayName: "Gemini 3.1 Pro",
    costPer1K: { input: 0.002, output: 0.012 },
    reasoningMode: "gemini_thinking",
    supportsTemperature: false,
    thinkingBudgetByEffort: GEMINI_THINKING_BUDGET,
    tags: ["ui", "default", "tournament2"],
  }),
  createSpec({
    provider: "gemini",
    model: "gemini-3.1-flash-lite-preview",
    displayName: "Gemini 3.1 Flash Lite",
    costPer1K: { input: 0.00025, output: 0.0015 },
    reasoningMode: "none",
    supportsTemperature: false,
    tags: ["ui"],
  }),
  createSpec({
    provider: "gemini",
    model: "gemini-2.5-pro",
    displayName: "Gemini 2.5 Pro",
    optionLabel: "Gemini 2.5 Pro (Thinking)",
    costPer1K: { input: 0.0035, output: 0.021 },
    reasoningMode: "gemini_thinking",
    supportsTemperature: false,
    thinkingBudgetByEffort: GEMINI_THINKING_BUDGET,
    tags: ["ui", "ui_reasoning"],
  }),
  createSpec({
    provider: "gemini",
    model: "gemini-2.5-flash",
    displayName: "Gemini 2.5 Flash",
    optionLabel: "Gemini 2.5 Flash (Thinking)",
    costPer1K: { input: 0.0003, output: 0.0025 },
    reasoningMode: "gemini_thinking",
    supportsTemperature: false,
    thinkingBudgetByEffort: GEMINI_THINKING_BUDGET,
    tags: ["ui", "ui_reasoning"],
  }),
  createSpec({
    provider: "gemini",
    model: "gemini-2.0-flash",
    displayName: "Gemini 2.0 Flash",
    costPer1K: { input: 0.0001, output: 0.0004 },
    reasoningMode: "none",
    supportsTemperature: false,
    tags: ["legacy"],
  }),
  createSpec({
    provider: "gemini",
    model: "gemini-2.0-flash-001",
    displayName: "Gemini 2.0 Flash 001",
    costPer1K: { input: 0.0001, output: 0.0004 },
    reasoningMode: "none",
    supportsTemperature: false,
    tags: ["legacy"],
  }),

  createSpec({
    provider: "openrouter",
    model: "deepseek/deepseek-v3.2",
    displayName: "DeepSeek V3.2",
    costPer1K: { input: 0.00026, output: 0.00038 },
    reasoningMode: "none",
    supportsTemperature: true,
    tags: ["ui", "default", "tournament2"],
  }),
  createSpec({
    provider: "openrouter",
    model: "deepseek-ai/deepseek-reasoner",
    displayName: "DeepSeek Reasoner",
    costPer1K: { input: 0.00055, output: 0.00219 },
    reasoningMode: "openrouter_reasoning",
    supportsTemperature: false,
    tags: ["ui", "ui_reasoning", "combined_prompt"],
  }),
  createSpec({
    provider: "openrouter",
    model: "x-ai/grok-4.20-beta",
    displayName: "Grok 4.20 Beta",
    costPer1K: { input: 0.002, output: 0.006 },
    reasoningMode: "none",
    supportsTemperature: true,
    tags: ["ui", "tournament2"],
  }),
  createSpec({
    provider: "openrouter",
    model: "qwen/qwen3.6-plus-preview",
    displayName: "Qwen 3.6 Plus",
    costPer1K: { input: 0.0005, output: 0.002 },
    reasoningMode: "none",
    supportsTemperature: true,
    tags: ["ui", "tournament2"],
  }),
  createSpec({
    provider: "openrouter",
    model: "qwen/qwen3-max-thinking",
    displayName: "Qwen 3 Max",
    optionLabel: "Qwen 3 Max (Thinking)",
    costPer1K: { input: 0.00039, output: 0.00234 },
    reasoningMode: "openrouter_reasoning",
    supportsTemperature: false,
    tags: ["ui", "ui_reasoning", "combined_prompt"],
  }),
  createSpec({
    provider: "openrouter",
    model: "meta-llama/llama-4-maverick",
    displayName: "Llama 4 Maverick",
    costPer1K: { input: 0.0005, output: 0.0015 },
    reasoningMode: "none",
    supportsTemperature: true,
    tags: ["ui"],
  }),
  createSpec({
    provider: "openrouter",
    model: "moonshotai/kimi-k2.5",
    displayName: "Kimi K2.5",
    optionLabel: "Kimi K2.5 (Reasoning)",
    costPer1K: { input: 0.0006, output: 0.002 },
    reasoningMode: "none",
    supportsTemperature: true,
    tags: ["ui", "tournament2"],
  }),
  createSpec({
    provider: "openrouter",
    model: "deepseek/deepseek-r1",
    displayName: "DeepSeek R1",
    costPer1K: { input: 0.00055, output: 0.00219 },
    reasoningMode: "openrouter_reasoning",
    supportsTemperature: false,
    tags: ["legacy", "ui_reasoning", "combined_prompt"],
    deprecated: true,
  }),
  createSpec({
    provider: "openrouter",
    model: "x-ai/grok-3-beta",
    displayName: "Grok 3 Beta",
    costPer1K: { input: 0.003, output: 0.015 },
    reasoningMode: "none",
    supportsTemperature: true,
    tags: ["legacy"],
    deprecated: true,
  }),
  createSpec({
    provider: "openrouter",
    model: "mistralai/mistral-large-latest",
    displayName: "Mistral Large",
    costPer1K: { input: 0.002, output: 0.006 },
    reasoningMode: "none",
    supportsTemperature: true,
    tags: ["legacy"],
    deprecated: true,
  }),
  createSpec({
    provider: "openrouter",
    model: "qwen/qwen-2.5-72b-instruct",
    displayName: "Qwen 2.5 72B Instruct",
    costPer1K: { input: 0.0006, output: 0.0018 },
    reasoningMode: "none",
    supportsTemperature: true,
    tags: ["legacy"],
    deprecated: true,
  }),
] satisfies ReadonlyArray<ModelSpec>;

export const MODEL_REGISTRY: Record<string, ModelSpec> = Object.fromEntries(
  MODEL_SPECS.map((spec) => [spec.key, spec]),
) as Record<string, ModelSpec>;

function hasTag(spec: ModelSpec, tag: string): boolean {
  return spec.tags?.includes(tag) ?? false;
}

export function getModelKey(provider: AIProvider, model: string): string;
export function getModelKey(config: ProviderModelLike): string;
export function getModelKey(
  providerOrConfig: AIProvider | ProviderModelLike,
  model?: string,
): string {
  if (typeof providerOrConfig === "string") {
    return `${providerOrConfig}:${model ?? ""}`;
  }
  return `${providerOrConfig.provider}:${providerOrConfig.model}`;
}

export function getModelEntry(provider: AIProvider, model: string): ModelSpec | undefined;
export function getModelEntry(config: ProviderModelLike): ModelSpec | undefined;
export function getModelEntry(
  providerOrConfig: AIProvider | ProviderModelLike,
  model?: string,
): ModelSpec | undefined {
  const key = typeof providerOrConfig === "string"
    ? getModelKey(providerOrConfig, model ?? "")
    : getModelKey(providerOrConfig);
  return MODEL_REGISTRY[key];
}

export function getProviderModels(provider: AIProvider): ModelSpec[] {
  return MODEL_SPECS.filter((spec) => spec.provider === provider);
}

export function getDefaultConfigForProvider(provider: AIProvider): AIPlayerConfig {
  const defaultEntry = getProviderModels(provider).find((spec) => hasTag(spec, "default"));
  const fallbackEntry = defaultEntry ?? getProviderModels(provider)[0];
  if (!fallbackEntry) {
    throw new Error(`No default model registered for provider "${provider}"`);
  }

  return {
    provider,
    model: fallbackEntry.model,
    ...fallbackEntry.defaults,
  };
}

export function getAllModelOptions(): Record<AIProvider, ModelOption[]> {
  const options: Record<AIProvider, ModelOption[]> = {
    chatgpt: [],
    claude: [],
    gemini: [],
    openrouter: [],
  };

  for (const spec of MODEL_SPECS) {
    if (!hasTag(spec, "ui") || spec.deprecated) continue;
    options[spec.provider].push({
      value: spec.model,
      label: spec.optionLabel ?? spec.displayName,
      isReasoning: hasTag(spec, "ui_reasoning") || undefined,
    });
  }

  return options;
}

export function getModelCost(provider: AIProvider, model: string): ModelSpec["costPer1K"] | undefined;
export function getModelCost(config: ProviderModelLike): ModelSpec["costPer1K"] | undefined;
export function getModelCost(
  providerOrConfig: AIProvider | ProviderModelLike,
  model?: string,
): ModelSpec["costPer1K"] | undefined {
  if (typeof providerOrConfig === "string") {
    return model ? getModelEntry(providerOrConfig, model)?.costPer1K : undefined;
  }
  return getModelEntry(providerOrConfig)?.costPer1K;
}

export const MODEL_OPTIONS = getAllModelOptions();
