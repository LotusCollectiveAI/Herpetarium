export interface PromptStrategy {
  name: string;
  description: string;
  systemPrompt: string;
  clueTemplate: (params: ClueTemplateParams) => string;
  guessTemplate: (params: GuessTemplateParams) => string;
  interceptionTemplate: (params: InterceptionTemplateParams) => string;
  deliberationOwnTemplate?: (params: DeliberationOwnTemplateParams) => string;
  deliberationInterceptTemplate?: (params: DeliberationInterceptTemplateParams) => string;
}

import type { AblationFlag } from "@shared/schema";

export interface ClueTemplateParams {
  keywords: string[];
  targetCode: [number, number, number];
  history: Array<{ clues: string[]; targetCode: [number, number, number] }>;
  scratchNotes?: string;
  ablations?: AblationFlag[];
  systemPromptOverride?: string;
  taskDirectives?: string;
}

export interface GuessTemplateParams {
  keywords: string[];
  clues: string[];
  history: Array<{ clues: string[]; targetCode: [number, number, number] }>;
  scratchNotes?: string;
  ablations?: AblationFlag[];
  systemPromptOverride?: string;
  taskDirectives?: string;
}

export interface InterceptionTemplateParams {
  clues: string[];
  history: Array<{ clues: string[]; targetCode: [number, number, number] }>;
  scratchNotes?: string;
  ablations?: AblationFlag[];
  systemPromptOverride?: string;
  taskDirectives?: string;
}

export interface DeliberationOwnTemplateParams {
  team: "amber" | "blue";
  keywords: string[];
  clues: string[];
  history: Array<{ clues: string[]; targetCode: [number, number, number] }>;
  clueGiverName: string;
  currentPlayerName: string;
  otherPlayerName: string;
  conversationSoFar: Array<{ playerName: string; content: string }>;
  exchangeNumber: number;
  roundNumber: number;
  score: { amber: { miscommunication: number; interception: number }; blue: { miscommunication: number; interception: number } };
  scratchNotes?: string;
  ablations?: AblationFlag[];
  systemPromptOverride?: string;
  taskDirectives?: string;
  isPlayerB?: boolean;
}

export interface DeliberationInterceptTemplateParams {
  team: "amber" | "blue";
  opponentTeam: "amber" | "blue";
  clues: string[];
  opponentHistory: Array<{ clues: string[]; targetCode: [number, number, number] }>;
  opponentDeliberationTranscript: Array<{ playerName: string; content: string }>;
  currentPlayerName: string;
  otherPlayerName: string;
  conversationSoFar: Array<{ playerName: string; content: string }>;
  exchangeNumber: number;
  roundNumber: number;
  score: { amber: { miscommunication: number; interception: number }; blue: { miscommunication: number; interception: number } };
  scratchNotes?: string;
  ablations?: AblationFlag[];
  systemPromptOverride?: string;
  taskDirectives?: string;
  isPlayerB?: boolean;
}

interface AblationTarget {
  history?: Array<{ clues: string[]; targetCode: [number, number, number] }>;
  scratchNotes?: string;
}

export function applyAblations<T extends AblationTarget>(
  params: T,
  ablations?: AblationFlag[],
  callType?: "clue" | "guess" | "interception"
): T {
  if (!ablations || ablations.length === 0) return params;

  const result: T = { ...params };

  if (ablations.includes("no_history")) {
    result.history = [];
  }

  if (ablations.includes("no_opponent_history") && callType === "interception") {
    result.history = [];
  }

  if (ablations.includes("no_scratch_notes")) {
    result.scratchNotes = undefined;
  }

  return result;
}

function formatHistory(history: Array<{ clues: string[]; targetCode: [number, number, number] }>): string {
  if (history.length === 0) return "";
  return history.map((round, i) =>
    `Round ${i + 1}: Clues [${round.clues.join(", ")}] → Code [${round.targetCode.join(", ")}]`
  ).join("\n");
}

export function formatScratchNotes(notes?: string): string {
  if (!notes) return "";
  return `\n\n--- STRATEGIC NOTES FROM PREVIOUS GAMES ---\nThe following are your accumulated strategic observations from prior games in this series. Reference and build upon your previous notes when making decisions. Explicitly consider what worked and what failed in prior games before choosing your approach:\n\n${notes}\n--- END STRATEGIC NOTES ---`;
}

// --- Deliberation prompt builders for 3v3 team chatter ---

