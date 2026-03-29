import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import type { AIPlayerConfig } from "@shared/schema";
import { getPromptStrategy } from "./promptStrategies";
import type { ClueTemplateParams, GuessTemplateParams, InterceptionTemplateParams } from "./promptStrategies";

let openaiClient: OpenAI | null = null;
let anthropicClient: Anthropic | null = null;
let geminiClient: GoogleGenAI | null = null;

function getOpenAI(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    });
  }
  return openaiClient;
}

function getAnthropic(): Anthropic {
  if (!anthropicClient) {
    anthropicClient = new Anthropic({
      apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
      baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
    });
  }
  return anthropicClient;
}

function getGemini(): GoogleGenAI {
  if (!geminiClient) {
    geminiClient = new GoogleGenAI({
      apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY,
    });
  }
  return geminiClient;
}

function isOpenAIReasoningModel(model: string): boolean {
  return /^o[0-9]/.test(model) || model.startsWith("o1");
}

function isGeminiThinkingModel(model: string): boolean {
  return model.includes("2.5-pro") || model.includes("2.5-flash");
}

export interface AICallResult<T> {
  result: T;
  prompt: string;
  rawResponse: string;
  model: string;
  latencyMs: number;
  error?: string;
  reasoningTrace?: string;
}

interface RawAIResponse {
  text: string;
  reasoningTrace?: string;
}

async function callOpenAI(config: AIPlayerConfig, systemPrompt: string, userPrompt: string): Promise<RawAIResponse> {
  const isReasoning = isOpenAIReasoningModel(config.model);

  if (isReasoning) {
    const response = await getOpenAI().chat.completions.create({
      model: config.model,
      messages: [
        { role: "user", content: `${systemPrompt}\n\n${userPrompt}` },
      ],
      max_completion_tokens: 2048,
    } as any);

    const choice = response.choices[0];
    const text = choice?.message?.content || "";
    let reasoningTrace: string | undefined;

    const msg = choice?.message as any;
    if (msg?.reasoning_content) {
      reasoningTrace = msg.reasoning_content;
    }

    return { text, reasoningTrace };
  }

  const response = await getOpenAI().chat.completions.create({
    model: config.model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    max_tokens: 200,
    temperature: config.temperature ?? 0.7,
  });

  return { text: response.choices[0]?.message?.content || "" };
}

