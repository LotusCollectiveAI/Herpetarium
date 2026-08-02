import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import type { AIPlayerConfig, ParseQuality, AblationFlag } from "@shared/schema";
import { getDefaultConfigForProvider, getModelCost, getModelEntry, getModelKey } from "@shared/modelRegistry";
import { getPromptStrategy, applyAblations } from "./promptStrategies";
import type { ClueTemplateParams, GuessTemplateParams, InterceptionTemplateParams } from "./promptStrategies";
import type { ModelHealthTracker } from "./modelHealth";

let openaiClient: OpenAI | null = null;
let anthropicClient: Anthropic | null = null;
let geminiClient: GoogleGenAI | null = null;

interface ProviderThrottleState {
  lastRateLimitAt: number;
  backoffMs: number;
  totalRetries: number;
  totalRateLimits: number;
}

const providerThrottleState: Record<string, ProviderThrottleState> = {};

export function getProviderThrottleState(): Record<string, ProviderThrottleState> {
  return { ...providerThrottleState };
}

export function resetProviderThrottleState() {
  for (const key of Object.keys(providerThrottleState)) {
    delete providerThrottleState[key];
  }
}

function getThrottleState(throttleKey: string): ProviderThrottleState {
  if (!providerThrottleState[throttleKey]) {
    providerThrottleState[throttleKey] = { lastRateLimitAt: 0, backoffMs: 0, totalRetries: 0, totalRateLimits: 0 };
  }
  return providerThrottleState[throttleKey];
}

function isRateLimitError(err: unknown): { isRateLimit: boolean; retryAfterMs?: number } {
  if (!err || typeof err !== "object") return { isRateLimit: false };
  const e = err as any;
  const status = e.status || e.statusCode || e.code;
  if (status === 429 || status === "429") {
    let retryAfterMs: number | undefined;
    const retryAfter = e.headers?.["retry-after"] || e.headers?.get?.("retry-after");
    if (retryAfter) {
      const seconds = parseFloat(retryAfter);
      if (!isNaN(seconds)) retryAfterMs = seconds * 1000;
    }
    return { isRateLimit: true, retryAfterMs };
  }
  const message = String(e.message || e.error || "").toLowerCase();
  if (
    message.includes("resource_exhausted") ||
    message.includes("quota") ||
    message.includes("rate limit") ||
    message.includes("too many requests") ||
    message.includes("429")
  ) {
    return { isRateLimit: true };
  }
  return { isRateLimit: false };
}

const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30000;
const ADVANCED_STRATEGIES: ReadonlyArray<AIPlayerConfig["promptStrategy"]> = ["advanced", "k-level", "enriched"];

export interface AICallOptions {
  maxTokens?: number;
  disableReasoning?: boolean;
  healthTracker?: ModelHealthTracker;
  /**
   * Research-grade execution: make a single physical provider attempt and
   * let the caller invalidate the match on any provider or parse failure.
   */
  strictExecution?: boolean;
  /** Internal, persisted in provider metadata. */
  physicalAttempt?: number;
  /** Passed through to providers that support active request cancellation. */
  signal?: AbortSignal;
  /**
   * Injected durable lifecycle recorder. The strict headless OpenRouter path
   * creates its write-ahead row before invoking this module.
   */
  providerAttemptTelemetry?: ProviderAttemptTelemetry;
}

export type ProviderAttemptTerminalStatus =
  | "succeeded"
  | "failed"
  | "timed_out";

export interface ProviderAttemptTelemetry {
  attemptId: number;
  markRequest(metadata: Record<string, unknown>): Promise<void>;
  markTerminal(input: {
    status: ProviderAttemptTerminalStatus;
    metadata: Record<string, unknown>;
    error?: string | null;
  }): Promise<void>;
}

async function callAIWithBackoff(
  config: AIPlayerConfig,
  systemPrompt: string,
  userPrompt: string,
  options: AICallOptions = {},
): Promise<RawAIResponse> {
  const modelKey = getModelKey(config.provider, config.model);
  const state = getThrottleState(modelKey);
  const healthTracker = options.healthTracker;

  if (healthTracker && !healthTracker.isAvailable(modelKey)) {
    const modelStatus = healthTracker.getStatus(modelKey);
    const pausedUntil = modelStatus.pausedUntil ? ` until ${new Date(modelStatus.pausedUntil).toISOString()}` : "";
    throw new Error(`Model ${modelKey} is currently ${modelStatus.state}${pausedUntil}`);
  }

  if (state.backoffMs > 0) {
    const elapsed = Date.now() - state.lastRateLimitAt;
    const remaining = state.backoffMs - elapsed;
    if (remaining > 0) {
      await new Promise(resolve => setTimeout(resolve, remaining));
    }
  }

  const maxRetries = options.strictExecution ? 0 : MAX_RETRIES;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await callAIRaw(config, systemPrompt, userPrompt, {
        ...options,
        physicalAttempt: attempt + 1,
      });
      if (healthTracker) {
        healthTracker.recordSuccess(modelKey);
      }
      if (state.backoffMs > 0) {
        state.backoffMs = Math.max(0, state.backoffMs * 0.5);
      }
      return result;
    } catch (err) {
      const { isRateLimit, retryAfterMs } = isRateLimitError(err);
      if (isRateLimit && attempt < maxRetries) {
        state.totalRateLimits++;
        state.totalRetries++;
        state.lastRateLimitAt = Date.now();

        const jitter = Math.random() * 500;
        const backoff = retryAfterMs || Math.min(BASE_BACKOFF_MS * Math.pow(2, attempt) + jitter, MAX_BACKOFF_MS);
        state.backoffMs = backoff;

        console.warn(`[ai-backoff] ${config.provider}/${config.model} rate limited (attempt ${attempt + 1}/${maxRetries}), waiting ${Math.round(backoff)}ms`);
        await new Promise(resolve => setTimeout(resolve, backoff));
        continue;
      }
      if (healthTracker) {
        healthTracker.recordFailure(modelKey, err);
      }
      throw err;
    }
  }
  const error = new Error("Max retries exceeded");
  if (healthTracker) {
    healthTracker.recordFailure(modelKey, error);
  }
  throw error;
}

function getOpenAI(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || process.env.OPENAI_BASE_URL,
      timeout: 4 * 60 * 60 * 1000, // 4 hours — let models think as long as they need
      // Retry policy is centralized in callAIWithBackoff so strict execution
      // can guarantee one physical provider attempt.
      maxRetries: 0,
    });
  }
  return openaiClient;
}

