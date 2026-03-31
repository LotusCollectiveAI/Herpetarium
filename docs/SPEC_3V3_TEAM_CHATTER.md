# SPEC: 3v3 Team Deliberation ("Team Chatter")

**Status:** Draft
**Author:** Auto-generated from architecture review
**Date:** 2026-03-30
**Depends on:** Current 2v2 headless runner, ai.ts call infrastructure, prompt strategies

---

## 1. Overview

This spec adds 3-player teams (3v3) to Decrypto Arena with multi-turn intra-team deliberation. In 3v3 mode, each round designates one player as clue-giver and two as guessers. The two guessers engage in an open-ended, multi-turn conversation to collaboratively decode their team's clues (own-team deliberation) and crack the opponent's code (opponent deliberation).

**The defining design choice: all deliberation is PUBLIC.** The opposing team sees the full transcript of the other team's discussion. This forces models to reason strategically about what they reveal in conversation -- they cannot simply say "clue X obviously maps to keyword Y" without handing the opponents information. This tension between clear team communication and information security is the core emergent dynamic this feature creates.

Deliberation replaces the single-shot guess. There is no separate "guessing" phase -- the deliberation phase itself produces the guess via consensus signaling.

---

## 2. Phase Flow

### Current (2v2):
```
giving_clues -> own_team_guessing -> opponent_intercepting -> round_results
```

### New (3v3):
```
giving_clues -> own_team_deliberation -> opponent_deliberation -> round_results
```

- **own_team_deliberation**: For each team, the 2 non-clue-givers discuss what code their clue-giver intended. Produces the own-team guess. Amber and blue deliberations run in parallel (Promise.all) since they are independent.
- **opponent_deliberation**: For each team, the same 2 non-clue-givers discuss what code the *opposing* clue-giver intended. They have access to the opposing team's own_team_deliberation transcript (public chatter). Produces the interception guess.

### Backward compatibility (2v2):
When `teamSize` is 2 (the default), the phase flow remains unchanged. Deliberation phases are skipped entirely and the existing single-shot `processGuesses` / `processInterceptions` run as before.

---

## 3. Schema Changes

### 3.1 New GamePhase values

**File: `shared/schema.ts`**

Add two new phases to the `GamePhase` type and all places it appears as a z.enum:

```typescript
export type GamePhase =
  | "lobby"
  | "team_setup"
  | "giving_clues"
  | "own_team_deliberation"    // NEW
  | "own_team_guessing"
  | "opponent_deliberation"     // NEW
  | "opponent_intercepting"
  | "round_results"
  | "game_over";
```

Update the `gameStateSchema.phase` z.enum, `serverMessageSchema` phase_changed z.enum, and all other z.enum references to include the two new values. The old phases (`own_team_guessing`, `opponent_intercepting`) remain for 2v2 backward compatibility.

### 3.2 New `teamSize` field on HeadlessMatchConfig

**File: `shared/schema.ts`**

```typescript
export interface HeadlessMatchConfig {
  players: Array<{
    name: string;
    aiProvider: AIProvider;
    team: "amber" | "blue";
    aiConfig?: AIPlayerConfig;
  }>;
  fastMode?: boolean;
  seed?: string;
  ablations?: HeadlessMatchAblations;
  experimentId?: string;
  teamSize?: 2 | 3;  // NEW -- default 2 for backward compat
}
```

### 3.3 Raise max players from 4 to 6

**File: `server/game.ts` -- `addPlayer()`**

```typescript
// Change:
if (game.players.length >= 4) {
// To:
if (game.players.length >= 6) {
```

**File: `server/routes.ts` -- headlessMatchConfigSchema**

```typescript
// Change:
players: z.array(...).min(2).max(4),
// To:
players: z.array(...).min(2).max(6),
```

Add teamSize to the schema:
```typescript
teamSize: z.enum(["2", "3"]).transform(Number).optional(),
// Or simply:
teamSize: z.number().int().min(2).max(3).optional(),
```

### 3.4 New `team_chatter` database table

**File: `shared/schema.ts`**

```typescript
export const teamChatter = pgTable("team_chatter", {
  id: serial("id").primaryKey(),
  matchId: integer("match_id").notNull(),
  gameId: varchar("game_id", { length: 10 }).notNull(),
  roundNumber: integer("round_number").notNull(),
  team: varchar("team", { length: 10 }).notNull(),
  phase: varchar("phase", { length: 40 }).notNull(), // "own_guess_deliberation" | "opponent_intercept_deliberation"
  messages: jsonb("messages").notNull(), // ChatterMessage[]
  totalExchanges: integer("total_exchanges").notNull().default(0),
  consensusReached: boolean("consensus_reached").notNull().default(false),
  finalAnswer: jsonb("final_answer"), // [number, number, number] | null
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertTeamChatterSchema = createInsertSchema(teamChatter).omit({ id: true, createdAt: true });
export type InsertTeamChatter = z.infer<typeof insertTeamChatterSchema>;
export type TeamChatter = typeof teamChatter.$inferSelect;
```

### 3.5 ChatterMessage type

**File: `shared/schema.ts`**

```typescript
export interface ChatterMessage {
  playerId: string;
  playerName: string;
  content: string;
  timestamp: string;          // ISO 8601
  exchangeNumber: number;     // 0-indexed exchange this message belongs to (for time-series analysis)
  model: string;
  latencyMs: number;
  promptTokens?: number;
  completionTokens?: number;
  reasoningTokens?: number;
  estimatedCostUsd?: string;
  readySignal?: [number, number, number] | null;  // Extracted READY signal, if present
}
```

### 3.6 GameState -- no deliberation-specific additions

The opponent deliberation transcript is passed directly via `processDeliberation` parameters (the `opponentDeliberationTranscript` field on `DeliberationContext`). No `currentDeliberation` field is needed on `GameState`.