async function callAnthropic(config: AIPlayerConfig, systemPrompt: string, userPrompt: string): Promise<RawAIResponse> {
  const isExtendedThinking = config.model.includes("claude-3-7") || config.promptStrategy === "advanced";

  if (isExtendedThinking && config.promptStrategy === "advanced") {
    try {
      const response = await getAnthropic().messages.create({
        model: config.model,
        max_tokens: 16000,
        thinking: {
          type: "enabled",
          budget_tokens: 10000,
        },
        messages: [{ role: "user", content: `${systemPrompt}\n\n${userPrompt}` }],
      } as any);

      let text = "";
      let reasoningTrace: string | undefined;

      for (const block of response.content) {
        if (block.type === "thinking") {
          reasoningTrace = (block as any).thinking;
        } else if (block.type === "text") {
          text = block.text;
        }
      }

      return { text, reasoningTrace };
    } catch {
    }
  }

  const response = await getAnthropic().messages.create({
    model: config.model,
    max_tokens: 200,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const content = response.content[0];
  return { text: content.type === "text" ? content.text : "" };
}

async function callGemini(config: AIPlayerConfig, systemPrompt: string, userPrompt: string): Promise<RawAIResponse> {
  const isThinking = isGeminiThinkingModel(config.model);

  if (isThinking) {
    const response = await getGemini().models.generateContent({
      model: config.model,
      contents: `${systemPrompt}\n\n${userPrompt}`,
      config: {
        thinkingConfig: {
          thinkingBudget: 8000,
        },
      },
    } as any);

    let text = "";
    let reasoningTrace: string | undefined;

    const candidates = (response as any).candidates;
    if (candidates?.[0]?.content?.parts) {
      for (const part of candidates[0].content.parts) {
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

    return { text, reasoningTrace };
  }

  const response = await getGemini().models.generateContent({
    model: config.model,
    contents: `${systemPrompt}\n\n${userPrompt}`,
  });

  return { text: response.text || "" };
}

async function callAI(config: AIPlayerConfig, systemPrompt: string, userPrompt: string): Promise<RawAIResponse> {
  switch (config.provider) {
    case "chatgpt":
      return callOpenAI(config, systemPrompt, userPrompt);
    case "claude":
      return callAnthropic(config, systemPrompt, userPrompt);
    case "gemini":
      return callGemini(config, systemPrompt, userPrompt);
  }
}

function parseCodeResponse(response: string): [number, number, number] {
  const cleaned = response.replace(/[^1-4,]/g, "");
  const numbers = cleaned.split(",").map(n => parseInt(n.trim())).filter(n => n >= 1 && n <= 4);

  if (numbers.length >= 3) {
    return [numbers[0], numbers[1], numbers[2]] as [number, number, number];
  }

  return [1, 2, 3] as [number, number, number];
}

function parseCluesResponse(response: string): string[] {
  const words = response.split(",").map(w => w.trim().toLowerCase().replace(/[^a-z]/g, "")).filter(w => w.length > 0);

  if (words.length >= 3) {
    return words.slice(0, 3);
  }

  return ["hint", "clue", "guess"];
}

export const MODEL_MAP: Record<string, string> = {
  chatgpt: "gpt-4o",
  claude: "claude-sonnet-4-20250514",
  gemini: "gemini-2.0-flash",
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
      model: MODEL_MAP[provider] || "gpt-4o",
      timeoutMs: 120000,
      temperature: 0.7,
      promptStrategy: "default",
    };
  }
  return configOrProvider;
}

export async function generateClues(configOrProvider: AIPlayerConfig | string, params: ClueTemplateParams): Promise<AICallResult<string[]>> {
  const config = resolveConfig(configOrProvider);
  const strategy = getPromptStrategy(config.promptStrategy);
  const prompt = strategy.clueTemplate(params);
  const fullPrompt = `${strategy.systemPrompt}\n\n${prompt}`;
  const startTime = Date.now();
  try {
    const raw = await callAI(config, strategy.systemPrompt, prompt);
    const latencyMs = Date.now() - startTime;
    const result = parseCluesResponse(raw.text);
    return { result, prompt: fullPrompt, rawResponse: raw.text, model: config.model, latencyMs, reasoningTrace: raw.reasoningTrace };
  } catch (err: unknown) {
    const latencyMs = Date.now() - startTime;
    return { result: ["hint", "clue", "guess"], prompt: fullPrompt, rawResponse: "", model: config.model, latencyMs, error: String(err) };
  }
}

export async function generateGuess(configOrProvider: AIPlayerConfig | string, params: GuessTemplateParams): Promise<AICallResult<[number, number, number]>> {
  const config = resolveConfig(configOrProvider);
  const strategy = getPromptStrategy(config.promptStrategy);
  const prompt = strategy.guessTemplate(params);
  const fullPrompt = `${strategy.systemPrompt}\n\n${prompt}`;
  const startTime = Date.now();
  try {
    const raw = await callAI(config, strategy.systemPrompt, prompt);
    const latencyMs = Date.now() - startTime;
    const result = parseCodeResponse(raw.text);
    return { result, prompt: fullPrompt, rawResponse: raw.text, model: config.model, latencyMs, reasoningTrace: raw.reasoningTrace };
  } catch (err: unknown) {
    const latencyMs = Date.now() - startTime;
    return { result: [1, 2, 3], prompt: fullPrompt, rawResponse: "", model: config.model, latencyMs, error: String(err) };
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
    return { result: notes, prompt: fullPrompt, rawResponse: raw.text, model: config.model, latencyMs, reasoningTrace: raw.reasoningTrace };
  } catch (err: unknown) {
    const latencyMs = Date.now() - startTime;
    return { result: params.currentNotes || "", prompt: fullPrompt, rawResponse: "", model: config.model, latencyMs, error: String(err) };
  }
}

export async function generateInterception(configOrProvider: AIPlayerConfig | string, params: InterceptionTemplateParams): Promise<AICallResult<[number, number, number]>> {
  const config = resolveConfig(configOrProvider);
  const strategy = getPromptStrategy(config.promptStrategy);
  const prompt = strategy.interceptionTemplate(params);
  const fullPrompt = `${strategy.systemPrompt}\n\n${prompt}`;
  const startTime = Date.now();
  try {
    const raw = await callAI(config, strategy.systemPrompt, prompt);
    const latencyMs = Date.now() - startTime;
    const result = parseCodeResponse(raw.text);
    return { result, prompt: fullPrompt, rawResponse: raw.text, model: config.model, latencyMs, reasoningTrace: raw.reasoningTrace };
  } catch (err: unknown) {
    const latencyMs = Date.now() - startTime;
    return { result: [1, 2, 3], prompt: fullPrompt, rawResponse: "", model: config.model, latencyMs, error: String(err) };
  }
}