export function defaultDeliberationOwnFirstTurn(params: DeliberationOwnTemplateParams & { isPlayerB?: boolean }): string {
  const { team, keywords, clues, history, clueGiverName, currentPlayerName, otherPlayerName, roundNumber, score, isPlayerB } = params;
  const opponentTeam = team === "amber" ? "blue" : "amber";
  const ownScore = score[team];
  const oppScore = score[opponentTeam];

  let prompt = `STRATEGIC CODE DECRYPTION -- ROUND ${roundNumber}

You are ${currentPlayerName}, playing Decrypto on team ${team} in a 3-player team.

GAME STATE:
  Score: Team ${team} has ${ownScore.miscommunication} miscommunication tokens and ${ownScore.interception} interception tokens.
         Team ${opponentTeam} has ${oppScore.miscommunication} miscommunication tokens and ${oppScore.interception} interception tokens.
  Round: ${roundNumber}
  Stakes: If you guess your own code WRONG, your team takes a miscommunication token (2 = elimination).
          If the opponents guess your code RIGHT, they earn an interception token (2 = they win).

YOUR TEAM'S SECRET KEYWORDS:
  1. ${keywords[0]}
  2. ${keywords[1]}
  3. ${keywords[2]}
  4. ${keywords[3]}

THIS ROUND'S CLUES (from your clue-giver, ${clueGiverName}):
  Clue 1: ${clues[0]}
  Clue 2: ${clues[1]}
  Clue 3: ${clues[2]}`;

  if (history.length > 0) {
    prompt += `\n\nCLUE HISTORY (your team's previous rounds, visible to opponents):\n${formatHistory(history)}`;
  }

  if (params.taskDirectives) {
    prompt += `\n\nYour team's analytical approach:\n${params.taskDirectives}`;
  }

  prompt += `\n\nYOUR TASK: Work with your teammate ${otherPlayerName} to determine which keyword (1-4) each clue refers to -- i.e., decode the 3-number code your clue-giver is communicating.`;

  if (isPlayerB) {
    prompt += `\n\nANALYTICAL APPROACH: Start by analyzing your clue-giver's history and patterns. How has ${clueGiverName} clued each keyword position before? Look for consistency or deliberate variation in their cluing style. If they used a synonym for keyword 2 last round, did they shift to a lateral association this round? Use the clue history to build a model of how ${clueGiverName} thinks, then apply that model to this round's clues.`;
    prompt += `\n\nTHEORY OF MIND: Your teammate ${otherPlayerName} has already shared their initial analysis. They may have spotted connections you missed -- or they may have been drawn to surface-level associations that mask the real mapping. Consider where their reasoning is strong and where it might have gaps.`;
  } else {
    prompt += `\n\nANALYTICAL APPROACH: Start by analyzing the semantic relationships between each clue and the keywords. For each clue, consider multiple possible keyword mappings before committing to one. What are the strongest associations? Where is there genuine ambiguity? Which mappings can you rule out, and why?`;
    prompt += `\n\nTHEORY OF MIND: What was your clue-giver ${clueGiverName} thinking? Consider their cluing style from previous rounds. Did they tend toward direct synonyms, lateral associations, or category-level connections? How might they have chosen these particular clues to communicate the code while avoiding patterns the opponents have already seen?`;
  }

  prompt += `\n\nCRITICAL -- INFORMATION SECURITY: The opposing team is listening to everything you say. Every word you speak gives them information. When discussing potential keyword-clue mappings, consider whether your reasoning reveals too much about your keywords. You may want to reason abstractly, use indirect references, or even deliberately misdirect. The tension between communicating clearly with ${otherPlayerName} and protecting your keywords from eavesdroppers is the central strategic challenge.`;

  prompt += `\n\nWhen you are confident in your answer, include READY: followed by your guess as three numbers (e.g., READY: 3,1,4). Both you and ${otherPlayerName} must agree and signal READY for the discussion to end.`;

  return prompt;
}