---

## 4. Migration SQL

```sql
-- New team_chatter table
CREATE TABLE IF NOT EXISTS team_chatter (
  id SERIAL PRIMARY KEY,
  match_id INTEGER NOT NULL,
  game_id VARCHAR(10) NOT NULL,
  round_number INTEGER NOT NULL,
  team VARCHAR(10) NOT NULL,
  phase VARCHAR(40) NOT NULL,
  messages JSONB NOT NULL DEFAULT '[]',
  total_exchanges INTEGER NOT NULL DEFAULT 0,
  consensus_reached BOOLEAN NOT NULL DEFAULT false,
  final_answer JSONB,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_team_chatter_match_id ON team_chatter (match_id);
CREATE INDEX idx_team_chatter_game_round ON team_chatter (game_id, round_number);

-- Add teamSize to matches for query filtering
ALTER TABLE matches ADD COLUMN IF NOT EXISTS team_size INTEGER NOT NULL DEFAULT 2;
CREATE INDEX idx_matches_team_size ON matches (team_size);
```

---

## 5. Deliberation Protocol

### 5.1 Consensus signaling

Models signal readiness by including a `READY:` token in their message:

```
READY: 3,1,4
```

Rules:
- **Both players must signal READY for deliberation to end.** If Player A signals READY but Player B disagrees, discussion continues. Player A may revise their READY signal in a subsequent message.
- The **last READY signal** from each player is the one that counts. Players can change their mind.
- When both players have signaled READY with the **same answer**, deliberation ends immediately.
- When both players have signaled READY with **different answers**, discussion continues -- they may revise their READY signals in subsequent messages. If they still disagree after 2 additional exchanges, the answer from the **last player to signal READY** is used (recency = conviction).
- Maximum **10 exchange rounds** (20 total messages: 10 per player) as a safety cap. This is a ceiling, not a target. Models naturally self-terminate much sooner.
- If the safety cap is hit without consensus, the most recent READY signal from either player is used. If no READY signal exists at all, fall back to `[1, 2, 3]`.

### 5.2 Turn structure

Deliberation alternates strictly between the two guessers:
1. Player A speaks (turn 1)
2. Player B responds (turn 2)
3. Player A responds (turn 3)
4. ...and so on

The order of Player A / Player B is determined by player array order within the team (stable across rounds). The clue-giver rotates each round, so the two guessers change each round, but within a given round the alternation order is fixed.

### 5.3 READY signal parsing

Extract READY signals with:
```typescript
function parseReadySignal(content: string): [number, number, number] | null {
  const match = content.match(/READY:\s*([1-4])\s*,\s*([1-4])\s*,\s*([1-4])/i);
  if (!match) return null;
  return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
}
```

---

## 6. Deliberation Prompt Design

### 6.1 System prompt for deliberation

Use the same system prompt from the player's configured `promptStrategy`. The deliberation is just another context in which the model reasons about Decrypto -- no separate "chatter personality" needed.

### 6.2 Own-team deliberation prompts

The default deliberation prompt builders live as exported functions in `promptStrategies.ts`. The headlessRunner calls these functions rather than hardcoding prompt text. See section 11 for the full interface and integration pattern.

**Player A first turn -- `defaultDeliberationOwnFirstTurn()`:**

```
STRATEGIC CODE DECRYPTION -- ROUND {roundNumber}

You are {currentPlayerName}, playing Decrypto on team {team} in a 3-player team.

GAME STATE:
  Score: Team {team} has {ownMiscomm} miscommunication tokens and {ownIntercept} interception tokens.
         Team {opponentTeam} has {oppMiscomm} miscommunication tokens and {oppIntercept} interception tokens.
  Round: {roundNumber} of {maxRounds}
  Stakes: If you guess your own code WRONG, your team takes a miscommunication token (2 = elimination).
          If the opponents guess your code RIGHT, they earn an interception token (2 = they win).

YOUR TEAM'S SECRET KEYWORDS:
  1. {keyword1}
  2. {keyword2}
  3. {keyword3}
  4. {keyword4}

THIS ROUND'S CLUES (from your clue-giver, {clueGiverName}):
  Clue 1: {clue1}
  Clue 2: {clue2}
  Clue 3: {clue3}

{if history.length > 0}
CLUE HISTORY (your team's previous rounds, visible to opponents):
{formatHistory(history)}
{/if}

YOUR TASK: Work with your teammate {otherPlayerName} to determine which keyword (1-4) each clue refers to -- i.e., decode the 3-number code your clue-giver is communicating.

ANALYTICAL APPROACH: Start by analyzing the semantic relationships between each clue and the keywords. For each clue, consider multiple possible keyword mappings before committing to one. What are the strongest associations? Where is there genuine ambiguity? Which mappings can you rule out, and why?

THEORY OF MIND: What was your clue-giver {clueGiverName} thinking? Consider their cluing style from previous rounds. Did they tend toward direct synonyms, lateral associations, or category-level connections? How might they have chosen these particular clues to communicate the code while avoiding patterns the opponents have already seen?

CRITICAL -- INFORMATION SECURITY: The opposing team is listening to everything you say. Every word you speak gives them information. When discussing potential keyword-clue mappings, consider whether your reasoning reveals too much about your keywords. You may want to reason abstractly, use indirect references, or even deliberately misdirect. The tension between communicating clearly with {otherPlayerName} and protecting your keywords from eavesdroppers is the central strategic challenge.

When you are confident in your answer, include READY: followed by your guess as three numbers (e.g., READY: 3,1,4). Both you and {otherPlayerName} must agree and signal READY for the discussion to end.
```

**Player B first turn -- `defaultDeliberationOwnFirstTurn()` with `isPlayerB: true`:**

