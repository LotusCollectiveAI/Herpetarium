import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import type { AIPlayerConfig, ParseQuality, AblationFlag } from "@shared/schema";
import { getPromptStrategy, applyAblations } from "./promptStrategies";
import type { ClueTemplateParams, GuessTemplateParams, InterceptionTemplateParams } from "./promptStrategies";

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
  if (message.includes("rate limit") || message.includes("too many requests") || message.includes("429")) {
    return { isRateLimit: true };
  }
  return { isRateLimit: false };
}

const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30000;

async function callAIWithBackoff(config: AIPlayerConfig, systemPrompt: string, userPrompt: string): Promise<RawAIResponse> {
  const state = getThrottleState(config.provider);

  if (state.backoffMs > 0) {
    const elapsed = Date.now() - state.lastRateLimitAt;
    const remaining = state.backoffMs - elapsed;
    if (remaining > 0) {
      await new Promise(resolve => setTimeout(resolve, remaining));
    }
  }

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await callAIRaw(config, systemPrompt, userPrompt);
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
      throw err;
    }
  }
  throw new Error("Max retries exceeded");
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

function isOpenAIReasoningModel(model: string): boolean {
  return model.startsWith("o1") || model.startsWith("o3") || model.startsWith("o4");
}

function isGeminiThinkingModel(model: string): boolean {
  return model.includes("2.5-pro") || model.includes("2.5-flash") || model.includes("3.1-pro");
}

const ANTHROPIC_THINKING_BUDGET: Record<string, number> = {
  low: 5000,
  medium: 15000,
  high: 30000,
  xhigh: 50000,
};

const GEMINI_THINKING_BUDGET: Record<string, number> = {
  low: 5000,
  medium: 15000,
  high: 32000,
  xhigh: 50000,
};

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

// Costs per 1K tokens. For reasoning/thinking models, thinking tokens are billed
// at the output rate and should be counted as completion tokens.
export const MODEL_COST_PER_1K: Record<string, { input: number; output: number }> = {
  // OpenAI — current models
  "gpt-5.4": { input: 0.0025, output: 0.015 },
  "gpt-5.4-mini": { input: 0.0004, output: 0.0016 },
  "codex-5.3": { input: 0.003, output: 0.015 },
  "o3": { input: 0.002, output: 0.008 },
  "o4-mini": { input: 0.0011, output: 0.0044 },
  // OpenAI — legacy (kept for historical cost estimates)
  "gpt-4o": { input: 0.0025, output: 0.01 },
  "gpt-4o-mini": { input: 0.00015, output: 0.0006 },
  "o1": { input: 0.015, output: 0.06 },
  "o3-mini": { input: 0.0011, output: 0.0044 },
  // Anthropic — current models (thinking tokens billed at output rate)
  "claude-opus-4-6": { input: 0.005, output: 0.025 },
  "claude-sonnet-4-6": { input: 0.003, output: 0.015 },
  "claude-sonnet-4-20250514": { input: 0.003, output: 0.015 },
  "claude-haiku-4-5-20251001": { input: 0.001, output: 0.005 },
  // Anthropic — legacy
  "claude-opus-4-20250514": { input: 0.015, output: 0.075 },
  "claude-haiku-4-20250414": { input: 0.0008, output: 0.004 },
  "claude-3-5-sonnet-20241022": { input: 0.003, output: 0.015 },
  // Google Gemini — current models (thinking tokens billed at output rate for thinking models)
  "gemini-3.1-pro-preview": { input: 0.002, output: 0.012 },
  "gemini-3.1-flash-lite-preview": { input: 0.00025, output: 0.0015 },
  "gemini-2.5-pro": { input: 0.0035, output: 0.021 },
  "gemini-2.5-flash": { input: 0.0003, output: 0.0025 },
  // Google Gemini — legacy
  "gemini-2.0-flash": { input: 0.0001, output: 0.0004 },
  // OpenRouter — current models
  "deepseek/deepseek-v3.2": { input: 0.00026, output: 0.00038 },
  "deepseek-ai/deepseek-reasoner": { input: 0.00055, output: 0.00219 },
  "x-ai/grok-4.20-beta": { input: 0.002, output: 0.006 },
  "qwen/qwen3.6-plus-preview": { input: 0.0005, output: 0.002 },
  "qwen/qwen3-max-thinking": { input: 0.00039, output: 0.00234 },
  "meta-llama/llama-4-maverick": { input: 0.0005, output: 0.0015 },
  "moonshotai/kimi-k2.5": { input: 0.0006, output: 0.002 },
  // OpenRouter — legacy
  "deepseek/deepseek-r1": { input: 0.00055, output: 0.00219 },
  "x-ai/grok-3-beta": { input: 0.003, output: 0.015 },
  "mistralai/mistral-large-latest": { input: 0.002, output: 0.006 },
  "qwen/qwen-2.5-72b-instruct": { input: 0.0006, output: 0.0018 },
};