function getAnthropic(): Anthropic {
  if (!anthropicClient) {
    anthropicClient = new Anthropic({
      apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY,
      baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
      timeout: 4 * 60 * 60 * 1000, // 4 hours — let models think as long as they need
      maxRetries: 0,
    });
  }
  return anthropicClient;
}

function getGemini(): GoogleGenAI {
  if (!geminiClient) {
    geminiClient = new GoogleGenAI({
      apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY,
    });
  }
  return geminiClient;
}

function modelHasTag(config: AIPlayerConfig, tag: string): boolean {
  return getModelEntry(config)?.tags?.includes(tag) ?? false;
}

function getReasoningMode(config: AIPlayerConfig) {
  return getModelEntry(config)?.reasoningMode ?? "none";
}

function getThinkingBudget(config: AIPlayerConfig, fallback: number): number {
  return getModelEntry(config)?.thinkingBudgetByEffort?.[config.reasoningEffort || "high"] ?? fallback;
}

export interface AICallResult<T> {
  result: T;
  prompt: string;
  rawResponse: string;
  model: string;
  latencyMs: number;
  error?: string;
  reasoningTrace?: string;
  parseQuality?: ParseQuality;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  estimatedCostUsd?: string;
  providerMetadata?: Record<string, unknown>;
}

export function estimateCost(config: Pick<AIPlayerConfig, "provider" | "model">, promptTokens?: number, completionTokens?: number): string | undefined;
export function estimateCost(provider: AIPlayerConfig["provider"], model: string, promptTokens?: number, completionTokens?: number): string | undefined;
export function estimateCost(
  configOrProvider: Pick<AIPlayerConfig, "provider" | "model"> | AIPlayerConfig["provider"],
  modelOrPromptTokens?: string | number,
  promptTokensArg?: number,
  completionTokensArg?: number,
): string | undefined {
  const provider = typeof configOrProvider === "string" ? configOrProvider : configOrProvider.provider;
  const model = typeof configOrProvider === "string" ? modelOrPromptTokens as string : configOrProvider.model;
  const promptTokens = typeof configOrProvider === "string" ? promptTokensArg : modelOrPromptTokens as number | undefined;
  const completionTokens = typeof configOrProvider === "string" ? completionTokensArg : promptTokensArg;

  if (!promptTokens && !completionTokens) return undefined;
  const costs = getModelCost(provider, model);
  if (!costs) return undefined;
  const inputCost = ((promptTokens || 0) / 1000) * costs.input;
  const outputCost = ((completionTokens || 0) / 1000) * costs.output;
  const total = inputCost + outputCost;
  return total.toFixed(6);
}

export interface RawAIResponse {
  text: string;
  reasoningTrace?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  providerMetadata?: Record<string, unknown>;
}

/**
 * Return the provider response that was received before an exact-route
 * validation error was raised.
 *
 * A route/model/upstream/finish mismatch makes a strict research call invalid,
 * but it does not make the already-received assistant text disappear. Keeping
 * this receipt on the error lets the experiment runner persist the exact
 * visible response and usage without treating it as a valid draw.
 */
export function providerResponseReceiptFromError(
  error: unknown,
): RawAIResponse | undefined {
  if (!error || typeof error !== "object") return undefined;
  const receipt = (error as { providerResponseReceipt?: unknown })
    .providerResponseReceipt;
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) {
    return undefined;
  }
  const candidate = receipt as Partial<RawAIResponse>;
  return typeof candidate.text === "string"
    ? (candidate as RawAIResponse)
    : undefined;
}

async function callOpenAI(
  config: AIPlayerConfig,
  systemPrompt: string,
  userPrompt: string,
  options: AICallOptions = {},
): Promise<RawAIResponse> {
  const reasoningMode = getReasoningMode(config);
  const usesCombinedPrompt = modelHasTag(config, "combined_prompt");
  const isModernOpenAIModel = getModelEntry(config)?.supportsTemperature === false;

  if (reasoningMode === "openai_reasoning_effort" && usesCombinedPrompt) {
    const response = await getOpenAI().chat.completions.create({
      model: config.model,
      messages: [
        { role: "user", content: `${systemPrompt}\n\n${userPrompt}` },
      ],
      max_completion_tokens: options.maxTokens ?? 100000,
      reasoning_effort: options.disableReasoning ? "low" : (config.reasoningEffort || "high"),
    } as any);

    const choice = response.choices[0];
    const text = choice?.message?.content || "";
    let reasoningTrace: string | undefined;

    const msg = choice?.message as any;
    if (msg?.reasoning_content) {
      reasoningTrace = msg.reasoning_content;
    } else if (msg?.reasoning) {
      // Some models return reasoning in a different field
      reasoningTrace = typeof msg.reasoning === 'string' ? msg.reasoning : JSON.stringify(msg.reasoning);
    }

    const usage = response.usage;
    return {
      text,
      reasoningTrace,
      promptTokens: usage?.prompt_tokens,
      completionTokens: usage?.completion_tokens,
      totalTokens: usage?.total_tokens,
    };
  }

  const completionParams: Record<string, any> = {
    model: config.model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  };

  if (isModernOpenAIModel) {
    completionParams.max_completion_tokens = options.maxTokens ?? 16384;
    if (!options.disableReasoning && reasoningMode === "openai_reasoning_effort" && ADVANCED_STRATEGIES.includes(config.promptStrategy)) {
      completionParams.reasoning_effort = config.reasoningEffort || "high";
      completionParams.max_completion_tokens = options.maxTokens ?? 100000;
    }
  } else {
    if (getModelEntry(config)?.supportsTemperature !== false) {
      completionParams.temperature = config.temperature ?? getModelEntry(config)?.defaults.temperature ?? 0.7;
    }
    completionParams.max_tokens = options.maxTokens ?? 4096;
  }

  const response = await getOpenAI().chat.completions.create(completionParams as any);

  // Extract reasoning token count from usage details
  const usage = response.usage;
  const usageAny = usage as any;
  const reasoningTokens = usageAny?.completion_tokens_details?.reasoning_tokens;

  return {
    text: response.choices[0]?.message?.content || "",
    reasoningTrace: reasoningTokens ? `[GPT internal reasoning: ${reasoningTokens} tokens]` : undefined,
    promptTokens: usage?.prompt_tokens,
    completionTokens: usage?.completion_tokens,
    totalTokens: usage?.total_tokens,
  };
}