Same header and game state, but the analytical lens differs:

```
{...same header, game state, keywords, clues, history as Player A...}

YOUR TASK: Work with your teammate {otherPlayerName} to determine which keyword (1-4) each clue refers to -- i.e., decode the 3-number code your clue-giver is communicating.

ANALYTICAL APPROACH: Start by analyzing your clue-giver's history and patterns. How has {clueGiverName} clued each keyword position before? Look for consistency or deliberate variation in their cluing style. If they used a synonym for keyword 2 last round, did they shift to a lateral association this round? Use the clue history to build a model of how {clueGiverName} thinks, then apply that model to this round's clues.

THEORY OF MIND: Your teammate {otherPlayerName} has already shared their initial analysis. They may have spotted connections you missed -- or they may have been drawn to surface-level associations that mask the real mapping. Consider where their reasoning is strong and where it might have gaps.

CRITICAL -- INFORMATION SECURITY: The opposing team is listening to everything you say. Every word you speak gives them information. When discussing potential keyword-clue mappings, consider whether your reasoning reveals too much about your keywords. You may want to reason abstractly, use indirect references, or even deliberately misdirect. The tension between communicating clearly with {otherPlayerName} and protecting your keywords from eavesdroppers is the central strategic challenge.

When you are confident in your answer, include READY: followed by your guess as three numbers (e.g., READY: 3,1,4). Both you and {otherPlayerName} must agree and signal READY for the discussion to end.
```

### 6.3 Own-team deliberation prompts (subsequent turns) -- `defaultDeliberationOwnFollowUp()`

Each subsequent turn re-injects the full game context AND provides specific hooks into the conversation:

```
STRATEGIC CODE DECRYPTION -- ROUND {roundNumber}, EXCHANGE {exchangeNumber}

You are {currentPlayerName}, playing Decrypto on team {team}.

GAME STATE:
  Score: Team {team} has {ownMiscomm} miscommunication tokens and {ownIntercept} interception tokens.
         Team {opponentTeam} has {oppMiscomm} miscommunication tokens and {oppIntercept} interception tokens.
  Round: {roundNumber}

YOUR TEAM'S SECRET KEYWORDS:
  1. {keyword1}
  2. {keyword2}
  3. {keyword3}
  4. {keyword4}

THIS ROUND'S CLUES (from {clueGiverName}):
  Clue 1: {clue1}
  Clue 2: {clue2}
  Clue 3: {clue3}

{if history.length > 0}
CLUE HISTORY (your team):
{formatHistory(history)}
{/if}

DISCUSSION SO FAR:
{for each message in conversationSoFar}
  {message.playerName}: {message.content}
{/for}

Your teammate {otherPlayerName} just argued: "{summary of otherPlayer's last message, first ~200 chars}"

Now that you've heard {otherPlayerName}'s perspective, do you see the mapping differently? What evidence supports or contradicts their interpretation? Consider:
- Are there keyword-clue connections they identified that you overlooked?
- Are there alternative mappings they haven't considered?
- Does the clue history support their reading or yours?

Remember: the opponents are listening. Be thoughtful about what you reveal.

{if exchangeNumber >= 3}
You've been deliberating for several exchanges. If you're converging on an answer, signal READY: X,Y,Z. If genuine disagreement remains, explain what specific evidence would change your mind.
{else}
When you are confident in your answer, include READY: followed by your guess as three numbers (e.g., READY: 3,1,4). Both you and {otherPlayerName} must agree and signal READY for the discussion to end.
{/if}
```

### 6.4 Opponent deliberation prompt (interception, first turn)

**Player A -- `defaultDeliberationInterceptFirstTurn()`:**

```
STRATEGIC INTERCEPTION -- ROUND {roundNumber}

You are {currentPlayerName}, playing Decrypto on team {team}.

GAME STATE:
  Score: Team {team} has {ownMiscomm} miscommunication tokens and {ownIntercept} interception tokens.
         Team {opponentTeam} has {oppMiscomm} miscommunication tokens and {oppIntercept} interception tokens.
  Round: {roundNumber}
  Stakes: If you correctly intercept the opponent's code, your team earns an interception token (2 = you win).
          A wrong interception has no penalty -- this is a free shot. Be aggressive.

THE OPPOSING TEAM ({opponentTeam}) GAVE THESE CLUES THIS ROUND:
  Clue 1: {clue1}
  Clue 2: {clue2}
  Clue 3: {clue3}

You do NOT know their keywords, but you can deduce patterns from their clue history.

{if opponentHistory.length > 0}
OPPONENT CLUE HISTORY (all rounds, all visible):
{formatHistory(opponentHistory)}
{/if}

{if opponentDeliberationTranscript}
---BEGIN INTERCEPTED OPPONENT TEAM DISCUSSION---
{full transcript of opponent's own_team_deliberation}
---END INTERCEPTED OPPONENT TEAM DISCUSSION---

INTELLIGENCE ANALYSIS DIRECTIVE: Above is the opposing team's full discussion about their own clues this round. You are intelligence analysts intercepting enemy communications. Analyze their reasoning carefully:
- What keyword-clue mappings did they consider? Which did they commit to?
- Did they reveal anything about their keywords -- directly or indirectly?
- Did they attempt to misdirect, or were they being genuine? How can you tell?
- Where were they most confident vs. most uncertain?
- Every slip, every moment of confidence, every topic they avoided is a signal.
{/if}

YOUR ANALYTICAL FOCUS: Focus on what the opponents SAID -- their explicit reasoning, keyword mentions, and confidence levels. Map their stated associations back to the clue history to build hypotheses about their keywords.

You and your teammate {otherPlayerName} are trying to crack the opposing team's code. Discuss what you think each clue maps to.

IMPORTANT: The opposing team can hear your discussion too. Be strategic about what reasoning you reveal -- they may adjust their cluing in future rounds based on what they learn about your interception strategies.

When you are confident, include READY: followed by your interception guess as three numbers (e.g., READY: 2,4,1). Both you and {otherPlayerName} must agree for the discussion to end.
```