export function defaultDeliberationOwnFollowUp(params: DeliberationOwnTemplateParams & { exchangeNumber: number }): string {
  const { team, keywords, clues, history, clueGiverName, currentPlayerName, otherPlayerName, conversationSoFar, exchangeNumber, roundNumber, score } = params;
  const opponentTeam = team === "amber" ? "blue" : "amber";
  const ownScore = score[team];
  const oppScore = score[opponentTeam];

  let prompt = `STRATEGIC CODE DECRYPTION -- ROUND ${roundNumber}, EXCHANGE ${exchangeNumber}

You are ${currentPlayerName}, playing Decrypto on team ${team}.

GAME STATE:
  Score: Team ${team} has ${ownScore.miscommunication} miscommunication tokens and ${ownScore.interception} interception tokens.
         Team ${opponentTeam} has ${oppScore.miscommunication} miscommunication tokens and ${oppScore.interception} interception tokens.
  Round: ${roundNumber}

YOUR TEAM'S SECRET KEYWORDS:
  1. ${keywords[0]}
  2. ${keywords[1]}
  3. ${keywords[2]}
  4. ${keywords[3]}

THIS ROUND'S CLUES (from ${clueGiverName}):
  Clue 1: ${clues[0]}
  Clue 2: ${clues[1]}
  Clue 3: ${clues[2]}`;

  if (history.length > 0) {
    prompt += `\n\nCLUE HISTORY (your team):\n${formatHistory(history)}`;
  }

  prompt += `\n\nDISCUSSION SO FAR:`;
  for (const msg of conversationSoFar) {
    prompt += `\n  ${msg.playerName}: ${msg.content}`;
  }

  // Summary of last message from other player
  const lastOtherMsg = [...conversationSoFar].reverse().find(m => m.playerName === otherPlayerName);
  if (lastOtherMsg) {
    const summary = lastOtherMsg.content.slice(0, 200);
    prompt += `\n\nYour teammate ${otherPlayerName} just argued: "${summary}"`;
  }

  if (params.taskDirectives) {
    prompt += `\n\nYour team's analytical approach:\n${params.taskDirectives}`;
  }

  prompt += `\n\nNow that you've heard ${otherPlayerName}'s perspective, do you see the mapping differently? What evidence supports or contradicts their interpretation? Consider:
- Are there keyword-clue connections they identified that you overlooked?
- Are there alternative mappings they haven't considered?
- Does the clue history support their reading or yours?

Remember: the opponents are listening. Be thoughtful about what you reveal.`;

  if (exchangeNumber >= 3) {
    prompt += `\n\nYou've been deliberating for several exchanges. If you're converging on an answer, signal READY: X,Y,Z. If genuine disagreement remains, explain what specific evidence would change your mind.`;
  } else {
    prompt += `\n\nWhen you are confident in your answer, include READY: followed by your guess as three numbers (e.g., READY: 3,1,4). Both you and ${otherPlayerName} must agree and signal READY for the discussion to end.`;
  }

  return prompt;
}

export function defaultDeliberationInterceptFirstTurn(params: DeliberationInterceptTemplateParams & { isPlayerB?: boolean }): string {
  const { team, opponentTeam, clues, opponentHistory, opponentDeliberationTranscript, currentPlayerName, otherPlayerName, roundNumber, score, isPlayerB } = params;
  const ownScore = score[team];
  const oppScore = score[opponentTeam];

  let prompt = `STRATEGIC INTERCEPTION -- ROUND ${roundNumber}

You are ${currentPlayerName}, playing Decrypto on team ${team}.

GAME STATE:
  Score: Team ${team} has ${ownScore.miscommunication} miscommunication tokens and ${ownScore.interception} interception tokens.
         Team ${opponentTeam} has ${oppScore.miscommunication} miscommunication tokens and ${oppScore.interception} interception tokens.
  Round: ${roundNumber}
  Stakes: If you correctly intercept the opponent's code, your team earns an interception token (2 = you win).
          A wrong interception has no penalty -- this is a free shot. Be aggressive.

THE OPPOSING TEAM (${opponentTeam}) GAVE THESE CLUES THIS ROUND:
  Clue 1: ${clues[0]}
  Clue 2: ${clues[1]}
  Clue 3: ${clues[2]}

You do NOT know their keywords, but you can deduce patterns from their clue history.`;

  if (opponentHistory.length > 0) {
    prompt += `\n\nOPPONENT CLUE HISTORY (all rounds, all visible):\n${formatHistory(opponentHistory)}`;
  }

  if (opponentDeliberationTranscript && opponentDeliberationTranscript.length > 0) {
    prompt += `\n\n---BEGIN INTERCEPTED OPPONENT TEAM DISCUSSION---`;
    for (const msg of opponentDeliberationTranscript) {
      prompt += `\n${msg.playerName}: ${msg.content}`;
    }
    prompt += `\n---END INTERCEPTED OPPONENT TEAM DISCUSSION---`;

    prompt += `\n\nINTELLIGENCE ANALYSIS DIRECTIVE: Above is the opposing team's full discussion about their own clues this round. You are intelligence analysts intercepting enemy communications. Analyze their reasoning carefully:
- What keyword-clue mappings did they consider? Which did they commit to?
- Did they reveal anything about their keywords -- directly or indirectly?
- Did they attempt to misdirect, or were they being genuine? How can you tell?
- Where were they most confident vs. most uncertain?
- Every slip, every moment of confidence, every topic they avoided is a signal.`;
  }

  if (isPlayerB) {
    prompt += `\n\nYOUR ANALYTICAL FOCUS: Focus on what the opponents DIDN'T say -- what topics did they avoid? What connections did they seem to dance around? If they discussed clue 1 and clue 3 in depth but barely mentioned clue 2, why? Silence and hesitation are often more revealing than explicit statements. Also watch for moments where they seemed to self-censor or redirect -- that's where the information security tension is highest, and where truth leaks through.`;
  } else {
    prompt += `\n\nYOUR ANALYTICAL FOCUS: Focus on what the opponents SAID -- their explicit reasoning, keyword mentions, and confidence levels. Map their stated associations back to the clue history to build hypotheses about their keywords.`;
  }

  if (params.taskDirectives) {
    prompt += `\n\nYour team's analytical approach:\n${params.taskDirectives}`;
  }

  prompt += `\n\nYou and your teammate ${otherPlayerName} are trying to crack the opposing team's code. Discuss what you think each clue maps to.`;

  prompt += `\n\nIMPORTANT: The opposing team can hear your discussion too. Be strategic about what reasoning you reveal -- they may adjust their cluing in future rounds based on what they learn about your interception strategies.`;

  prompt += `\n\nWhen you are confident, include READY: followed by your interception guess as three numbers (e.g., READY: 2,4,1). Both you and ${otherPlayerName} must agree for the discussion to end.`;

  return prompt;
}