async function callAnthropic(
  config: AIPlayerConfig,
  systemPrompt: string,
  userPrompt: string,
  options: AICallOptions = {},
): Promise<RawAIResponse> {
  const canUseThinking = getReasoningMode(config) === "anthropic_thinking";
  const useThinking = canUseThinking && !options.disableReasoning && ADVANCED_STRATEGIES.includes(config.promptStrategy);

  if (useThinking) {
    try {
      const maxTokens = options.maxTokens ? Math.max(options.maxTokens, 2048) : 64000;
      const budgetTokens = Math.min(getThinkingBudget(config, 30000), maxTokens - 1);
      // Use streaming to avoid timeout on long thinking operations
      const stream = getAnthropic().messages.stream({
        model: config.model,
        max_tokens: maxTokens,
        thinking: {
          type: "enabled",
          budget_tokens: budgetTokens,
        },
        temperature: 1, // Required for extended thinking
        messages: [{ role: "user", content: `${systemPrompt}\n\n${userPrompt}` }],
      } as any);

      const response = await stream.finalMessage();

      let text = "";
      let reasoningTrace: string | undefined;

      for (const block of response.content) {
        if (block.type === "thinking") {
          reasoningTrace = (block as any).thinking;
        } else if (block.type === "text") {
          text = block.text;
        }
      }

      return {
        text,
        reasoningTrace,
        promptTokens: response.usage?.input_tokens,
        completionTokens: response.usage?.output_tokens,
        totalTokens: (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0) || undefined,
      };
    } catch (err) {
      if (options.strictExecution) {
        throw err;
      }
      console.error("[AI] Extended thinking failed, falling back to standard:", err instanceof Error ? err.message : err);
    }
  }

  const response = await getAnthropic().messages.create({
    model: config.model,
    max_tokens: options.maxTokens ?? 8192,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const content = response.content[0];
  return {
    text: content.type === "text" ? content.text : "",
    promptTokens: response.usage?.input_tokens,
    completionTokens: response.usage?.output_tokens,
    totalTokens: (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0) || undefined,
  };
}

interface GeminiUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
}

interface GeminiContentPart {
  thought?: boolean;
  text?: string;
}

interface GeminiResponseExtended {
  text?: string;
  candidates?: Array<{
    content?: {
      parts?: GeminiContentPart[];
    };
  }>;
  usageMetadata?: GeminiUsageMetadata;
}

function extractGeminiUsage(response: GeminiResponseExtended): Pick<RawAIResponse, 'promptTokens' | 'completionTokens' | 'totalTokens'> {
  const usage = response.usageMetadata;
  return {
    promptTokens: usage?.promptTokenCount,
    completionTokens: usage?.candidatesTokenCount,
    totalTokens: usage?.totalTokenCount,
  };
}

async function callGemini(
  config: AIPlayerConfig,
  systemPrompt: string,
  userPrompt: string,
  options: AICallOptions = {},
): Promise<RawAIResponse> {
  const useThinking = getReasoningMode(config) === "gemini_thinking" && !options.disableReasoning;
  const requestConfig: Record<string, unknown> = {};

  if (options.maxTokens !== undefined) {
    requestConfig.maxOutputTokens = options.maxTokens;
  }

  if (useThinking) {
    requestConfig.thinkingConfig = {
      thinkingBudget: getThinkingBudget(config, 32000),
    };

    const response = await getGemini().models.generateContent({
      model: config.model,
      contents: `${systemPrompt}\n\n${userPrompt}`,
      config: requestConfig,
    } as Parameters<ReturnType<typeof getGemini>['models']['generateContent']>[0]);

    const extResp = response as unknown as GeminiResponseExtended;
    let text = "";
    let reasoningTrace: string | undefined;

    if (extResp.candidates?.[0]?.content?.parts) {
      for (const part of extResp.candidates[0].content.parts) {
        if (part.thought) {
          reasoningTrace = part.text;
        } else if (part.text) {
          text = part.text;
        }
      }
    }

    if (!text) {
      text = response.text || "";
    }

    return {
      text,
      reasoningTrace,
      ...extractGeminiUsage(extResp),
    };
  }

  const response = await getGemini().models.generateContent({
    model: config.model,
    contents: `${systemPrompt}\n\n${userPrompt}`,
    ...(Object.keys(requestConfig).length > 0 ? { config: requestConfig } : {}),
  });

  const extResp = response as unknown as GeminiResponseExtended;
  return {
    text: response.text || "",
    ...extractGeminiUsage(extResp),
  };
}

const DEEPSEEK_V4_FLASH_0731 = "deepseek/deepseek-v4-flash-0731";
const DEEPSEEK_V4_FLASH_0731_UPSTREAM_SLUG = "deepinfra";
const DEEPSEEK_V4_FLASH_0731_UPSTREAM_DISPLAY = "DeepInfra";

function openRouterReasoningEffort(config: AIPlayerConfig): string {
  if (
    config.model === DEEPSEEK_V4_FLASH_0731 &&
    config.reasoningEffort === "xhigh"
  ) {
    return "max";
  }
  return config.reasoningEffort || "high";
}

function openRouterRouting(model: string): Record<string, unknown> {
  if (model === DEEPSEEK_V4_FLASH_0731) {
    return {
      only: [DEEPSEEK_V4_FLASH_0731_UPSTREAM_SLUG],
      allow_fallbacks: false,
      require_parameters: true,
      data_collection: "deny",
    };
  }
  return {
    allow_fallbacks: false,
    require_parameters: true,
    data_collection: "deny",
  };
}

function openRouterMaxTokens(
  config: AIPlayerConfig,
  requested?: number,
): number {
  const fallback =
    getReasoningMode(config) === "openrouter_reasoning" ? 100000 : 8192;
  const resolved = requested ?? fallback;
  // The pinned DeepInfra endpoint currently advertises a 65,536-token
  // completion window even though the model's total context is much larger.
  return config.model === DEEPSEEK_V4_FLASH_0731
    ? Math.min(resolved, 65_536)
    : resolved;
}

function withProviderMetadata(
  error: Error,
  providerMetadata: Record<string, unknown>,
): Error {
  Object.assign(error, { providerMetadata });
  return error;
}

function withProviderResponseReceipt(
  error: Error,
  response: RawAIResponse,
): Error {
  // Keep the potentially large/private assistant text out of generic Error
  // serialization. Research callers recover it only through the explicit
  // helper above.
  Object.defineProperty(error, "providerResponseReceipt", {
    value: response,
    enumerable: false,
    configurable: false,
    writable: false,
  });
  return error;
}

function providerMetadataFromError(
  error: unknown,
): Record<string, unknown> | undefined {
  if (!error || typeof error !== "object") return undefined;
  const metadata = (error as { providerMetadata?: unknown }).providerMetadata;
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>)
    : undefined;
}