**Player B -- `defaultDeliberationInterceptFirstTurn()` with `isPlayerB: true`:**

Same header, game state, clues, history, and intercepted transcript, but different analytical lens:

```
{...same header, game state, clues, history, transcript as Player A...}

YOUR ANALYTICAL FOCUS: Focus on what the opponents DIDN'T say -- what topics did they avoid? What connections did they seem to dance around? If they discussed clue 1 and clue 3 in depth but barely mentioned clue 2, why? Silence and hesitation are often more revealing than explicit statements. Also watch for moments where they seemed to self-censor or redirect -- that's where the information security tension is highest, and where truth leaks through.

You and your teammate {otherPlayerName} are trying to crack the opposing team's code. Discuss what you think each clue maps to.

IMPORTANT: The opposing team can hear your discussion too. Be strategic about what reasoning you reveal -- they may adjust their cluing in future rounds based on what they learn about your interception strategies.

When you are confident, include READY: followed by your interception guess as three numbers (e.g., READY: 2,4,1). Both you and {otherPlayerName} must agree for the discussion to end.
```

### 6.5 Opponent deliberation prompt (interception, follow-up turns) -- `defaultDeliberationInterceptFollowUp()`

```
STRATEGIC INTERCEPTION -- ROUND {roundNumber}, EXCHANGE {exchangeNumber}

You are {currentPlayerName}, playing Decrypto on team {team}.

GAME STATE:
  Score: Team {team} has {ownMiscomm} miscommunication tokens and {ownIntercept} interception tokens.
         Team {opponentTeam} has {oppMiscomm} miscommunication tokens and {oppIntercept} interception tokens.
  Round: {roundNumber}

THE OPPOSING TEAM ({opponentTeam}) GAVE THESE CLUES THIS ROUND:
  Clue 1: {clue1}
  Clue 2: {clue2}
  Clue 3: {clue3}

{if opponentHistory.length > 0}
OPPONENT CLUE HISTORY:
{formatHistory(opponentHistory)}
{/if}

{if opponentDeliberationTranscript}
---BEGIN INTERCEPTED OPPONENT TEAM DISCUSSION---
{full transcript of opponent's own_team_deliberation}
---END INTERCEPTED OPPONENT TEAM DISCUSSION---
{/if}

DISCUSSION SO FAR:
{for each message in conversationSoFar}
  {message.playerName}: {message.content}
{/for}

Your teammate {otherPlayerName} just argued: "{summary of otherPlayer's last message, first ~200 chars}"

Consider their reasoning -- did they spot a signal in the opponent's discussion that you missed? Revisit the intercepted transcript. What patterns emerge when you combine your analysis with theirs?

Remember: the opponents are listening to your interception discussion too. Be strategic.

{if exchangeNumber >= 3}
You've been deliberating for several exchanges. If you're converging on an answer, signal READY: X,Y,Z. If genuine disagreement remains, explain what specific evidence would change your mind.
{else}
When you are confident, include READY: followed by your interception guess as three numbers (e.g., READY: 2,4,1). Both you and {otherPlayerName} must agree for the discussion to end.
{/if}
```

### 6.6 What the prompts do NOT contain

- No instruction to "be brief" or "keep it concise"
- No instruction to "limit your response to N words"
- No instruction about how many turns to take
- No meta-instructions about "good deliberation style"
- No moderator, facilitator, or summarizer role

---

## 7. New Function: `processDeliberation()`

**File: `server/headlessRunner.ts`**

This is the core new function. It manages the multi-turn conversation loop for a single team in a single deliberation phase.

### 7.1 Signature

```typescript
interface DeliberationContext {
  team: "amber" | "blue";
  phase: "own_guess_deliberation" | "opponent_intercept_deliberation";
  clues: string[];
  keywords?: string[];                    // Own team's keywords (for own-team deliberation)
  teamHistory: Array<{ clues: string[]; targetCode: [number, number, number] }>;
  opponentHistory?: Array<{ clues: string[]; targetCode: [number, number, number] }>;
  opponentDeliberationTranscript?: ChatterMessage[];  // For intercept phase
  clueGiverName: string;
  guessers: [Player, Player];             // The two deliberating players
  scratchNotes?: Record<string, string>;
  ablations?: AblationFlag[];
  teamSystemPrompts?: Record<string, string>;
  roundNumber: number;
  score: { amber: { miscommunication: number; interception: number }; blue: { miscommunication: number; interception: number } };
}

interface DeliberationResult {
  answer: [number, number, number];
  messages: ChatterMessage[];
  totalExchanges: number;
  consensusReached: boolean;
}

async function processDeliberation(
  context: DeliberationContext,
  matchId: number,
  gameId: string,
  roundNumber: number,
): Promise<DeliberationResult>
```

### 7.2 Implementation pseudocode

