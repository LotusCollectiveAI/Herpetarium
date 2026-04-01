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

function getThrottleState(provider: string): ProviderThrottleState {
  if (!providerThrottleState[provider]) {
    providerThrottleState[provider] = { lastRateLimitAt: 0, backoffMs: 0, totalRetries: 0, totalRateLimits: 0 };
  }
  return providerThrottleState[provider];
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
}

async function callAIWithBackoff(
  config: AIPlayerConfig,
  systemPrompt: string,
  userPrompt: string,
  options: AICallOptions = {},
): Promise<RawAIResponse> {
  const state = getThrottleState(config.provider);
  const modelKey = getModelKey(config.provider, config.model);
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

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await callAIRaw(config, systemPrompt, userPrompt, options);
      if (healthTracker) {
        healthTracker.recordSuccess(modelKey);
      }
      if (state.backoffMs > 0) {
        state.backoffMs = Math.max(0, state.backoffMs * 0.5);
      }
      return result;
    } catch (err) {
      const { isRateLimit, retryAfterMs } = isRateLimitError(err);
      if (isRateLimit && attempt < MAX_RETRIES) {
        state.totalRateLimits++;
        state.totalRetries++;
        state.lastRateLimitAt = Date.now();

        const jitter = Math.random() * 500;
        const backoff = retryAfterMs || Math.min(BASE_BACKOFF_MS * Math.pow(2, attempt) + jitter, MAX_BACKOFF_MS);
        state.backoffMs = backoff;

        console.warn(`[ai-backoff] ${config.provider}/${config.model} rate limited (attempt ${attempt + 1}/${MAX_RETRIES}), waiting ${Math.round(backoff)}ms`);
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

interface RawAIResponse {
  text: string;
  reasoningTrace?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
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

async function callOpenRouter(
  config: AIPlayerConfig,
  systemPrompt: string,
  userPrompt: string,
  options: AICallOptions = {},
): Promise<RawAIResponse> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY environment variable is not set");
  }

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
    max_tokens: options.maxTokens ?? (isReasoning ? 100000 : 8192),
  };

  if (!isReasoning && getModelEntry(config)?.supportsTemperature !== false && config.temperature !== undefined) {
    body.temperature = config.temperature;
  }

  if (isReasoning && !options.disableReasoning) {
    body.reasoning = { effort: config.reasoningEffort || "high" };
  }

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.OPENROUTER_REFERER || "http://localhost:5000",
      "X-Title": process.env.OPENROUTER_TITLE || "Decrypto Arena",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    const error: any = new Error(`OpenRouter API error: ${response.status} ${errorText}`);
    error.status = response.status;
    throw error;
  }

  const data = await response.json() as any;
  const choice = data.choices?.[0]?.message;
  const content = choice?.content || "";
  const reasoningContent = choice?.reasoning_content || data.choices?.[0]?.message?.reasoning || "";

  return {
    text: content,
    reasoningTrace: reasoningContent || undefined,
    promptTokens: data.usage?.prompt_tokens,
    completionTokens: data.usage?.completion_tokens,
    totalTokens: data.usage?.total_tokens,
  };
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
    const quality: ParseQuality = unique.size === 3 ? "clean" : "partial_recovery";
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
      return { value: words, quality: "clean" };
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
    return { result: [pick(), pick(), pick()], prompt: "ABLATION:random_clues", rawResponse: "", model: config.model, latencyMs: 0, parseQuality: "clean" };
  }

  const strategy = getPromptStrategy(config.promptStrategy);
  const useSimplePrompt = ablatedParams.ablations?.includes("no_chain_of_thought") && ["advanced", "k-level", "enriched"].includes(config.promptStrategy);
  const activeStrategy = useSimplePrompt ? getPromptStrategy("default") : strategy;
  const prompt = activeStrategy.clueTemplate(ablatedParams);
  const systemPrompt = ablatedParams.systemPromptOverride || activeStrategy.systemPrompt;
  const fullPrompt = `${systemPrompt}\n\n${prompt}`;
  const startTime = Date.now();
  try {
    const raw = await callAI(config, systemPrompt, prompt, options);
    const latencyMs = Date.now() - startTime;
    const parsed = parseCluesResponse(raw.text);
    return {
      result: parsed.value, prompt: fullPrompt, rawResponse: raw.text, model: config.model, latencyMs,
      reasoningTrace: raw.reasoningTrace, parseQuality: parsed.quality,
      promptTokens: raw.promptTokens, completionTokens: raw.completionTokens, totalTokens: raw.totalTokens,
      estimatedCostUsd: estimateCost(config, raw.promptTokens, raw.completionTokens),
    };
  } catch (err: unknown) {
    const latencyMs = Date.now() - startTime;
    return { result: ["hint", "clue", "guess"], prompt: fullPrompt, rawResponse: "", model: config.model, latencyMs, error: String(err), parseQuality: "error" };
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
  try {
    const raw = await callAI(config, systemPrompt, prompt, options);
    const latencyMs = Date.now() - startTime;
    const parsed = parseCodeResponse(raw.text);
    return {
      result: parsed.value, prompt: fullPrompt, rawResponse: raw.text, model: config.model, latencyMs,
      reasoningTrace: raw.reasoningTrace, parseQuality: parsed.quality,
      promptTokens: raw.promptTokens, completionTokens: raw.completionTokens, totalTokens: raw.totalTokens,
      estimatedCostUsd: estimateCost(config, raw.promptTokens, raw.completionTokens),
    };
  } catch (err: unknown) {
    const latencyMs = Date.now() - startTime;
    return { result: [1, 2, 3], prompt: fullPrompt, rawResponse: "", model: config.model, latencyMs, error: String(err), parseQuality: "error" };
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

export async function generateReflection(config: AIPlayerConfig, params: ReflectionParams): Promise<AICallResult<string>> {
  const systemPrompt = "You are an AI agent reflecting on a completed Decrypto game. Your job is to update your strategic notes with observations and insights that will help you play better in future games.";
  const prompt = buildReflectionPrompt(params);
  const fullPrompt = `${systemPrompt}\n\n${prompt}`;
  const startTime = Date.now();
  try {
    const raw = await callAI(config, systemPrompt, prompt);
    const latencyMs = Date.now() - startTime;
    let notes = raw.text.trim();
    const approxTokens = Math.ceil(notes.length / 4);
    if (approxTokens > params.tokenBudget * 1.5) {
      notes = notes.slice(0, params.tokenBudget * 6);
    }
    return {
      result: notes, prompt: fullPrompt, rawResponse: raw.text, model: config.model, latencyMs,
      reasoningTrace: raw.reasoningTrace, parseQuality: "clean",
      promptTokens: raw.promptTokens, completionTokens: raw.completionTokens, totalTokens: raw.totalTokens,
      estimatedCostUsd: estimateCost(config, raw.promptTokens, raw.completionTokens),
    };
  } catch (err: unknown) {
    const latencyMs = Date.now() - startTime;
    return { result: params.currentNotes || "", prompt: fullPrompt, rawResponse: "", model: config.model, latencyMs, error: String(err), parseQuality: "error" };
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
  try {
    const raw = await callAI(config, params.systemPrompt, params.userPrompt, options);
    const latencyMs = Date.now() - startTime;
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
    };
  } catch (err: unknown) {
    const latencyMs = Date.now() - startTime;
    return {
      result: "",
      prompt: fullPrompt,
      rawResponse: "",
      model: config.model,
      latencyMs,
      error: String(err),
      parseQuality: "error",
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
  try {
    const raw = await callAI(config, systemPrompt, prompt, options);
    const latencyMs = Date.now() - startTime;
    const parsed = parseCodeResponse(raw.text);
    return {
      result: parsed.value, prompt: fullPrompt, rawResponse: raw.text, model: config.model, latencyMs,
      reasoningTrace: raw.reasoningTrace, parseQuality: parsed.quality,
      promptTokens: raw.promptTokens, completionTokens: raw.completionTokens, totalTokens: raw.totalTokens,
      estimatedCostUsd: estimateCost(config, raw.promptTokens, raw.completionTokens),
    };
  } catch (err: unknown) {
    const latencyMs = Date.now() - startTime;
    return { result: [1, 2, 3], prompt: fullPrompt, rawResponse: "", model: config.model, latencyMs, error: String(err), parseQuality: "error" };
  }
}