function providerAttemptErrorSummary(
  error: Error,
  metadata: Record<string, unknown>,
  timedOut: boolean,
): string {
  if (timedOut) return "OpenRouter request timed out";
  if (typeof metadata.httpStatus === "number") {
    return `OpenRouter HTTP ${metadata.httpStatus}`;
  }
  if (error.message.includes("route proof")) {
    return "OpenRouter route-proof validation failed";
  }
  if (error.message.includes("served model")) {
    return "OpenRouter served-model validation failed";
  }
  if (error.message.includes("served provider")) {
    return "OpenRouter served-provider validation failed";
  }
  if (error.message.includes("provider-attempt telemetry")) {
    return "OpenRouter provider-attempt telemetry failed";
  }
  return "OpenRouter provider call failed";
}

async function callOpenRouter(
  config: AIPlayerConfig,
  systemPrompt: string,
  userPrompt: string,
  options: AICallOptions = {},
): Promise<RawAIResponse> {
  const apiKey = process.env.OPENROUTER_API_KEY;

  const isReasoning = getReasoningMode(config) === "openrouter_reasoning";
  const usesCombinedPrompt = isReasoning && modelHasTag(config, "combined_prompt");

  const messages: Array<{ role: string; content: string }> = [];
  if (!usesCombinedPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }
  messages.push({ role: "user", content: usesCombinedPrompt ? `${systemPrompt}\n\n${userPrompt}` : userPrompt });

  const body: Record<string, unknown> = {
    model: config.model,
    messages,
    max_tokens: openRouterMaxTokens(config, options.maxTokens),
    provider: openRouterRouting(config.model),
  };

  if (!isReasoning && getModelEntry(config)?.supportsTemperature !== false && config.temperature !== undefined) {
    body.temperature = config.temperature;
  }

  if (isReasoning) {
    body.reasoning = options.disableReasoning
      ? {
          // Omitting this object does not disable reasoning for models whose
          // OpenRouter metadata marks reasoning as enabled by default.
          enabled: false,
          exclude: true,
        }
      : {
          effort: openRouterReasoningEffort(config),
          // Preserve deliberate reasoning while retaining structured outputs
          // instead of storing provider chain-of-thought in research logs.
          exclude: true,
        };
  }

  const requestMetadata: Record<string, unknown> = {
    apiHost: "openrouter.ai",
    requestedModel: config.model,
    requestedUpstream:
      config.model === DEEPSEEK_V4_FLASH_0731
        ? DEEPSEEK_V4_FLASH_0731_UPSTREAM_SLUG
        : null,
    physicalAttempt: options.physicalAttempt ?? 1,
    requestedReasoningEffort: config.reasoningEffort || "high",
    wireReasoningEffort:
      isReasoning && !options.disableReasoning
        ? openRouterReasoningEffort(config)
        : null,
    reasoningDisabled: isReasoning && options.disableReasoning === true,
    routing: body.provider,
    providerAttemptId: options.providerAttemptTelemetry?.attemptId ?? null,
  };

  // Strict headless execution supplies the same controller used by its
  // deadline wrapper. Standalone/exploratory calls retain a provider-local
  // timeout instead.
  const requestSignal =
    options.signal ?? AbortSignal.timeout(Math.max(1, config.timeoutMs));

  try {
    // This update is awaited before network I/O. If persistence fails, no
    // request is sent.
    await options.providerAttemptTelemetry?.markRequest(requestMetadata);

    if (!apiKey) {
      throw withProviderMetadata(
        new Error("OPENROUTER_API_KEY environment variable is not set"),
        requestMetadata,
      );
    }

    let response: Response;
    try {
      response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "X-OpenRouter-Metadata": "enabled",
          "HTTP-Referer": process.env.OPENROUTER_REFERER || "http://localhost:5000",
          "X-Title": process.env.OPENROUTER_TITLE || "Decrypto Arena",
        },
        body: JSON.stringify(body),
        signal: requestSignal,
      });
    } catch (error) {
      throw withProviderMetadata(
        new Error(
          `OpenRouter transport error: ${
            error instanceof Error ? error.message : String(error)
          }`,
        ),
        requestMetadata,
      );
    }

    if (!response.ok) {
      let errorText: string;
      try {
        errorText = await response.text();
      } catch (error) {
        throw withProviderMetadata(
          new Error(
            `OpenRouter error response body read error after HTTP ${response.status}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          ),
          {
            ...requestMetadata,
            httpStatus: response.status,
            requestId: response.headers.get("x-request-id"),
            generationId: response.headers.get("x-generation-id"),
          },
        );
      }
      const error: any = withProviderMetadata(
        new Error(`OpenRouter API error: ${response.status} ${errorText}`),
        {
          ...requestMetadata,
          httpStatus: response.status,
          requestId: response.headers.get("x-request-id"),
          generationId: response.headers.get("x-generation-id"),
        },
      );
      error.status = response.status;
      throw error;
    }

    let data: any;
    try {
      data = await response.json();
    } catch (error) {
      throw withProviderMetadata(
        new Error(
          `OpenRouter response body error after HTTP ${response.status}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        ),
        {
          ...requestMetadata,
          httpStatus: response.status,
          requestId: response.headers.get("x-request-id"),
          generationId: response.headers.get("x-generation-id"),
        },
      );
    }
    const choice = data.choices?.[0]?.message;
    const content = choice?.content || "";
    const reasoningContent = choice?.reasoning_content || data.choices?.[0]?.message?.reasoning || "";
    const finishReason = data.choices?.[0]?.finish_reason;
    const providerMetadata: Record<string, unknown> = {
      ...requestMetadata,
      httpStatus: response.status,
      requestId: response.headers.get("x-request-id"),
      generationId: data.id || response.headers.get("x-generation-id"),
      servedModel: data.model,
      upstreamProvider: data.provider,
      systemFingerprint: data.system_fingerprint,
      openrouterMetadata: data.openrouter_metadata,
      finishReason,
      nativeFinishReason: data.choices?.[0]?.native_finish_reason,
      usage: data.usage
        ? {
            ...data.usage,
            promptTokens: data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens,
            totalTokens: data.usage.total_tokens,
            reasoningTokens:
              data.usage.completion_tokens_details?.reasoning_tokens,
            cachedTokens: data.usage.prompt_tokens_details?.cached_tokens,
            costUsd: data.usage.cost,
          }
        : null,
    };
    const providerResponseReceipt: RawAIResponse = {
      text: content,
      reasoningTrace: reasoningContent || undefined,
      promptTokens: data.usage?.prompt_tokens,
      completionTokens: data.usage?.completion_tokens,
      totalTokens: data.usage?.total_tokens,
      providerMetadata,
    };

    if (config.model === DEEPSEEK_V4_FLASH_0731) {
      if (data.model !== DEEPSEEK_V4_FLASH_0731) {
        throw withProviderResponseReceipt(
          withProviderMetadata(
            new Error(
              `OpenRouter served model ${String(data.model)} instead of ${DEEPSEEK_V4_FLASH_0731}`,
            ),
            providerMetadata,
          ),
          providerResponseReceipt,
        );
      }
      if (data.provider !== DEEPSEEK_V4_FLASH_0731_UPSTREAM_DISPLAY) {
        throw withProviderResponseReceipt(
          withProviderMetadata(
            new Error(
              `OpenRouter served provider ${String(data.provider)} instead of ${DEEPSEEK_V4_FLASH_0731_UPSTREAM_DISPLAY}`,
            ),
            providerMetadata,
          ),
          providerResponseReceipt,
        );
      }
      const routerMetadata =
        data.openrouter_metadata &&
        typeof data.openrouter_metadata === "object" &&
        !Array.isArray(data.openrouter_metadata)
          ? data.openrouter_metadata
          : null;
      const routerAttempts = Array.isArray(routerMetadata?.attempts)
        ? routerMetadata.attempts
        : [];
      const selectedEndpoints = Array.isArray(
        routerMetadata?.endpoints?.available,
      )
        ? routerMetadata.endpoints.available.filter(
            (endpoint: unknown) =>
              endpoint &&
              typeof endpoint === "object" &&
              (endpoint as { selected?: unknown }).selected === true,
          )
        : [];
      if (
        routerMetadata?.attempt !== 1 ||
        routerAttempts.length > 1 ||
        selectedEndpoints.length !== 1 ||
        selectedEndpoints[0]?.provider !==
          DEEPSEEK_V4_FLASH_0731_UPSTREAM_DISPLAY
      ) {
        throw withProviderResponseReceipt(
          withProviderMetadata(
            new Error(
              "OpenRouter route proof did not show exactly one successful DeepInfra attempt",
            ),
            providerMetadata,
          ),
          providerResponseReceipt,
        );
      }
      if (finishReason !== "stop") {
        throw withProviderResponseReceipt(
          withProviderMetadata(
            new Error(
              `OpenRouter DeepSeek call ended with ${String(finishReason)} instead of stop`,
            ),
            providerMetadata,
          ),
          providerResponseReceipt,
        );
      }
    }

    await options.providerAttemptTelemetry?.markTerminal({
      status: "succeeded",
      metadata: providerMetadata,
      error: null,
    });

    return providerResponseReceipt;
  } catch (error) {
    const providerMetadata =
      providerMetadataFromError(error) ?? requestMetadata;
    const timedOut =
      requestSignal.aborted ||
      (error instanceof DOMException &&
        (error.name === "AbortError" || error.name === "TimeoutError")) ||
      (error instanceof Error &&
        (error.name === "AbortError" || error.name === "TimeoutError"));
    const surfacedError =
      error instanceof Error
        ? withProviderMetadata(error, providerMetadata)
        : withProviderMetadata(new Error(String(error)), providerMetadata);

    try {
      await options.providerAttemptTelemetry?.markTerminal({
        status: timedOut ? "timed_out" : "failed",
        metadata: {
          ...providerMetadata,
          ...(timedOut
            ? {
                cancellationObserved: true,
                abortReasonType:
                  requestSignal.reason instanceof Error
                    ? requestSignal.reason.name
                    : requestSignal.reason == null
                      ? null
                      : typeof requestSignal.reason,
              }
            : {}),
        },
        // The research ai_call_logs row retains the detailed provider error.
        // This lifecycle table deliberately stores only a bounded summary so
        // an upstream response body cannot leak prompts, keys, or user data.
        error: providerAttemptErrorSummary(
          surfacedError,
          providerMetadata,
          timedOut,
        ),
      });
    } catch (telemetryError) {
      const telemetryFailure = withProviderMetadata(
        new Error(
          `OpenRouter provider-attempt telemetry failed: ${
            telemetryError instanceof Error
              ? telemetryError.message
              : String(telemetryError)
          }`,
        ),
        providerMetadata,
      );
      const receivedResponse = providerResponseReceiptFromError(error);
      throw receivedResponse
        ? withProviderResponseReceipt(telemetryFailure, receivedResponse)
        : telemetryFailure;
    }

    throw surfacedError;
  }
}

