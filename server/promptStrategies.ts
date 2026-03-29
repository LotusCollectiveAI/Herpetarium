export interface PromptStrategy {
  name: string;
  description: string;
  systemPrompt: string;
  clueTemplate: (params: ClueTemplateParams) => string;
  guessTemplate: (params: GuessTemplateParams) => string;
  interceptionTemplate: (params: InterceptionTemplateParams) => string;
}

import type { AblationFlag } from "@shared/schema";

export interface ClueTemplateParams {
  keywords: string[];
  targetCode: [number, number, number];
  history: Array<{ clues: string[]; targetCode: [number, number, number] }>;
  scratchNotes?: string;
  ablations?: AblationFlag[];
}

export interface GuessTemplateParams {
  keywords: string[];
  clues: string[];
  history: Array<{ clues: string[]; targetCode: [number, number, number] }>;
  scratchNotes?: string;
  ablations?: AblationFlag[];
}

export interface InterceptionTemplateParams {
  clues: string[];
  history: Array<{ clues: string[]; targetCode: [number, number, number] }>;
  scratchNotes?: string;
  ablations?: AblationFlag[];
}

export function applyAblations<T extends { history?: any[]; scratchNotes?: string }>(
  params: T,
  ablations?: AblationFlag[],
  callType?: "clue" | "guess" | "interception"
): T {
  if (!ablations || ablations.length === 0) return params;

  const result = { ...params };

  if (ablations.includes("no_history")) {
    (result as any).history = [];
  }

  if (ablations.includes("no_opponent_history") && callType === "interception") {
    (result as any).history = [];
  }

  if (ablations.includes("no_scratch_notes")) {
    (result as any).scratchNotes = undefined;
  }

  return result;
}

function formatHistory(history: Array<{ clues: string[]; targetCode: [number, number, number] }>): string {
  if (history.length === 0) return "";
  return history.map((round, i) =>
    `Round ${i + 1}: Clues [${round.clues.join(", ")}] → Code [${round.targetCode.join(", ")}]`
  ).join("\n");
}

function formatScratchNotes(notes?: string): string {
  if (!notes) return "";
  return `\n\n--- STRATEGIC NOTES FROM PREVIOUS GAMES ---\nThe following are your accumulated strategic observations from prior games in this series. Use these insights to inform your decisions:\n\n${notes}\n--- END STRATEGIC NOTES ---`;
}

const defaultStrategy: PromptStrategy = {
  name: "default",
  description: "Standard strategic prompts with history awareness",
  systemPrompt: `You are a highly competitive Decrypto player. Decrypto is a team-based word game where you must communicate secret codes through word association clues. Your clues must be clever enough for your teammates to decode, but subtle enough that opponents cannot deduce your team's secret keywords over multiple rounds. Every round, opponents see your clues and the revealed codes, building a pattern they can exploit. Balance creativity with consistency.`,
  clueTemplate: (params) => {
    const { keywords, targetCode, history } = params;
    let prompt = `Your team's 4 secret keywords are:
1. ${keywords[0]}
2. ${keywords[1]}
3. ${keywords[2]}
4. ${keywords[3]}

Your secret code this round: ${targetCode.join(", ")}

Give 3 clues (one per code number) that help your teammates identify the correct keywords. Each clue must be a SINGLE WORD — no phrases, numbers, or symbols. Clues cannot be any keyword or share the same root.

Strategic considerations:
- Opponents see your clues and codes each round. Vary your associations to avoid revealing keyword identities.
- Think about what associations you've already used. Don't repeat the same semantic angle for a keyword.
- Consider obscure but valid connections your team can still decode.`;

    if (history.length > 0) {
      prompt += `\n\nPrevious rounds (visible to opponents):\n${formatHistory(history)}`;
      prompt += `\n\nOpponents have seen these patterns. Shift your approach for any keyword you've clued before.`;
    }

    prompt += formatScratchNotes(params.scratchNotes);
    prompt += `\n\nRespond with exactly 3 words separated by commas, nothing else. Example: ocean,bright,ancient`;
    return prompt;
  },
  guessTemplate: (params) => {
    const { keywords, clues, history } = params;
    let prompt = `Your team's keywords are:
1. ${keywords[0]}
2. ${keywords[1]}
3. ${keywords[2]}
4. ${keywords[3]}

Your teammate's clues this round: ${clues.join(", ")}

Each clue maps to one keyword (in order of the secret code). Determine which keyword number (1-4) each clue refers to.`;

    if (history.length > 0) {
      prompt += `\n\nPrevious rounds for reference:\n${formatHistory(history)}`;
      prompt += `\n\nUse your teammate's past cluing patterns to inform your guess.`;
    }

    prompt += formatScratchNotes(params.scratchNotes);
    prompt += `\n\nRespond with exactly 3 numbers (1-4) separated by commas. Example: 3,1,4`;
    return prompt;
  },
  interceptionTemplate: (params) => {
    const { clues, history } = params;
    let prompt = `You are trying to INTERCEPT the opponent's secret code.

Opponent's clues this round: ${clues.join(", ")}

You don't know their keywords, but you can deduce patterns from their clue history.`;

    if (history.length > 0) {
      prompt += `\n\nOpponent's previous rounds:\n${formatHistory(history)}`;
      prompt += `\n\nLook for patterns: clues that are semantically similar likely refer to the same keyword number.`;
    } else {
      prompt += `\n\nThis is round 1 — no history available. Make your best educated guess.`;
    }

    prompt += formatScratchNotes(params.scratchNotes);
    prompt += `\n\nRespond with exactly 3 numbers (1-4) separated by commas. Example: 2,4,1`;
    return prompt;
  },
};

