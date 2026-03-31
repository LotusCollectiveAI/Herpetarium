/**
 * Enriched Strategy for Decrypto Arena.
 *
 * An enhanced version of the "advanced" strategy that incorporates:
 * 1. Better task framing with numbered steps and explicit constraints (from decryptoai)
 * 2. Explicit "do not repeat clues" instruction
 * 3. Word vibe/tag context from wordPacks for semantic enrichment
 * 4. Persona injection from botPersonas for stylistic variation
 */

import type { PromptStrategy, ClueTemplateParams, GuessTemplateParams, InterceptionTemplateParams } from "./promptStrategies";
import { formatScratchNotes } from "./promptStrategies";
import { getWordCardForLabel } from "./wordPacks";
import { getPersonaByName } from "./botPersonas";
import type { BotPersona } from "./botPersonas";

function formatHistory(history: Array<{ clues: string[]; targetCode: [number, number, number] }>): string {
  if (history.length === 0) return "";
  return history.map((round, i) =>
    `Round ${i + 1}: Clues [${round.clues.join(", ")}] → Code [${round.targetCode.join(", ")}]`
  ).join("\n");
}

function formatKeywordWithContext(keyword: string, index: number): string {
  const card = getWordCardForLabel(keyword);
  if (card) {
    return `${index}. ${keyword} [semantic context: ${card.vibe}, related: ${card.tags.slice(0, 5).join(", ")}]`;
  }
  return `${index}. ${keyword}`;
}

function buildPersonaPrefix(persona?: BotPersona): string {
  if (!persona) return "";
  return ` You are ${persona.name}, ${persona.title}. Your style: ${persona.style}.`;
}

/**
 * The enriched strategy accepts an optional persona name through a module-level
 * configuration. Call setEnrichedPersona() before using the strategy to inject
 * a persona, or leave it unset for persona-free operation.
 */
let activePersonaName: string | undefined;

export function setEnrichedPersona(name: string | undefined): void {
  activePersonaName = name;
}

export function getEnrichedPersona(): BotPersona | undefined {
  return activePersonaName ? getPersonaByName(activePersonaName) : undefined;
}