function callAIRaw(
  config: AIPlayerConfig,
  systemPrompt: string,
  userPrompt: string,
  options: AICallOptions = {},
): Promise<RawAIResponse> {
  switch (config.provider) {
    case "chatgpt":
      return callOpenAI(config, systemPrompt, userPrompt, options);
    case "claude":
      return callAnthropic(config, systemPrompt, userPrompt, options);
    case "gemini":
      return callGemini(config, systemPrompt, userPrompt, options);
    case "openrouter":
      return callOpenRouter(config, systemPrompt, userPrompt, options);
  }
}

export async function callAI(
  config: AIPlayerConfig,
  systemPrompt: string,
  userPrompt: string,
  options: AICallOptions = {},
): Promise<RawAIResponse> {
  return callAIWithBackoff(config, systemPrompt, userPrompt, options);
}

interface ParseResult<T> {
  value: T;
  quality: ParseQuality;
}

function assertStrictParseQuality(
  options: AICallOptions,
  quality: ParseQuality,
  action: string,
  providerMetadata?: Record<string, unknown>,
): void {
  if (!options.strictExecution || quality === "clean") return;
  throw withProviderMetadata(
    new Error(
      `Strict execution rejected ${action} parse quality "${quality}"`,
    ),
    providerMetadata ?? {},
  );
}

function parseCodeResponse(response: string): ParseResult<[number, number, number]> {
  // Strategy 1: Look for "ANSWER:" prefix line
  const answerMatch = response.match(/ANSWER:\s*(.+)/im);
  const searchText = answerMatch ? answerMatch[1] : response;

  // Strategy 2: Find a clean digit,digit,digit pattern (last match wins)
  const cleanPattern = /\b([1-4])\s*,\s*([1-4])\s*,\s*([1-4])\b/g;
  let lastCleanMatch: RegExpMatchArray | null = null;
  let match: RegExpExecArray | null;
  while ((match = cleanPattern.exec(searchText)) !== null) {
    lastCleanMatch = match;
  }

  if (lastCleanMatch) {
    const code = [parseInt(lastCleanMatch[1]), parseInt(lastCleanMatch[2]), parseInt(lastCleanMatch[3])] as [number, number, number];
    const unique = new Set(code);
    // Only the explicitly requested ANSWER line is protocol-clean. A tuple
    // recovered from surrounding prose remains usable in exploratory mode
    // but must invalidate strict research execution.
    const quality: ParseQuality =
      answerMatch && unique.size === 3 ? "clean" : "partial_recovery";
    return { value: code, quality };
  }

  // Strategy 3: Fall back to current approach (strip non-digit-non-comma, split)
  const cleaned = response.replace(/[^1-4,\s]/g, "");
  const numbers = cleaned.split(/[,\s]+/).map(n => parseInt(n.trim())).filter(n => n >= 1 && n <= 4);

  if (numbers.length >= 3) {
    const code = [numbers[0], numbers[1], numbers[2]] as [number, number, number];
    const unique = new Set(code);
    const quality: ParseQuality = unique.size === 3 ? "partial_recovery" : "partial_recovery";
    return { value: code, quality };
  }

  console.warn(`[PARSE_FALLBACK] parseCodeResponse got unusable response: "${response.slice(0, 200)}"`);
  return { value: [1, 2, 3] as [number, number, number], quality: "fallback_used" };
}