const advancedStrategy: PromptStrategy = {
  name: "advanced",
  description: "Deep reasoning with chain-of-thought, theory-of-mind, and full history analysis",
  systemPrompt: `You are an elite Decrypto strategist with deep expertise in game theory, deception, and linguistic analysis. You approach each decision with rigorous analytical thinking:

1. THEORY OF MIND: Always model what your opponents are thinking. What patterns have they noticed? What would they expect you to do?
2. INFORMATION THEORY: Each clue reveals information. Minimize information leakage to opponents while maximizing signal to teammates.
3. DECEPTION: Actively mislead opponents by varying your semantic angles, using ambiguous associations, and occasionally using unexpected connections.
4. PATTERN ANALYSIS: Track all historical clue-to-code mappings to identify and exploit patterns.

You are playing for high stakes — both interception tokens and miscommunication tokens matter. Play to win.`,
  clueTemplate: (params) => {
    const { keywords, targetCode, history } = params;
    let prompt = `STRATEGIC CLUE GENERATION

Your team's 4 secret keywords:
1. ${keywords[0]}
2. ${keywords[1]}
3. ${keywords[2]}
4. ${keywords[3]}

Secret code this round: ${targetCode.join(", ")}

THINK STEP BY STEP:

Step 1 — Opponent Model: What do opponents know so far? Which keywords might they have partially identified?`;

    if (history.length > 0) {
      prompt += `\n\nFull clue history (opponents have seen ALL of this):\n${formatHistory(history)}`;
      prompt += `\n\nStep 2 — Pattern Exposure Analysis: For each keyword in your code, list all previous clues given for it. How exposed is each keyword? Which semantic categories have been used?`;
      prompt += `\nStep 3 — Deception Strategy: For heavily-exposed keywords, choose a completely different semantic angle. Consider using clues that could plausibly point to MULTIPLE keywords to create ambiguity for opponents.`;
    } else {
      prompt += `\n\nThis is round 1. Choose initial associations that are clear to your team but leave room for variation in future rounds.`;
    }

    prompt += `\nStep 4 — Teammate Communication: Ensure your teammate can still decode. Think about what your teammate knows about your cluing style.
Step 5 — Final Selection: Choose 3 single-word clues that balance teammate clarity with opponent deception.

RULES: Each clue must be a SINGLE WORD. No phrases, numbers, or symbols. Cannot be any keyword or share the same root.`;
    prompt += formatScratchNotes(params.scratchNotes);
    prompt += `\n\nRespond with ONLY 3 words separated by commas, nothing else. Example: ocean,bright,ancient`;
    return prompt;
  },
  guessTemplate: (params) => {
    const { keywords, clues, history } = params;
    let prompt = `STRATEGIC DECODING

Your team's keywords:
1. ${keywords[0]}
2. ${keywords[1]}
3. ${keywords[2]}
4. ${keywords[3]}

Teammate's clues this round: ${clues.join(", ")}

THINK STEP BY STEP:

Step 1 — Direct Association: For each clue, which keyword(s) could it most directly refer to?
Step 2 — Elimination: If multiple clues point to the same keyword, re-evaluate — each code number maps to a different keyword position.`;

    if (history.length > 0) {
      prompt += `\n\nClue history from your team:\n${formatHistory(history)}`;
      prompt += `\nStep 3 — Teammate Style: Based on past rounds, what cluing patterns does your teammate use? Do they prefer synonyms, category associations, or metaphorical links?`;
      prompt += `\nStep 4 — Consistency Check: Does your proposed mapping make sense given your teammate's historical approach?`;
    }

    prompt += formatScratchNotes(params.scratchNotes);
    prompt += `\nStep 5 — Final Answer: Commit to the mapping with highest confidence.

Respond with exactly 3 numbers (1-4) separated by commas. Example: 3,1,4`;
    return prompt;
  },
  interceptionTemplate: (params) => {
    const { clues, history } = params;
    let prompt = `STRATEGIC INTERCEPTION

Opponent's clues this round: ${clues.join(", ")}

THINK STEP BY STEP:

Step 1 — Hypothesis Generation: What could each clue refer to? Generate multiple hypotheses.`;

    if (history.length > 0) {
      prompt += `\n\nOpponent's full clue history:\n${formatHistory(history)}`;
      prompt += `\n
Step 2 — Keyword Clustering: Group all historical clues by likely keyword. Clues in the same position across rounds that share semantic themes likely point to the same keyword.
Step 3 — Keyword Identification: For each cluster, hypothesize the underlying keyword. What word connects all clues in that cluster?
Step 4 — Current Round Mapping: Match each current clue to the most likely keyword cluster.
Step 5 — Confidence Assessment: Rate your confidence for each position. Where you're uncertain, consider which mapping is most consistent with the overall pattern.`;
    } else {
      prompt += `\n\nNo history yet — this is round 1. Use your best intuition about likely word associations.`;
    }

    prompt += formatScratchNotes(params.scratchNotes);
    prompt += `\nStep 6 — Final Interception: Commit to your best guess of their code.

Respond with exactly 3 numbers (1-4) separated by commas. Example: 2,4,1`;
    return prompt;
  },
};

const strategies: Map<string, PromptStrategy> = new Map([
  ["default", defaultStrategy],
  ["advanced", advancedStrategy],
]);

export function getPromptStrategy(name: string): PromptStrategy {
  return strategies.get(name) || defaultStrategy;
}

export function listPromptStrategies(): Array<{ name: string; description: string }> {
  return Array.from(strategies.values()).map(s => ({ name: s.name, description: s.description }));
}