export function estimateCost(model: string, promptTokens?: number, completionTokens?: number): string | undefined {
  if (!promptTokens && !completionTokens) return undefined;
  const costs = MODEL_COST_PER_1K[model];
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

async function callOpenAI(config: AIPlayerConfig, systemPrompt: string, userPrompt: string): Promise<RawAIResponse> {
  const isReasoning = isOpenAIReasoningModel(config.model);

  if (isReasoning) {
    const response = await getOpenAI().chat.completions.create({
      model: config.model,
      messages: [
        { role: "user", content: `${systemPrompt}\n\n${userPrompt}` },
      ],
      max_completion_tokens: 100000, // Let reasoning models think as long as they need
      reasoning_effort: config.reasoningEffort || "high",
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

  // Modern models (GPT-5+, GPT-4.1+, Codex) require max_completion_tokens and support reasoning_effort
  const isModernModel = config.model.startsWith("gpt-5") || config.model.startsWith("gpt-4.1") || config.model.startsWith("codex-");
  const advancedStrategies = ["advanced", "k-level", "enriched"];

  const completionParams: Record<string, any> = {
    model: config.model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  };

  if (isModernModel) {
    // GPT-5+ with reasoning_effort only supports temperature=1 (the default)
    // Don't set temperature at all — let the API use its default
    completionParams.max_completion_tokens = 16384;
    if (advancedStrategies.includes(config.promptStrategy)) {
      completionParams.reasoning_effort = config.reasoningEffort || "high";
      completionParams.max_completion_tokens = 100000;
    }
  } else {
    completionParams.temperature = config.temperature ?? 0.7;
    completionParams.max_tokens = 4096;
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

async function callAnthropic(config: AIPlayerConfig, systemPrompt: string, userPrompt: string): Promise<RawAIResponse> {
  const thinkingStrategies = ["advanced", "k-level", "enriched"];
  const isExtendedThinking = config.model.includes("claude-3-7") || thinkingStrategies.includes(config.promptStrategy);

  if (isExtendedThinking && thinkingStrategies.includes(config.promptStrategy)) {
    try {
      // Use streaming to avoid timeout on long thinking operations
      const stream = getAnthropic().messages.stream({
        model: config.model,
        max_tokens: 64000,
        thinking: {
          type: "enabled",
          budget_tokens: ANTHROPIC_THINKING_BUDGET[config.reasoningEffort || "high"] || 30000,
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
    max_tokens: 8192, // Let models write full responses
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

async function callGemini(config: AIPlayerConfig, systemPrompt: string, userPrompt: string): Promise<RawAIResponse> {
  const isThinking = isGeminiThinkingModel(config.model);

  if (isThinking) {
    const response = await getGemini().models.generateContent({
      model: config.model,
      contents: `${systemPrompt}\n\n${userPrompt}`,
      config: {
        thinkingConfig: {
          thinkingBudget: GEMINI_THINKING_BUDGET[config.reasoningEffort || "high"] || 32000,
        },
      },
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
  });

  const extResp = response as unknown as GeminiResponseExtended;
  return {
    text: response.text || "",
    ...extractGeminiUsage(extResp),
  };
}

async function callOpenRouter(config: AIPlayerConfig, systemPrompt: string, userPrompt: string): Promise<RawAIResponse> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY environment variable is not set");
  }

  const isReasoning = config.model.includes("deepseek-r1") || config.model.includes("deepseek-reasoner") || config.model.includes("qwen3-max-thinking") || config.model.includes("o1") || config.model.includes("o3") || config.model.includes("o4");

  const messages: Array<{ role: string; content: string }> = [];
  if (!isReasoning) {
    messages.push({ role: "system", content: systemPrompt });
  }
  messages.push({ role: "user", content: isReasoning ? `${systemPrompt}\n\n${userPrompt}` : userPrompt });

  const body: Record<string, unknown> = {
    model: config.model,
    messages,
    max_tokens: isReasoning ? 100000 : 8192,
  };

  if (!isReasoning && config.temperature !== undefined) {
    body.temperature = config.temperature;
  }

  // Request reasoning effort for models that support it
  if (isReasoning) {
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

function callAIRaw(config: AIPlayerConfig, systemPrompt: string, userPrompt: string): Promise<RawAIResponse> {
  switch (config.provider) {
    case "chatgpt":
      return callOpenAI(config, systemPrompt, userPrompt);
    case "claude":
      return callAnthropic(config, systemPrompt, userPrompt);
    case "gemini":
      return callGemini(config, systemPrompt, userPrompt);
    case "openrouter":
      return callOpenRouter(config, systemPrompt, userPrompt);
  }
}

export async function callAI(config: AIPlayerConfig, systemPrompt: string, userPrompt: string): Promise<RawAIResponse> {
  return callAIWithBackoff(config, systemPrompt, userPrompt);
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

export const MODEL_MAP: Record<string, string> = {
  chatgpt: "gpt-5.4",
  claude: "claude-sonnet-4-6",
  gemini: "gemini-3.1-pro-preview",
  openrouter: "deepseek/deepseek-v3.2",
};

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
    const provider = configOrProvider as AIPlayerConfig["provider"];
    return {
      provider,
      model: MODEL_MAP[provider] || "gpt-5.4",
      timeoutMs: 120000,
      temperature: 0.7,
      reasoningEffort: "high",
      promptStrategy: "default",
    };
  }
  return configOrProvider;
}

export async function generateClues(configOrProvider: AIPlayerConfig | string, params: ClueTemplateParams): Promise<AICallResult<string[]>> {
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
    const raw = await callAI(config, systemPrompt, prompt);
    const latencyMs = Date.now() - startTime;
    const parsed = parseCluesResponse(raw.text);
    return {
      result: parsed.value, prompt: fullPrompt, rawResponse: raw.text, model: config.model, latencyMs,
      reasoningTrace: raw.reasoningTrace, parseQuality: parsed.quality,
      promptTokens: raw.promptTokens, completionTokens: raw.completionTokens, totalTokens: raw.totalTokens,
      estimatedCostUsd: estimateCost(config.model, raw.promptTokens, raw.completionTokens),
    };
  } catch (err: unknown) {
    const latencyMs = Date.now() - startTime;
    return { result: ["hint", "clue", "guess"], prompt: fullPrompt, rawResponse: "", model: config.model, latencyMs, error: String(err), parseQuality: "error" };
  }
}

export async function generateGuess(configOrProvider: AIPlayerConfig | string, params: GuessTemplateParams): Promise<AICallResult<[number, number, number]>> {
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
    const raw = await callAI(config, systemPrompt, prompt);
    const latencyMs = Date.now() - startTime;
    const parsed = parseCodeResponse(raw.text);
    return {
      result: parsed.value, prompt: fullPrompt, rawResponse: raw.text, model: config.model, latencyMs,
      reasoningTrace: raw.reasoningTrace, parseQuality: parsed.quality,
      promptTokens: raw.promptTokens, completionTokens: raw.completionTokens, totalTokens: raw.totalTokens,
      estimatedCostUsd: estimateCost(config.model, raw.promptTokens, raw.completionTokens),
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
      estimatedCostUsd: estimateCost(config.model, raw.promptTokens, raw.completionTokens),
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
): Promise<AICallResult<string>> {
  const fullPrompt = `${params.systemPrompt}\n\n${params.userPrompt}`;
  const startTime = Date.now();
  try {
    const raw = await callAI(config, params.systemPrompt, params.userPrompt);
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
      estimatedCostUsd: estimateCost(config.model, raw.promptTokens, raw.completionTokens),
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

export async function generateInterception(configOrProvider: AIPlayerConfig | string, params: InterceptionTemplateParams): Promise<AICallResult<[number, number, number]>> {
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
    const raw = await callAI(config, systemPrompt, prompt);
    const latencyMs = Date.now() - startTime;
    const parsed = parseCodeResponse(raw.text);
    return {
      result: parsed.value, prompt: fullPrompt, rawResponse: raw.text, model: config.model, latencyMs,
      reasoningTrace: raw.reasoningTrace, parseQuality: parsed.quality,
      promptTokens: raw.promptTokens, completionTokens: raw.completionTokens, totalTokens: raw.totalTokens,
      estimatedCostUsd: estimateCost(config.model, raw.promptTokens, raw.completionTokens),
    };
  } catch (err: unknown) {
    const latencyMs = Date.now() - startTime;
    return { result: [1, 2, 3], prompt: fullPrompt, rawResponse: "", model: config.model, latencyMs, error: String(err), parseQuality: "error" };
  }
}