export function defaultDeliberationInterceptFollowUp(params: DeliberationInterceptTemplateParams & { exchangeNumber: number }): string {
  const { team, opponentTeam, clues, opponentHistory, opponentDeliberationTranscript, currentPlayerName, otherPlayerName, conversationSoFar, exchangeNumber, roundNumber, score } = params;
  const ownScore = score[team];
  const oppScore = score[opponentTeam];

  let prompt = `STRATEGIC INTERCEPTION -- ROUND ${roundNumber}, EXCHANGE ${exchangeNumber}

You are ${currentPlayerName}, playing Decrypto on team ${team}.

GAME STATE:
  Score: Team ${team} has ${ownScore.miscommunication} miscommunication tokens and ${ownScore.interception} interception tokens.
         Team ${opponentTeam} has ${oppScore.miscommunication} miscommunication tokens and ${oppScore.interception} interception tokens.
  Round: ${roundNumber}

THE OPPOSING TEAM (${opponentTeam}) GAVE THESE CLUES THIS ROUND:
  Clue 1: ${clues[0]}
  Clue 2: ${clues[1]}
  Clue 3: ${clues[2]}`;

  if (opponentHistory.length > 0) {
    prompt += `\n\nOPPONENT CLUE HISTORY:\n${formatHistory(opponentHistory)}`;
  }

  if (opponentDeliberationTranscript && opponentDeliberationTranscript.length > 0) {
    prompt += `\n\n---BEGIN INTERCEPTED OPPONENT TEAM DISCUSSION---`;
    for (const msg of opponentDeliberationTranscript) {
      prompt += `\n${msg.playerName}: ${msg.content}`;
    }
    prompt += `\n---END INTERCEPTED OPPONENT TEAM DISCUSSION---`;
  }

  prompt += `\n\nDISCUSSION SO FAR:`;
  for (const msg of conversationSoFar) {
    prompt += `\n  ${msg.playerName}: ${msg.content}`;
  }

  // Summary of last message from other player
  const lastOtherMsg = [...conversationSoFar].reverse().find(m => m.playerName === otherPlayerName);
  if (lastOtherMsg) {
    const summary = lastOtherMsg.content.slice(0, 200);
    prompt += `\n\nYour teammate ${otherPlayerName} just argued: "${summary}"`;
  }

  if (params.taskDirectives) {
    prompt += `\n\nYour team's analytical approach:\n${params.taskDirectives}`;
  }

  prompt += `\n\nConsider their reasoning -- did they spot a signal in the opponent's discussion that you missed? Revisit the intercepted transcript. What patterns emerge when you combine your analysis with theirs?

Remember: the opponents are listening to your interception discussion too. Be strategic.`;

  if (exchangeNumber >= 3) {
    prompt += `\n\nYou've been deliberating for several exchanges. If you're converging on an answer, signal READY: X,Y,Z. If genuine disagreement remains, explain what specific evidence would change your mind.`;
  } else {
    prompt += `\n\nWhen you are confident, include READY: followed by your interception guess as three numbers (e.g., READY: 2,4,1). Both you and ${otherPlayerName} must agree for the discussion to end.`;
  }

  return prompt;
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

Give 3 clues (one per code number) that help your teammates identify the correct keywords. Each clue must be a complete, real English word. No abbreviations, acronyms, fragments, or prefixes. No phrases, numbers, or symbols. Clues cannot be any keyword or share the same root.

Strategic considerations:
- Opponents see your clues and codes each round. Vary your associations to avoid revealing keyword identities.
- Think about what associations you've already used. Don't repeat the same semantic angle for a keyword.
- Consider obscure but valid connections your team can still decode.`;

    if (history.length > 0) {
      prompt += `\n\nPrevious rounds (visible to opponents):\n${formatHistory(history)}`;
      prompt += `\n\nOpponents have seen these patterns. Shift your approach for any keyword you've clued before.`;
    }

    if (params.taskDirectives) {
      prompt += `\n\nYour team's strategic approach:\n${params.taskDirectives}`;
    }

    prompt += formatScratchNotes(params.scratchNotes);
    prompt += `\n\nANSWER: Respond with exactly 3 words separated by commas on a line starting with "ANSWER:". Example:\nANSWER: ocean,bright,ancient`;
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

    if (params.taskDirectives) {
      prompt += `\n\nYour team's strategic approach:\n${params.taskDirectives}`;
    }

    prompt += formatScratchNotes(params.scratchNotes);
    prompt += `\n\nANSWER: Respond with exactly 3 numbers (1-4) separated by commas on a line starting with "ANSWER:". Example:\nANSWER: 3,1,4`;
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

    if (params.taskDirectives) {
      prompt += `\n\nYour team's strategic approach:\n${params.taskDirectives}`;
    }

    prompt += formatScratchNotes(params.scratchNotes);
    prompt += `\n\nANSWER: Respond with exactly 3 numbers (1-4) separated by commas on a line starting with "ANSWER:". Example:\nANSWER: 2,4,1`;
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