```typescript
import {
  defaultDeliberationOwnFirstTurn,
  defaultDeliberationOwnFollowUp,
  defaultDeliberationInterceptFirstTurn,
  defaultDeliberationInterceptFollowUp,
} from "./promptStrategies";

async function processDeliberation(
  context: DeliberationContext,
  matchId: number,
  gameId: string,
  roundNumber: number,
): Promise<DeliberationResult> {
  const MAX_EXCHANGES = 10;  // 10 rounds = 20 messages max
  const messages: ChatterMessage[] = [];

  // Track each player's latest READY signal
  let readySignals: Map<string, [number, number, number]> = new Map();

  // Alternate between the two guessers
  const [playerA, playerB] = context.guessers;

  for (let exchange = 0; exchange < MAX_EXCHANGES; exchange++) {
    for (const [idx, [currentPlayer, otherPlayer]] of [[playerA, playerB], [playerB, playerA]].entries()) {
      const isPlayerB = idx === 1;

      // Build the prompt using strategy functions from promptStrategies.ts
      // The player's configured promptStrategy may override these defaults
      const strategy = getPromptStrategy(currentPlayer.aiConfig?.promptStrategy || "default");
      let prompt: string;

      if (context.phase === "own_guess_deliberation") {
        if (messages.length === 0 || (messages.length === 1 && isPlayerB)) {
          // First turn -- use strategy override or default
          const builder = strategy.deliberationOwnTemplate
            ? strategy.deliberationOwnTemplate
            : (params) => defaultDeliberationOwnFirstTurn({ ...params, isPlayerB });
          prompt = builder({ ...buildTemplateParams(context, currentPlayer, otherPlayer, messages, exchange) });
        } else {
          prompt = defaultDeliberationOwnFollowUp(
            buildTemplateParams(context, currentPlayer, otherPlayer, messages, exchange)
          );
        }
      } else {
        if (messages.length === 0 || (messages.length === 1 && isPlayerB)) {
          const builder = strategy.deliberationInterceptTemplate
            ? strategy.deliberationInterceptTemplate
            : (params) => defaultDeliberationInterceptFirstTurn({ ...params, isPlayerB });
          prompt = builder({ ...buildTemplateParams(context, currentPlayer, otherPlayer, messages, exchange) });
        } else {
          prompt = defaultDeliberationInterceptFollowUp(
            buildTemplateParams(context, currentPlayer, otherPlayer, messages, exchange)
          );
        }
      }

      // Append scratch notes
      const noteKey = `${currentPlayer.aiProvider}-${context.team}`;
      if (context.scratchNotes?.[noteKey]) {
        prompt += formatScratchNotes(context.scratchNotes[noteKey]);
      }

      const config = getConfigForPlayer(currentPlayer);
      const systemPrompt = getDeliberationSystemPrompt(config, context);

      const startTime = Date.now();
      const raw = await callAI(config, systemPrompt, prompt);
      const latencyMs = Date.now() - startTime;

      // Parse READY signal if present
      const readySignal = parseReadySignal(raw.text);
      if (readySignal) {
        readySignals.set(currentPlayer.id, readySignal);
      }

      const message: ChatterMessage = {
        playerId: currentPlayer.id,
        playerName: currentPlayer.name,
        content: raw.text,
        timestamp: new Date().toISOString(),
        exchangeNumber: exchange,
        model: config.model,
        latencyMs,
        promptTokens: raw.promptTokens,
        completionTokens: raw.completionTokens,
        reasoningTokens: raw.reasoningTokens ?? undefined,
        estimatedCostUsd: estimateCost(config.model, raw.promptTokens, raw.completionTokens),
        readySignal,
      };
      messages.push(message);

      // Log to ai_call_logs
      const actionType = context.phase === "own_guess_deliberation"
        ? "deliberation_own"
        : "deliberation_intercept";
      await logAiCall(matchId, gameId, roundNumber, currentPlayer.aiProvider!, actionType, {
        result: raw.text,
        prompt: `${systemPrompt}\n\n${prompt}`,
        rawResponse: raw.text,
        model: config.model,
        latencyMs,
        reasoningTrace: raw.reasoningTrace,
        parseQuality: "clean",
        promptTokens: raw.promptTokens,
        completionTokens: raw.completionTokens,
        totalTokens: raw.totalTokens,
        estimatedCostUsd: estimateCost(config.model, raw.promptTokens, raw.completionTokens),
      }, false, false);

      // Check consensus: both players READY with same answer
      if (readySignals.size === 2) {
        const [answerA, answerB] = [...readySignals.values()];
        if (arraysEqual(answerA, answerB)) {
          // Consensus reached
          return {
            answer: answerA,
            messages,
            totalExchanges: exchange + 1,
            consensusReached: true,
          };
        }
      }
    }
  }

  // Safety cap reached -- extract best answer
  // Priority: last READY signal from either player, or fallback
  const lastReady = [...readySignals.values()].pop() || [1, 2, 3] as [number, number, number];

  return {
    answer: lastReady,
    messages,
    totalExchanges: MAX_EXCHANGES,
    consensusReached: false,
  };
}
```

### 7.3 Prompt building helper

```typescript
function buildTemplateParams(
  context: DeliberationContext,
  currentPlayer: Player,
  otherPlayer: Player,
  conversationSoFar: ChatterMessage[],
  exchangeNumber: number,
): DeliberationOwnTemplateParams | DeliberationInterceptTemplateParams {
  // Constructs the full params object from context, including:
  // - team, keywords, clues, history, score, roundNumber
  // - currentPlayerName, otherPlayerName, clueGiverName
  // - conversationSoFar (formatted as { playerName, content }[])
  // - exchangeNumber
  // - opponentDeliberationTranscript (for intercept phase)
  // - ablations, systemPromptOverride, scratchNotes
}
```

Every message in the conversation is included verbatim. No summarization. No truncation.

### 7.4 Token budgets

Use the same token budgets as existing game actions:
- For non-thinking models: `max_tokens: 8192` (same as current clue/guess generation)
- For thinking models: use the existing thinking budget tables (`ANTHROPIC_THINKING_BUDGET`, `GEMINI_THINKING_BUDGET`) based on the player's `reasoningEffort` config
- `timeoutMs`: use the player's configured `timeoutMs` for **each individual message** in the deliberation, not for the entire deliberation

These are the same budgets used throughout the platform. No special reduction for deliberation.

---

## 8. Headless Runner Changes

**File: `server/headlessRunner.ts`**

