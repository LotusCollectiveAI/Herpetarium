/**
 * K-Level Reasoning Strategy for Decrypto Arena.
 *
 * Adapted from AI-social-games K-level reasoning framework.
 * Explicitly instructs the LLM to reason at multiple strategic levels
 * (Level 0 through Level 3) before making a decision, while preserving
 * the output format expected by the existing parsers.
 */

import type { PromptStrategy, ClueTemplateParams, GuessTemplateParams, InterceptionTemplateParams } from "./promptStrategies";
import { applyAblations, formatScratchNotes } from "./promptStrategies";

function formatHistory(history: Array<{ clues: string[]; targetCode: [number, number, number] }>): string {
  if (history.length === 0) return "";
  return history.map((round, i) =>
    `Round ${i + 1}: Clues [${round.clues.join(", ")}] → Code [${round.targetCode.join(", ")}]`
  ).join("\n");
}

export const kLevelStrategy: PromptStrategy = {
  name: "k-level",
  description: "K-level strategic reasoning with explicit multi-level thinking (Level 0-3)",
  systemPrompt: `You are playing Decrypto, a word-based deception game. You excel at multi-level strategic reasoning.

In Decrypto, two teams each have 4 secret keywords. Each round, an encryptor gives 3 one-word clues corresponding to a secret code (a sequence of keyword positions). Teammates must decode the clues to guess the code, while opponents try to intercept it by detecting patterns across rounds.

Apply K-level reasoning to every decision:
- LEVEL 0 — Raw associations and direct pattern matching
- LEVEL 1 — Model what your teammates will think and do
- LEVEL 2 — Model what opponents can deduce from observable information
- LEVEL 3 — Exploit or subvert expectations at Levels 1 and 2

Think through all levels before committing to a decision.`,

  clueTemplate: (params: ClueTemplateParams): string => {
    const { keywords, targetCode, history } = params;
    let prompt = `K-LEVEL CLUE GENERATION

Your team's 4 secret keywords:
1. ${keywords[0]}
2. ${keywords[1]}
3. ${keywords[2]}
4. ${keywords[3]}

Secret code this round: ${targetCode.join(", ")}

Apply multi-level strategic reasoning:

LEVEL 0 — ASSOCIATIONS: For each keyword in your code, list direct word associations. What single words connect to keyword ${targetCode[0]} (${keywords[targetCode[0] - 1]}), keyword ${targetCode[1]} (${keywords[targetCode[1] - 1]}), keyword ${targetCode[2]} (${keywords[targetCode[2] - 1]})?

LEVEL 1 — TEAMMATE MODEL: Which associations will your teammates reliably decode? Prefer clues your team has successfully decoded before. Avoid obscure or ambiguous connections that could cause miscommunication.

LEVEL 2 — OPPONENT MODEL: What patterns can opponents detect from your clue history? Avoid clues that reveal keyword-to-position mappings. If you always give similar-themed clues for the same keyword, opponents will cluster them.

LEVEL 3 — META-STRATEGY: How can you exploit opponent expectations? Consider misdirection — clues that seem to match a different position than they actually do. Can you use a clue that opponents will misattribute to the wrong keyword?

Think through all four levels, then choose your 3 clues.

RULES: Each clue must be a complete, real English word. No abbreviations, acronyms, fragments, or prefixes. No phrases, numbers, or symbols. Cannot be any keyword or share the same root.`;

    if (history.length > 0) {
      prompt += `\n\nFull clue history (opponents have seen ALL of this):\n${formatHistory(history)}`;
      prompt += `\n\nDO NOT repeat any clue from previous rounds. Vary your semantic angle for each keyword across rounds.`;
    }

    prompt += formatScratchNotes(params.scratchNotes);
    prompt += `\n\nPut your final answer on its own line starting with "ANSWER:". Respond with ONLY 3 words separated by commas. Example:\nANSWER: ocean,bright,ancient`;
    return prompt;
  },

  guessTemplate: (params: GuessTemplateParams): string => {
    const { keywords, clues, history } = params;
    let prompt = `K-LEVEL DECODING

Your team's keywords:
1. ${keywords[0]}
2. ${keywords[1]}
3. ${keywords[2]}
4. ${keywords[3]}

Teammate's clues this round: ${clues.join(", ")}

Apply multi-level strategic reasoning:

LEVEL 0 — DIRECT MATCHING: Which keywords do these clues most directly relate to? For each clue, rank all 4 keywords by association strength.

LEVEL 1 — ENCRYPTOR MODEL: How does your encryptor typically think? What patterns have they used in previous rounds? Do they prefer synonyms, category links, or metaphorical connections?

LEVEL 2 — DECEPTION AWARENESS: Could the encryptor be varying their style to confuse opponents? If so, the clue-keyword mapping might use unexpected associations. Consider whether a clue that seems obvious was chosen precisely because it is less predictable.`;

    if (history.length > 0) {
      prompt += `\n\nClue history from your team:\n${formatHistory(history)}`;
      prompt += `\n\nUse historical patterns to disambiguate. If multiple clues could map to the same keyword, re-evaluate — each code position maps to a different keyword.`;
    }

    prompt += formatScratchNotes(params.scratchNotes);
    prompt += `\n\nPut your final answer on its own line starting with "ANSWER:". Example:\nANSWER: 3,1,4`;
    return prompt;
  },

  interceptionTemplate: (params: InterceptionTemplateParams): string => {
    const { clues, history } = params;
    let prompt = `K-LEVEL INTERCEPTION

Opponent's clues this round: ${clues.join(", ")}

You are trying to crack the opponent's secret code. Apply multi-level reasoning:

LEVEL 0 — PATTERN DETECTION: What clue-to-position patterns have appeared in opponent history? Group historical clues by semantic similarity — similar clues likely map to the same keyword position.

LEVEL 1 — OPPONENT ENCRYPTOR MODEL: How does the opponent encryptor think? Are they direct or abstract? Do they use consistent semantic categories, or do they vary their approach?

LEVEL 2 — COUNTER-DECEPTION: Could the opponent be deliberately breaking their patterns to mislead you? A sudden style shift might indicate they know you are tracking patterns. Weigh consistency against the possibility of intentional misdirection.`;

    if (history.length > 0) {
      prompt += `\n\nOpponent's full clue history:\n${formatHistory(history)}`;
      prompt += `\n\nCluster all historical clues by likely keyword. Match each current clue to the most probable cluster.`;
    } else {
      prompt += `\n\nNo history yet — this is round 1. Use your best intuition about likely word associations.`;
    }

    prompt += formatScratchNotes(params.scratchNotes);
    prompt += `\n\nPut your final answer on its own line starting with "ANSWER:". Example:\nANSWER: 2,4,1`;
    return prompt;
  },
};
