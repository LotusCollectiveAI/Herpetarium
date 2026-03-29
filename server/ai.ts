import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import { AIProvider } from "@shared/schema";

// Lazy initialization to avoid crashes on import
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

interface ClueGenerationParams {
  keywords: string[];
  targetCode: [number, number, number];
  history: Array<{
    clues: string[];
    targetCode: [number, number, number];
  }>;
}

interface GuessParams {
  keywords: string[];
  clues: string[];
  history: Array<{
    clues: string[];
    targetCode: [number, number, number];
  }>;
}

interface InterceptionParams {
  clues: string[];
  history: Array<{
    clues: string[];
    targetCode: [number, number, number];
  }>;
}

function buildCluePrompt(params: ClueGenerationParams): string {
  const { keywords, targetCode, history } = params;
  
  let prompt = `You are playing Decrypto, a word association game. Your team has 4 secret keywords:
1. ${keywords[0]}
2. ${keywords[1]}
3. ${keywords[2]}
4. ${keywords[3]}

Your secret code for this round is: ${targetCode.join(", ")}

You must give 3 clues (one for each number in the code) that will help your teammates guess the correct keywords, but be subtle enough that the opponent team cannot figure out your keywords over time.

Rules:
- Each clue must be a SINGLE WORD (no phrases, numbers, or symbols)
- Clues cannot be any of the keywords or their root words
- Be creative but not too obscure for your team
- Remember: opponents will see your clues and try to decode your keywords over rounds

`;

  if (history.length > 0) {
    prompt += "\nPrevious rounds (clues and codes revealed):\n";
    history.forEach((round, i) => {
      prompt += `Round ${i + 1}: Clues [${round.clues.join(", ")}] → Code [${round.targetCode.join(", ")}]\n`;
    });
    prompt += "\nBe careful - opponents have seen these patterns!\n";
  }

  prompt += "\nRespond with exactly 3 words separated by commas, nothing else. Example: ocean,bright,ancient";
  
  return prompt;
}

function buildGuessPrompt(params: GuessParams): string {
  const { keywords, clues, history } = params;
  
  let prompt = `You are playing Decrypto. Your team's keywords are:
1. ${keywords[0]}
2. ${keywords[1]}
3. ${keywords[2]}
4. ${keywords[3]}

Your teammate gave these clues: ${clues.join(", ")}

Each clue corresponds to one of your keywords (in order). Figure out which keyword each clue refers to.

`;

  if (history.length > 0) {
    prompt += "Previous rounds for reference:\n";
    history.forEach((round, i) => {
      prompt += `Round ${i + 1}: Clues [${round.clues.join(", ")}] → Code [${round.targetCode.join(", ")}]\n`;
    });
  }

  prompt += "\nRespond with exactly 3 numbers (1-4) separated by commas representing which keywords the clues refer to. Example: 3,1,4";
  
  return prompt;
}

function buildInterceptionPrompt(params: InterceptionParams): string {
  const { clues, history } = params;
  
  let prompt = `You are playing Decrypto and trying to INTERCEPT the opponent's code.

The opponent's clues this round: ${clues.join(", ")}

You DON'T know their keywords, but you can use their clue history to figure out patterns.

`;

  if (history.length > 0) {
    prompt += "Opponent's previous rounds:\n";
    history.forEach((round, i) => {
      prompt += `Round ${i + 1}: Clues [${round.clues.join(", ")}] → Code [${round.targetCode.join(", ")}]\n`;
    });
    prompt += "\nAnalyze patterns: similar clues likely refer to the same keyword number.\n";
  } else {
    prompt += "This is round 1, so you have no history. Make your best guess.\n";
  }

  prompt += "\nRespond with exactly 3 numbers (1-4) separated by commas as your guess of their code. Example: 2,4,1";
  
  return prompt;
}

function parseCodeResponse(response: string): [number, number, number] {
  const cleaned = response.replace(/[^1-4,]/g, "");
  const numbers = cleaned.split(",").map(n => parseInt(n.trim())).filter(n => n >= 1 && n <= 4);
  
  if (numbers.length >= 3) {
    return [numbers[0], numbers[1], numbers[2]] as [number, number, number];
  }
  
  // Fallback: generate random code
  return [1, 2, 3] as [number, number, number];
}

function parseCluesResponse(response: string): string[] {
  const words = response.split(",").map(w => w.trim().toLowerCase().replace(/[^a-z]/g, "")).filter(w => w.length > 0);
  
  if (words.length >= 3) {
    return words.slice(0, 3);
  }
  
  // Fallback
  return ["hint", "clue", "guess"];
}

export async function generateClues(provider: AIProvider, params: ClueGenerationParams): Promise<string[]> {
  const prompt = buildCluePrompt(params);
  
  switch (provider) {
    case "chatgpt": {
      const response = await getOpenAI().chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 50,
        temperature: 0.7,
      });
      return parseCluesResponse(response.choices[0]?.message?.content || "");
    }
    
    case "claude": {
      const response = await getAnthropic().messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 50,
        messages: [{ role: "user", content: prompt }],
      });
      const content = response.content[0];
      return parseCluesResponse(content.type === "text" ? content.text : "");
    }
    
    case "gemini": {
      const response = await getGemini().models.generateContent({
        model: "gemini-2.0-flash",
        contents: prompt,
      });
      return parseCluesResponse(response.text || "");
    }
  }
}

export async function generateGuess(provider: AIProvider, params: GuessParams): Promise<[number, number, number]> {
  const prompt = buildGuessPrompt(params);
  
  switch (provider) {
    case "chatgpt": {
      const response = await getOpenAI().chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 20,
        temperature: 0.3,
      });
      return parseCodeResponse(response.choices[0]?.message?.content || "");
    }
    
    case "claude": {
      const response = await getAnthropic().messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 20,
        messages: [{ role: "user", content: prompt }],
      });
      const content = response.content[0];
      return parseCodeResponse(content.type === "text" ? content.text : "");
    }
    
    case "gemini": {
      const response = await getGemini().models.generateContent({
        model: "gemini-2.0-flash",
        contents: prompt,
      });
      return parseCodeResponse(response.text || "");
    }
  }
}

export async function generateInterception(provider: AIProvider, params: InterceptionParams): Promise<[number, number, number]> {
  const prompt = buildInterceptionPrompt(params);
  
  switch (provider) {
    case "chatgpt": {
      const response = await getOpenAI().chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 20,
        temperature: 0.5,
      });
      return parseCodeResponse(response.choices[0]?.message?.content || "");
    }
    
    case "claude": {
      const response = await getAnthropic().messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 20,
        messages: [{ role: "user", content: prompt }],
      });
      const content = response.content[0];
      return parseCodeResponse(content.type === "text" ? content.text : "");
    }
    
    case "gemini": {
      const response = await getGemini().models.generateContent({
        model: "gemini-2.0-flash",
        contents: prompt,
      });
      return parseCodeResponse(response.text || "");
    }
  }
}