### 8.1 Updated main loop

```typescript
export async function runHeadlessMatch(config: HeadlessMatchConfig, ...): Promise<HeadlessResult> {
  // ... existing setup code ...

  const teamSize = config.teamSize || 2;

  while (game.phase !== "game_over" && game.round < MAX_ROUNDS) {
    game = startNewRound(game, rng);
    log(`[headless] Match ${matchId} - Round ${game.round}`, "headless");

    game = await processClues(game, matchId, scratchNotesMap, ablations, teamSystemPrompts);

    if (teamSize === 3) {
      // 3v3 mode: deliberation replaces single-shot guess/intercept

      // Phase: own_team_deliberation
      // Run amber and blue deliberations in PARALLEL -- they are independent
      game = { ...game, phase: "own_team_deliberation" as GamePhase };

      const buildOwnDelibContext = (team: "amber" | "blue"): DeliberationContext | null => {
        const clueGiverId = game.currentClueGiver[team]!;
        const teamPlayers = game.players.filter(p => p.team === team);
        const guessers = teamPlayers.filter(p => p.id !== clueGiverId);
        if (guessers.length < 2) {
          log(`[headless] Match ${matchId} - Team ${team} has <2 guessers, falling back to single-shot`, "headless");
          return null;
        }
        return {
          team,
          phase: "own_guess_deliberation",
          clues: game.currentClues[team]!,
          keywords: game.teams[team].keywords,
          teamHistory: game.teams[team].history.map(h => ({ clues: h.clues, targetCode: h.targetCode })),
          clueGiverName: teamPlayers.find(p => p.id === clueGiverId)!.name,
          guessers: [guessers[0], guessers[1]] as [Player, Player],
          scratchNotes: scratchNotesMap,
          ablations,
          teamSystemPrompts,
          roundNumber: game.round,
          score: {
            amber: { miscommunication: game.teams.amber.miscommunicationTokens, interception: game.teams.amber.interceptionTokens },
            blue: { miscommunication: game.teams.blue.miscommunicationTokens, interception: game.teams.blue.interceptionTokens },
          },
        };
      };

      const amberCtx = buildOwnDelibContext("amber");
      const blueCtx = buildOwnDelibContext("blue");

      // Run both teams in parallel
      const [amberResult, blueResult] = await Promise.all([
        amberCtx ? processDeliberation(amberCtx, matchId, game.id, game.round) : Promise.resolve(null),
        blueCtx ? processDeliberation(blueCtx, matchId, game.id, game.round) : Promise.resolve(null),
      ]);

      const ownDelibResults: Record<string, DeliberationResult | null> = {
        amber: amberResult,
        blue: blueResult,
      };

      // Persist chatter and apply guesses
      for (const team of ["amber", "blue"] as const) {
        const result = ownDelibResults[team];
        if (!result) continue;

        await storage.createTeamChatter({
          matchId,
          gameId: game.id,
          roundNumber: game.round,
          team,
          phase: "own_guess_deliberation",
          messages: result.messages,
          totalExchanges: result.totalExchanges,
          consensusReached: result.consensusReached,
          finalAnswer: result.answer,
        });

        game = submitOwnTeamGuess(game, team, result.answer);
      }

      // Phase: opponent_deliberation
      // Must be sequential -- each team needs the OTHER team's own-deliberation transcript
      game = { ...game, phase: "opponent_deliberation" as GamePhase };

      for (const team of ["amber", "blue"] as const) {
        const opponentTeam = team === "amber" ? "blue" : "amber";
        const clueGiverId = game.currentClueGiver[team]!;
        const teamPlayers = game.players.filter(p => p.team === team);
        const guessers = teamPlayers.filter(p => p.id !== clueGiverId);

        if (guessers.length < 2) {
          continue;
        }

        // Pass the opponent's own-team deliberation transcript (PUBLIC chatter)
        const opponentTranscript = ownDelibResults[opponentTeam]?.messages || [];

        const result = await processDeliberation({
          team,
          phase: "opponent_intercept_deliberation",
          clues: game.currentClues[opponentTeam]!,
          opponentHistory: game.teams[opponentTeam].history.map(h => ({ clues: h.clues, targetCode: h.targetCode })),
          teamHistory: game.teams[team].history.map(h => ({ clues: h.clues, targetCode: h.targetCode })),
          opponentDeliberationTranscript: opponentTranscript,
          clueGiverName: game.players.find(p => p.id === game.currentClueGiver[opponentTeam]!)!.name,
          guessers: [guessers[0], guessers[1]] as [Player, Player],
          scratchNotes: scratchNotesMap,
          ablations,
          teamSystemPrompts,
          roundNumber: game.round,
          score: {
            amber: { miscommunication: game.teams.amber.miscommunicationTokens, interception: game.teams.amber.interceptionTokens },
            blue: { miscommunication: game.teams.blue.miscommunicationTokens, interception: game.teams.blue.interceptionTokens },
          },
        }, matchId, game.id, game.round);

        // Persist chatter
        await storage.createTeamChatter({
          matchId,
          gameId: game.id,
          roundNumber: game.round,
          team,
          phase: "opponent_intercept_deliberation",
          messages: result.messages,
          totalExchanges: result.totalExchanges,
          consensusReached: result.consensusReached,
          finalAnswer: result.answer,
        });

        // Apply the interception
        game = submitInterception(game, team, result.answer);
      }

    } else {
      // 2v2 mode: existing single-shot behavior
      if (game.phase !== "own_team_guessing") {
        log(`[headless] Match ${matchId} - Unexpected phase after clues: ${game.phase}`, "headless");
        break;
      }
      game = await processGuesses(game, matchId, scratchNotesMap, ablations, teamSystemPrompts);

      if (game.phase !== "opponent_intercepting") {
        log(`[headless] Match ${matchId} - Unexpected phase after guesses: ${game.phase}`, "headless");
        break;
      }
      game = await processInterceptions(game, matchId, scratchNotesMap, ablations, teamSystemPrompts);
    }

    // ... existing round evaluation and persistence ...
  }
}
```