function parseCluesResponse(response: string): ParseResult<string[]> {
  // Strategy 1: Look for "ANSWER:" prefix line, then extract word,word,word from it
  const answerMatch = response.match(/ANSWER:\s*(.+)/im);
  const searchText = answerMatch ? answerMatch[1] : response;

  // Strategy 2: Find a clean word,word,word pattern (last match wins — answer is usually at the end)
  const cleanPattern = /\b([a-z]{1,25})\s*,\s*([a-z]{1,25})\s*,\s*([a-z]{1,25})\b/gi;
  let lastCleanMatch: RegExpMatchArray | null = null;
  let match: RegExpExecArray | null;
  while ((match = cleanPattern.exec(searchText)) !== null) {
    lastCleanMatch = match;
  }

  if (lastCleanMatch) {
    const words = [lastCleanMatch[1].toLowerCase(), lastCleanMatch[2].toLowerCase(), lastCleanMatch[3].toLowerCase()];
    // Filter out any "word" longer than 25 chars (thinking noise)
    if (words.every(w => w.length >= 1 && w.length <= 25)) {
      return {
        value: words,
        quality: answerMatch ? "clean" : "partial_recovery",
      };
    }
  }

  // Strategy 3: Fall back to line-by-line parsing but filter out words > 25 chars
  const lines = response.split("\n").map(l => l.trim()).filter(l => l.length > 0);
  let words: string[] = [];

  for (const line of lines) {
    const lineWords = line.split(",").map(w => w.trim().toLowerCase().replace(/[^a-z]/g, "")).filter(w => w.length >= 1 && w.length <= 25);
    words.push(...lineWords);
  }

  if (words.length === 0) {
    words = response.split(/[\s,]+/).map(w => w.trim().toLowerCase().replace(/[^a-z]/g, "")).filter(w => w.length >= 1 && w.length <= 25);
  }

  if (words.length >= 3) {
    return { value: words.slice(0, 3), quality: "partial_recovery" };
  }

  if (words.length > 0 && words.length < 3) {
    while (words.length < 3) words.push("hint");
    console.warn(`[PARSE_PARTIAL] parseCluesResponse padded incomplete response: "${response.slice(0, 200)}"`);
    return { value: words, quality: "partial_recovery" };
  }

  console.warn(`[PARSE_FALLBACK] parseCluesResponse got unusable response: "${response.slice(0, 200)}"`);
  return { value: ["hint", "clue", "guess"], quality: "fallback_used" };
}

export function buildCluePrompt(params: ClueTemplateParams): string {
  const strategy = getPromptStrategy("default");
  return `${strategy.systemPrompt}\n\n${strategy.clueTemplate(params)}`;
}

export function buildGuessPrompt(params: GuessTemplateParams): string {
  const strategy = getPromptStrategy("default");
  return `${strategy.systemPrompt}\n\n${strategy.guessTemplate(params)}`;
}

export function buildInterceptionPrompt(params: InterceptionTemplateParams): string {
  const strategy = getPromptStrategy("default");
  return `${strategy.systemPrompt}\n\n${strategy.interceptionTemplate(params)}`;
}

function resolveConfig(configOrProvider: AIPlayerConfig | string): AIPlayerConfig {
  if (typeof configOrProvider === "string") {
    return getDefaultConfigForProvider(configOrProvider as AIPlayerConfig["provider"]);
  }
  return configOrProvider;
}

export async function generateClues(
  configOrProvider: AIPlayerConfig | string,
  params: ClueTemplateParams,
  options: AICallOptions = {},
): Promise<AICallResult<string[]>> {
  const config = resolveConfig(configOrProvider);
  const ablatedParams = applyAblations(params, params.ablations, "clue");

  if (ablatedParams.ablations?.includes("random_clues")) {
    const randomWords = ["alpha", "beta", "gamma", "delta", "epsilon", "zeta", "theta", "kappa", "sigma", "omega"];
    const pick = () => randomWords[Math.floor(Math.random() * randomWords.length)];
    // These words are fabricated, not model output. Marking them "clean"
    // made strictFailure evaluate false, so a strictExecution tournament
    // persisted and played them with usedFallback:false — a synthetic action
    // inside the mode that exists to guarantee there are none. It also let
    // them pass the blind-inversion calibration's clean-control filter.
    // "fallback_used" makes strict fail closed and excludes them from
    // clean-only analysis, while non-strict ablation arms still record the
    // result normally.
    return { result: [pick(), pick(), pick()], prompt: "ABLATION:random_clues", rawResponse: "", model: config.model, latencyMs: 0, parseQuality: "fallback_used" };
  }

  const strategy = getPromptStrategy(config.promptStrategy);
  const useSimplePrompt = ablatedParams.ablations?.includes("no_chain_of_thought") && ["advanced", "k-level", "enriched"].includes(config.promptStrategy);
  const activeStrategy = useSimplePrompt ? getPromptStrategy("default") : strategy;
  const prompt = activeStrategy.clueTemplate(ablatedParams);
  const systemPrompt = ablatedParams.systemPromptOverride || activeStrategy.systemPrompt;
  const fullPrompt = `${systemPrompt}\n\n${prompt}`;
  const startTime = Date.now();
  let raw: RawAIResponse | undefined;
  try {
    raw = await callAI(config, systemPrompt, prompt, options);
    const latencyMs = Date.now() - startTime;
    const parsed = parseCluesResponse(raw.text);
    assertStrictParseQuality(
      options,
      parsed.quality,
      "clue",
      raw.providerMetadata,
    );
    return {
      result: parsed.value, prompt: fullPrompt, rawResponse: raw.text, model: config.model, latencyMs,
      reasoningTrace: raw.reasoningTrace, parseQuality: parsed.quality,
      promptTokens: raw.promptTokens, completionTokens: raw.completionTokens, totalTokens: raw.totalTokens,
      estimatedCostUsd: estimateCost(config, raw.promptTokens, raw.completionTokens),
      providerMetadata: raw.providerMetadata,
    };
  } catch (err: unknown) {
    const latencyMs = Date.now() - startTime;
    return {
      result: ["hint", "clue", "guess"],
      prompt: fullPrompt,
      rawResponse: raw?.text ?? "",
      model: config.model,
      latencyMs,
      error: String(err),
      parseQuality: "error",
      reasoningTrace: raw?.reasoningTrace,
      promptTokens: raw?.promptTokens,
      completionTokens: raw?.completionTokens,
      totalTokens: raw?.totalTokens,
      estimatedCostUsd: estimateCost(
        config,
        raw?.promptTokens,
        raw?.completionTokens,
      ),
      providerMetadata:
        raw?.providerMetadata ?? providerMetadataFromError(err),
    };
  }
}