export const enrichedStrategy: PromptStrategy = {
  name: "enriched",
  description: "Enhanced strategy with semantic word context, persona injection, and structured task framing",
  systemPrompt: `You are an elite Decrypto strategist with deep expertise in word association, deception, and linguistic analysis. Decrypto is a team-based word game where two teams each have 4 secret keywords. Each round, an encryptor gives 3 one-word clues corresponding to a secret code. Teammates decode the clues; opponents try to intercept by detecting patterns.

Your approach:
1. INFORMATION CONTROL: Each clue reveals information. Minimize leakage to opponents while maximizing signal to teammates.
2. PATTERN DISRUPTION: Actively vary your semantic angles across rounds. Never become predictable.
3. THEORY OF MIND: Model what opponents have learned from previous rounds. Anticipate their clustering and deduction.
4. SEMANTIC DEPTH: Use the full richness of word associations — synonyms, categories, metaphors, sensory links, cultural references.`,

  clueTemplate: (params: ClueTemplateParams): string => {
    const { keywords, targetCode, history } = params;
    const ablations = params.ablations || [];

    // Persona: skip if ablated
    const persona = ablations.includes("no_persona") ? undefined : getEnrichedPersona();
    const personaPrefix = buildPersonaPrefix(persona);

    // Keyword formatting: skip semantic context if ablated
    const formatKw = ablations.includes("no_semantic_context")
      ? (kw: string, i: number) => `${i}. ${kw}`
      : (kw: string, i: number) => formatKeywordWithContext(kw, i);

    let prompt = `ENRICHED CLUE GENERATION${personaPrefix}

Your team's keywords (DO NOT use these words or their roots as clues):
${keywords.map((kw, i) => formatKw(kw, i + 1)).join("\n")}

Your secret code this round: ${targetCode.join(", ")}

INSTRUCTIONS:
1. For each position in the code, think of a one-word clue that relates to the corresponding keyword.
2. Choose clues your teammates will understand but opponents cannot easily map to specific keywords.
3. DO NOT repeat any clue from previous rounds.
4. Vary your association style across rounds to prevent opponents from detecting patterns.
5. Consider the full clue history — opponents will analyze it for patterns.
6. Each clue must be a complete, real English word. No abbreviations, acronyms, fragments, or prefixes.
7. No phrases, numbers, or symbols. Clues cannot be any keyword or share the same root as a keyword.`;

    if (history.length > 0) {
      prompt += `\n\nPrevious rounds (visible to opponents):\n${formatHistory(history)}`;
      prompt += `\n\nAll clues above have been used. Choose DIFFERENT clues. Shift your semantic angle for any keyword you have clued before.`;
    } else {
      prompt += `\n\nThis is round 1. Establish initial associations that are clear to your team but leave room for variation in future rounds.`;
    }

    prompt += formatScratchNotes(params.scratchNotes);
    prompt += `\n\nPut your final answer on its own line starting with "ANSWER:". Respond with ONLY 3 single words separated by commas. No explanations. Example:\nANSWER: ocean,bright,ancient`;
    return prompt;
  },

  guessTemplate: (params: GuessTemplateParams): string => {
    const { keywords, clues, history } = params;
    const ablations = params.ablations || [];

    const persona = ablations.includes("no_persona") ? undefined : getEnrichedPersona();
    const personaPrefix = buildPersonaPrefix(persona);

    const formatKw = ablations.includes("no_semantic_context")
      ? (kw: string, i: number) => `${i}. ${kw}`
      : (kw: string, i: number) => formatKeywordWithContext(kw, i);

    let prompt = `ENRICHED DECODING${personaPrefix}

Your team's keywords:
${keywords.map((kw, i) => formatKw(kw, i + 1)).join("\n")}

Teammate's clues this round: ${clues.join(", ")}

INSTRUCTIONS:
1. For each clue, determine which keyword (1-4) it most likely refers to.
2. Consider both direct associations and the semantic context of each keyword.
3. Each code position maps to a different keyword — resolve conflicts.
4. Use your teammate's historical cluing style to disambiguate.`;

    if (history.length > 0) {
      prompt += `\n\nClue history from your team:\n${formatHistory(history)}`;
      prompt += `\n\n5. Cross-reference current clues with past patterns. Your teammate may use consistent semantic strategies.`;
    }

    prompt += formatScratchNotes(params.scratchNotes);
    prompt += `\n\nPut your final answer on its own line starting with "ANSWER:". Example:\nANSWER: 3,1,4`;
    return prompt;
  },

  interceptionTemplate: (params: InterceptionTemplateParams): string => {
    const { clues, history } = params;
    const ablations = params.ablations || [];

    const persona = ablations.includes("no_persona") ? undefined : getEnrichedPersona();
    const personaPrefix = buildPersonaPrefix(persona);

    let prompt = `ENRICHED INTERCEPTION${personaPrefix}

Opponent's clues this round: ${clues.join(", ")}

INSTRUCTIONS:
1. Analyze the opponent's clue patterns across all rounds.
2. Group historical clues by semantic similarity — similar clues likely map to the same keyword position.
3. For each current clue, match it to the most likely keyword cluster.
4. Consider whether the opponent is deliberately varying style to mislead.
5. Rate your confidence for each mapping and go with the most consistent interpretation.`;

    if (history.length > 0) {
      prompt += `\n\nOpponent's full clue history:\n${formatHistory(history)}`;
      prompt += `\n\nUse this history to identify recurring themes per position. Clues in the same position across rounds that share semantic themes likely point to the same keyword.`;
    } else {
      prompt += `\n\nNo history yet — this is round 1. Make your best educated guess based on clue semantics.`;
    }

    prompt += formatScratchNotes(params.scratchNotes);
    prompt += `\n\nPut your final answer on its own line starting with "ANSWER:". Example:\nANSWER: 2,4,1`;
    return prompt;
  },
};