### 8.2 Clue-giver rotation for 3-player teams

The existing rotation logic in `startNewRound()` already works for any team size:

```typescript
const amberClueGiver = amberPlayers[(newRound - 1) % amberPlayers.length]?.id || null;
```

With 3 players, this cycles through all three: round 1 = player 0, round 2 = player 1, round 3 = player 2, round 4 = player 0, etc. No change needed.

### 8.3 Match creation -- persist teamSize

When creating the match record, include the team size:

```typescript
const match = await storage.createMatch({
  // ... existing fields ...
  teamSize: teamSize,
});
```

---

## 9. Storage Layer Changes

**File: `server/storage.ts`**

### 9.1 New methods

```typescript
async createTeamChatter(entry: InsertTeamChatter): Promise<TeamChatter> {
  const [created] = await db.insert(teamChatter).values(entry).returning();
  return created;
}

async getTeamChatter(matchId: number): Promise<TeamChatter[]> {
  return db.select().from(teamChatter)
    .where(eq(teamChatter.matchId, matchId))
    .orderBy(teamChatter.roundNumber, teamChatter.team, teamChatter.phase);
}

async getTeamChatterByRound(matchId: number, roundNumber: number): Promise<TeamChatter[]> {
  return db.select().from(teamChatter)
    .where(and(
      eq(teamChatter.matchId, matchId),
      eq(teamChatter.roundNumber, roundNumber),
    ))
    .orderBy(teamChatter.team, teamChatter.phase);
}
```

### 9.2 Import the new table

Add `teamChatter` to the imports from `@shared/schema` in `storage.ts`.

---

## 10. AI Layer Changes

**File: `server/ai.ts`**

### 10.1 New function: `generateDeliberationMessage()`

This is a thin wrapper around `callAI` that returns the full response without any parsing (deliberation messages are free-form text, not structured output).

```typescript
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
```

### 10.2 New actionType values for ai_call_logs

The existing `actionType` field (varchar(30)) accommodates:
- `"deliberation_own"` -- message during own-team deliberation
- `"deliberation_intercept"` -- message during opponent interception deliberation

No schema change needed; the column is already a free-form varchar.

---

## 11. Prompt Strategy Integration

**File: `server/promptStrategies.ts`**

### 11.1 Default deliberation prompt builders

The default deliberation prompts live as exported functions in `promptStrategies.ts`, following the same pattern as the existing `clueTemplate`, `guessTemplate`, and `interceptionTemplate`. The headlessRunner imports and calls these functions; it does NOT hardcode prompt text.

```typescript
// Exported from promptStrategies.ts:

export function defaultDeliberationOwnFirstTurn(params: DeliberationOwnTemplateParams & { isPlayerB: boolean }): string {
  // Returns the full prompt text from section 6.2 above
  // Uses params.isPlayerB to select the appropriate analytical lens
}

export function defaultDeliberationOwnFollowUp(params: DeliberationOwnTemplateParams & { exchangeNumber: number }): string {
  // Returns the full prompt text from section 6.3 above
  // Includes conversation-so-far, other player's last message summary,
  // and the convergence nudge when exchangeNumber >= 3
}

export function defaultDeliberationInterceptFirstTurn(params: DeliberationInterceptTemplateParams & { isPlayerB: boolean }): string {
  // Returns the full prompt text from section 6.4 above
  // Uses params.isPlayerB to select explicit-reasoning vs. silence-analysis lens
}

export function defaultDeliberationInterceptFollowUp(params: DeliberationInterceptTemplateParams & { exchangeNumber: number }): string {
  // Returns the full prompt text from section 6.5 above
  // Re-injects intercepted transcript, conversation-so-far,
  // and convergence nudge when exchangeNumber >= 3
}
```

### 11.2 New template methods on PromptStrategy (optional)

The `PromptStrategy` interface can optionally grow two new templates. If not provided, the default deliberation prompt builders above are used:

```typescript
export interface PromptStrategy {
  name: string;
  description: string;
  systemPrompt: string;
  clueTemplate: (params: ClueTemplateParams) => string;
  guessTemplate: (params: GuessTemplateParams) => string;
  interceptionTemplate: (params: InterceptionTemplateParams) => string;
  // NEW -- optional
  deliberationOwnTemplate?: (params: DeliberationOwnTemplateParams) => string;
  deliberationInterceptTemplate?: (params: DeliberationInterceptTemplateParams) => string;
}
```

### 11.3 Template parameter types

```typescript
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
  isPlayerB?: boolean;
}
```

This keeps the architecture extensible -- a future "k-level-deliberation" strategy could override how deliberation prompts are constructed -- without requiring it now.

---

## 12. CSV Export Changes

**File: `server/exportRouter.ts`**

Add chatter data to the match CSV export. For each round in a 3v3 match, include:

- `amber_own_deliberation_transcript` -- full JSON of ChatterMessage[]
- `amber_own_deliberation_exchanges` -- number
- `amber_own_deliberation_consensus` -- boolean
- `amber_intercept_deliberation_transcript` -- full JSON
- `amber_intercept_deliberation_exchanges` -- number
- `amber_intercept_deliberation_consensus` -- boolean
- Same 6 columns for blue team

For 2v2 matches, these columns are empty/null.

---

## 13. Cost Estimation Update

**File: `server/routes.ts` -- `computeEstimatedCost()`**

Update the cost estimator to account for deliberation calls:

```typescript
const CALL_TYPE_TOKENS: Record<string, { input: number; output: number; callsPerRound: number }> = {
  clue:                    { input: 900,  output: 150,  callsPerRound: 1 },
  guess:                   { input: 650,  output: 80,   callsPerRound: 1 },
  intercept:               { input: 750,  output: 80,   callsPerRound: 0.5 },
  reflection:              { input: 1200, output: 300,  callsPerRound: 0 },
  // NEW: deliberation messages (avg ~4 exchanges = 8 messages per phase, 2 phases)
  deliberation_own:        { input: 2000, output: 500,  callsPerRound: 0 },  // per-player, set below
  deliberation_intercept:  { input: 3000, output: 500,  callsPerRound: 0 },
};

// In the cost loop, if teamSize === 3:
// Add deliberation costs: avg 4 exchanges * 2 players * 2 phases = 16 calls per round
// deliberation_own: 4 exchanges * 2 players = 8 calls/round
// deliberation_intercept: 4 exchanges * 2 players = 8 calls/round
```

---

## 14. Ablation Support

### 14.1 No new ablation flags needed

Deliberation naturally respects existing ablations:
- `no_history` -- deliberation prompts omit round history
- `no_scratch_notes` -- deliberation prompts omit scratch notes
- `no_opponent_history` -- interception deliberation omits opponent history
- `no_chain_of_thought` -- falls back to default strategy prompts (but deliberation itself is always multi-turn; this ablation affects the *strategy template* used, not the deliberation structure)

### 14.2 Future ablation: `no_deliberation`

Not built now, but a natural addition: forces 3v3 games to use single-shot guessing (one of the two guessers chosen as the single guesser). This would enable A/B testing of deliberation vs. single-shot in 3v3 settings.

---

## 15. What NOT to Build

- **No smart summarization** of chatter transcripts. The full transcript is stored and passed as-is.
- **No chatter quality scoring.** Raw messages are stored; analysis is left to the researcher.
- **No artificial turn-taking rules** beyond basic alternation.
- **No per-message timeout.** Each AI call uses the player's configured `timeoutMs`.
- **No "chatter style" configuration.** Models use their natural voice.
- **No moderator or facilitator agent.** The two guessers talk directly to each other.
- **No context window management.** The full conversation is passed every turn. Frontier models have 128K+ context windows; a 20-message deliberation is nowhere near that limit.
- **No response length limits on deliberation.** Token budgets match the rest of the platform (8192+ for non-thinking, 64000 for thinking). Models decide how much they need to say.

---

## 16. File Change Summary

| File | Change |
|---|---|
| `shared/schema.ts` | Add `GamePhase` values, `teamSize` to `HeadlessMatchConfig`, `teamChatter` table, `ChatterMessage` type (with `exchangeNumber`) |
| `server/game.ts` | Raise max players to 6, handle new phase transitions for 3v3 |
| `server/headlessRunner.ts` | Add `processDeliberation()`, update main loop for 3v3 branching (parallel own-team deliberation), persist chatter |
| `server/ai.ts` | Add `generateDeliberationMessage()`, export `estimateCost` (or inline in headlessRunner) |
| `server/promptStrategies.ts` | Add `defaultDeliberationOwnFirstTurn()`, `defaultDeliberationOwnFollowUp()`, `defaultDeliberationInterceptFirstTurn()`, `defaultDeliberationInterceptFollowUp()` exported functions; add optional `deliberationOwnTemplate` / `deliberationInterceptTemplate` to `PromptStrategy` interface; add `DeliberationOwnTemplateParams` / `DeliberationInterceptTemplateParams` types |
| `server/storage.ts` | Add `createTeamChatter()`, `getTeamChatter()`, `getTeamChatterByRound()` methods, import new table |
| `server/routes.ts` | Raise headlessMatchConfigSchema max players to 6, add `teamSize` field, update cost estimator |
| `server/exportRouter.ts` | Add chatter columns to CSV export |
| Migration SQL | Create `team_chatter` table, add `team_size` column to `matches` |

---

## 17. Testing Plan

### 17.1 Unit tests

- `parseReadySignal()` -- test various formats: `READY: 3,1,4`, `READY:3,1,4`, `ready: 3, 1, 4`, embedded in longer text, multiple READY signals in one message
- Consensus detection logic -- both agree, both disagree, one ready one not, cap hit with no ready signals
- Clue-giver rotation with 3 players across multiple rounds
- Phase flow: verify 2v2 still goes through old phases, 3v3 goes through new phases

### 17.2 Integration tests

- Run a full 3v3 headless match with cheap models (e.g., `gpt-5.4-mini` or `gemini-3.1-flash-lite-preview`)
- Verify `team_chatter` records are created with correct structure
- Verify `ai_call_logs` entries have `deliberation_own` / `deliberation_intercept` action types
- Verify opponent deliberation transcript includes own-team deliberation from the other team
- Run a 2v2 match and verify zero `team_chatter` records, unchanged behavior

### 17.3 Smoke test: deliberation quality

Run a single 3v3 match with strong models (e.g., `claude-opus-4-6` vs `gemini-2.5-pro`) and manually inspect:
- Do models engage meaningfully with each other?
- Do they reach consensus naturally before the 10-round cap?
- Do they show strategic awareness about public deliberation?
- Does the interception team leverage the overheard discussion?

---

## 18. Open Questions

1. **Mixed team sizes.** Should we support 3v2 (3-player team vs 2-player team)? The 3-player team deliberates; the 2-player team does single-shot. This could be an interesting experimental condition. Not in scope for v1 but the architecture supports it trivially.

2. **WebSocket live streaming.** For the interactive (non-headless) mode, should deliberation messages stream to the UI in real-time? This is a UI concern and outside the scope of this spec, but the data model supports it -- each `ChatterMessage` has a timestamp and can be emitted as a WebSocket event as it is generated.