export async function generateGuess(
  configOrProvider: AIPlayerConfig | string,
  params: GuessTemplateParams,
  options: AICallOptions = {},
): Promise<AICallResult<[number, number, number]>> {
  const config = resolveConfig(configOrProvider);
  const ablatedParams = applyAblations(params, params.ablations, "guess");
  const strategy = getPromptStrategy(config.promptStrategy);
  const useSimplePrompt = ablatedParams.ablations?.includes("no_chain_of_thought") && ["advanced", "k-level", "enriched"].includes(config.promptStrategy);
  const activeStrategy = useSimplePrompt ? getPromptStrategy("default") : strategy;
  const prompt = activeStrategy.guessTemplate(ablatedParams);
  const systemPrompt = ablatedParams.systemPromptOverride || activeStrategy.systemPrompt;
  const fullPrompt = `${systemPrompt}\n\n${prompt}`;
  const startTime = Date.now();
  let raw: RawAIResponse | undefined;
  try {
    raw = await callAI(config, systemPrompt, prompt, options);
    const latencyMs = Date.now() - startTime;
    const parsed = parseCodeResponse(raw.text);
    assertStrictParseQuality(
      options,
      parsed.quality,
      "guess",
      raw.providerMetadata,
    );
    return {
      result: parsed.value, prompt: fullPrompt, rawResponse: raw.text, model: config.model, latencyMs,
      reasoningTrace: raw.reasoningTrace, parseQuality: parsed.quality,
      promptTokens: raw.promptTokens, completionTokens: raw.completionTokens, totalTokens: raw.totalTokens,
      estimatedCostUsd: estimateCost(config, raw.promptTokens, raw.completionTokens),
      providerMetadata: raw.providerMetadata,
    };
  } catch (err: unknown) {
    const latencyMs = Date.now() - startTime;
    return {
      result: [1, 2, 3],
      prompt: fullPrompt,
      rawResponse: raw?.text ?? "",
      model: config.model,
      latencyMs,
      error: String(err),
      parseQuality: "error",
      reasoningTrace: raw?.reasoningTrace,
      promptTokens: raw?.promptTokens,
      completionTokens: raw?.completionTokens,
      totalTokens: raw?.totalTokens,
      estimatedCostUsd: estimateCost(
        config,
        raw?.promptTokens,
        raw?.completionTokens,
      ),
      providerMetadata:
        raw?.providerMetadata ?? providerMetadataFromError(err),
    };
  }
}

export interface ReflectionParams {
  teamKeywords: string[];
  teamHistory: Array<{ clues: string[]; targetCode: [number, number, number] }>;
  opponentHistory: Array<{ clues: string[]; targetCode: [number, number, number] }>;
  winner: "amber" | "blue" | null;
  myTeam: "amber" | "blue";
  whiteTokens: number;
  blackTokens: number;
  opponentWhiteTokens: number;
  opponentBlackTokens: number;
  currentNotes: string;
  tokenBudget: number;
}

function buildReflectionPrompt(params: ReflectionParams): string {
  const won = params.winner === params.myTeam;
  const lost = params.winner !== null && params.winner !== params.myTeam;
  const outcome = won ? "WON" : lost ? "LOST" : "DRAW/INCOMPLETE";

  let prompt = `GAME REFLECTION — Update your strategic notes.

You just finished a Decrypto game. Your team ${outcome}.
Your team: ${params.myTeam}
Your team's keywords: ${params.teamKeywords.join(", ")}
White tokens (miscommunications): ${params.whiteTokens} | Black tokens (intercepted by opponent): ${params.blackTokens}
Opponent white tokens: ${params.opponentWhiteTokens} | Opponent black tokens (your interceptions): ${params.opponentBlackTokens}

Your team's round history:
${params.teamHistory.map((h, i) => `  Round ${i + 1}: Clues [${h.clues.join(", ")}] → Code [${h.targetCode.join(", ")}]`).join("\n")}

Opponent's round history:
${params.opponentHistory.map((h, i) => `  Round ${i + 1}: Clues [${h.clues.join(", ")}] → Code [${h.targetCode.join(", ")}]`).join("\n")}`;

  if (params.currentNotes) {
    prompt += `\n\nYour current strategic notes from previous games:\n${params.currentNotes}`;
  } else {
    prompt += `\n\nThis is your first game in the series — no prior notes exist.`;
  }

  prompt += `\n\nUpdate your strategic notes based on this game. Focus on:
1. What cluing strategies worked or failed
2. Patterns you noticed in opponent behavior
3. Theories about effective approaches
4. What to try differently next game
5. Any meta-level observations about the game dynamics

Keep your notes concise and actionable — they will be provided to you in future games.
Stay within approximately ${params.tokenBudget} tokens.

Respond with ONLY your updated notes text, nothing else.`;

  return prompt;
}