RULES: Each clue must be a complete, real English word. No abbreviations, acronyms, fragments, or prefixes. No phrases, numbers, or symbols. Cannot be any keyword or share the same root.`;
    if (params.taskDirectives) {
      prompt += `\n\nYour team's strategic approach:\n${params.taskDirectives}`;
    }
    prompt += formatScratchNotes(params.scratchNotes);
    prompt += `\n\nPut your final answer on its own line starting with "ANSWER:". Respond with ONLY 3 words separated by commas. Example:\nANSWER: ocean,bright,ancient`;
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

    if (params.taskDirectives) {
      prompt += `\n\nYour team's strategic approach:\n${params.taskDirectives}`;
    }

    prompt += formatScratchNotes(params.scratchNotes);
    prompt += `\nStep 5 — Final Answer: Commit to the mapping with highest confidence.

Put your final answer on its own line starting with "ANSWER:". Example:\nANSWER: 3,1,4`;
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

    if (params.taskDirectives) {
      prompt += `\n\nYour team's strategic approach:\n${params.taskDirectives}`;
    }

    prompt += formatScratchNotes(params.scratchNotes);
    prompt += `\nStep 6 — Final Interception: Commit to your best guess of their code.

Put your final answer on its own line starting with "ANSWER:". Example:\nANSWER: 2,4,1`;
    return prompt;
  },
};

import { kLevelStrategy } from "./kLevelStrategy";
import { enrichedStrategy } from "./enrichedStrategy";

const strategies: Map<string, PromptStrategy> = new Map([
  ["default", defaultStrategy],
  ["advanced", advancedStrategy],
  ["k-level", kLevelStrategy],
  ["enriched", enrichedStrategy],
]);

export function getPromptStrategy(name: string): PromptStrategy {
  return strategies.get(name) || defaultStrategy;
}

export function listPromptStrategies(): Array<{ name: string; description: string }> {
  return Array.from(strategies.values()).map(s => ({ name: s.name, description: s.description }));
}