export async function generateReflection(
  config: AIPlayerConfig,
  params: ReflectionParams,
  options: AICallOptions = {},
): Promise<AICallResult<string>> {
  const systemPrompt = "You are an AI agent reflecting on a completed Decrypto game. Your job is to update your strategic notes with observations and insights that will help you play better in future games.";
  const prompt = buildReflectionPrompt(params);
  const fullPrompt = `${systemPrompt}\n\n${prompt}`;
  const startTime = Date.now();
  let raw: RawAIResponse | undefined;
  try {
    raw = await callAI(config, systemPrompt, prompt, options);
    const latencyMs = Date.now() - startTime;
    let notes = raw.text.trim();
    if (options.strictExecution && notes.length === 0) {
      throw withProviderMetadata(
        new Error("Strict execution rejected an empty reflection response"),
        raw.providerMetadata ?? {},
      );
    }
    const approxTokens = Math.ceil(notes.length / 4);
    if (approxTokens > params.tokenBudget * 1.5) {
      notes = notes.slice(0, params.tokenBudget * 6);
    }
    return {
      result: notes, prompt: fullPrompt, rawResponse: raw.text, model: config.model, latencyMs,
      reasoningTrace: raw.reasoningTrace, parseQuality: "clean",
      promptTokens: raw.promptTokens, completionTokens: raw.completionTokens, totalTokens: raw.totalTokens,
      estimatedCostUsd: estimateCost(config, raw.promptTokens, raw.completionTokens),
      providerMetadata: raw.providerMetadata,
    };
  } catch (err: unknown) {
    const latencyMs = Date.now() - startTime;
    return {
      result: params.currentNotes || "",
      prompt: fullPrompt,
      rawResponse: raw?.text ?? "",
      model: config.model,
      latencyMs,
      error: String(err),
      parseQuality: "error",
      reasoningTrace: raw?.reasoningTrace,
      promptTokens: raw?.promptTokens,
      completionTokens: raw?.completionTokens,
      totalTokens: raw?.totalTokens,
      estimatedCostUsd: estimateCost(
        config,
        raw?.promptTokens,
        raw?.completionTokens,
      ),
      providerMetadata:
        raw?.providerMetadata ?? providerMetadataFromError(err),
    };
  }
}

export function validateApiKeys(): void {
  const providers: Array<{ name: string; key: string | undefined }> = [
    { name: "OpenAI", key: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY },
    { name: "Anthropic", key: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY },
    { name: "Gemini", key: process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY },
    { name: "OpenRouter", key: process.env.OPENROUTER_API_KEY },
  ];

  const available = providers.filter(p => p.key);
  const missing = providers.filter(p => !p.key);

  console.log(`[AI] Available providers: ${available.map(p => p.name).join(", ") || "none"}`);
  if (missing.length > 0) {
    console.log(`[AI] Missing keys for: ${missing.map(p => p.name).join(", ")}`);
  }
  if (available.length === 0) {
    console.warn("[AI] Warning: No AI provider keys configured. AI features will not work.");
  }
}

export interface DeliberationParams {
  systemPrompt: string;
  userPrompt: string;
  ablations?: AblationFlag[];
}

export async function generateDeliberationMessage(
  config: AIPlayerConfig,
  params: DeliberationParams,
  options: AICallOptions = {},
): Promise<AICallResult<string>> {
  const fullPrompt = `${params.systemPrompt}\n\n${params.userPrompt}`;
  const startTime = Date.now();
  let raw: RawAIResponse | undefined;
  try {
    raw = await callAI(config, params.systemPrompt, params.userPrompt, options);
    const latencyMs = Date.now() - startTime;
    if (options.strictExecution && raw.text.trim().length === 0) {
      throw withProviderMetadata(
        new Error("Strict execution rejected an empty deliberation response"),
        raw.providerMetadata ?? {},
      );
    }
    return {
      result: raw.text,
      prompt: fullPrompt,
      rawResponse: raw.text,
      model: config.model,
      latencyMs,
      reasoningTrace: raw.reasoningTrace,
      parseQuality: "clean",
      promptTokens: raw.promptTokens,
      completionTokens: raw.completionTokens,
      totalTokens: raw.totalTokens,
      estimatedCostUsd: estimateCost(config, raw.promptTokens, raw.completionTokens),
      providerMetadata: raw.providerMetadata,
    };
  } catch (err: unknown) {
    const latencyMs = Date.now() - startTime;
    return {
      result: "",
      prompt: fullPrompt,
      rawResponse: raw?.text ?? "",
      model: config.model,
      latencyMs,
      error: String(err),
      parseQuality: "error",
      reasoningTrace: raw?.reasoningTrace,
      promptTokens: raw?.promptTokens,
      completionTokens: raw?.completionTokens,
      totalTokens: raw?.totalTokens,
      estimatedCostUsd: estimateCost(
        config,
        raw?.promptTokens,
        raw?.completionTokens,
      ),
      providerMetadata:
        raw?.providerMetadata ?? providerMetadataFromError(err),
    };
  }
}

export async function generateInterception(
  configOrProvider: AIPlayerConfig | string,
  params: InterceptionTemplateParams,
  options: AICallOptions = {},
): Promise<AICallResult<[number, number, number]>> {
  const config = resolveConfig(configOrProvider);
  const ablatedParams = applyAblations(params, params.ablations, "interception");
  const strategy = getPromptStrategy(config.promptStrategy);
  const useSimplePrompt = ablatedParams.ablations?.includes("no_chain_of_thought") && ["advanced", "k-level", "enriched"].includes(config.promptStrategy);
  const activeStrategy = useSimplePrompt ? getPromptStrategy("default") : strategy;
  const prompt = activeStrategy.interceptionTemplate(ablatedParams);
  const systemPrompt = ablatedParams.systemPromptOverride || activeStrategy.systemPrompt;
  const fullPrompt = `${systemPrompt}\n\n${prompt}`;
  const startTime = Date.now();
  let raw: RawAIResponse | undefined;
  try {
    raw = await callAI(config, systemPrompt, prompt, options);
    const latencyMs = Date.now() - startTime;
    const parsed = parseCodeResponse(raw.text);
    assertStrictParseQuality(
      options,
      parsed.quality,
      "interception",
      raw.providerMetadata,
    );
    return {
      result: parsed.value, prompt: fullPrompt, rawResponse: raw.text, model: config.model, latencyMs,
      reasoningTrace: raw.reasoningTrace, parseQuality: parsed.quality,
      promptTokens: raw.promptTokens, completionTokens: raw.completionTokens, totalTokens: raw.totalTokens,
      estimatedCostUsd: estimateCost(config, raw.promptTokens, raw.completionTokens),
      providerMetadata: raw.providerMetadata,
    };
  } catch (err: unknown) {
    const latencyMs = Date.now() - startTime;
    return {
      result: [1, 2, 3],
      prompt: fullPrompt,
      rawResponse: raw?.text ?? "",
      model: config.model,
      latencyMs,
      error: String(err),
      parseQuality: "error",
      reasoningTrace: raw?.reasoningTrace,
      promptTokens: raw?.promptTokens,
      completionTokens: raw?.completionTokens,
      totalTokens: raw?.totalTokens,
      estimatedCostUsd: estimateCost(
        config,
        raw?.promptTokens,
        raw?.completionTokens,
      ),
      providerMetadata:
        raw?.providerMetadata ?? providerMetadataFromError(err),
    };
  }
}
