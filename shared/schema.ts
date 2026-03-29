import { z } from "zod";

// AI Provider types
export type AIProvider = "chatgpt" | "claude" | "gemini";

// Player types
export const playerSchema = z.object({
  id: z.string(),
  name: z.string(),
  isAI: z.boolean(),
  aiProvider: z.enum(["chatgpt", "claude", "gemini"]).optional(),
  team: z.enum(["amber", "blue"]).nullable(),
  isReady: z.boolean(),
});

export type Player = z.infer<typeof playerSchema>;

// Game phase types
export type GamePhase = 
  | "lobby"
  | "team_setup"
  | "giving_clues"
  | "own_team_guessing"
  | "opponent_intercepting"
  | "round_results"
  | "game_over";

// Clue and guess types
export const clueSchema = z.object({
  playerId: z.string(),
  clues: z.array(z.string()),
  targetCode: z.tuple([z.number(), z.number(), z.number()]),
});

export type Clue = z.infer<typeof clueSchema>;

export const guessSchema = z.object({
  teamId: z.enum(["amber", "blue"]),
  guess: z.tuple([z.number(), z.number(), z.number()]),
  isInterception: z.boolean(),
});

export type Guess = z.infer<typeof guessSchema>;

// Round history
export const roundHistorySchema = z.object({
  round: z.number(),
  clueGiverId: z.string(),
  clues: z.array(z.string()),
  targetCode: z.tuple([z.number(), z.number(), z.number()]),
  ownTeamGuess: z.tuple([z.number(), z.number(), z.number()]).nullable(),
  opponentGuess: z.tuple([z.number(), z.number(), z.number()]).nullable(),
  ownTeamCorrect: z.boolean(),
  intercepted: z.boolean(),
});

export type RoundHistory = z.infer<typeof roundHistorySchema>;

// Team state
export const teamStateSchema = z.object({
  keywords: z.array(z.string()),
  whiteTokens: z.number(),
  blackTokens: z.number(),
  history: z.array(roundHistorySchema),
});

export type TeamState = z.infer<typeof teamStateSchema>;

// Full game state
export const gameStateSchema = z.object({
  id: z.string(),
  phase: z.enum(["lobby", "team_setup", "giving_clues", "own_team_guessing", "opponent_intercepting", "round_results", "game_over"]),
  round: z.number(),
  players: z.array(playerSchema),
  hostId: z.string(),
  currentClueGiver: z.object({
    amber: z.string().nullable(),
    blue: z.string().nullable(),
  }),
  currentCode: z.object({
    amber: z.tuple([z.number(), z.number(), z.number()]).nullable(),
    blue: z.tuple([z.number(), z.number(), z.number()]).nullable(),
  }),
  currentClues: z.object({
    amber: z.array(z.string()).nullable(),
    blue: z.array(z.string()).nullable(),
  }),
  currentGuesses: z.object({
    amber: z.object({
      ownTeam: z.tuple([z.number(), z.number(), z.number()]).nullable(),
      opponent: z.tuple([z.number(), z.number(), z.number()]).nullable(),
    }),
    blue: z.object({
      ownTeam: z.tuple([z.number(), z.number(), z.number()]).nullable(),
      opponent: z.tuple([z.number(), z.number(), z.number()]).nullable(),
    }),
  }),
  teams: z.object({
    amber: teamStateSchema,
    blue: teamStateSchema,
  }),
  winner: z.enum(["amber", "blue"]).nullable(),
});

export type GameState = z.infer<typeof gameStateSchema>;

// WebSocket message types
export const wsMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("join"), gameId: z.string(), playerName: z.string(), playerId: z.string().optional() }),
  z.object({ type: z.literal("add_ai"), provider: z.enum(["chatgpt", "claude", "gemini"]) }),
  z.object({ type: z.literal("remove_player"), playerId: z.string() }),
  z.object({ type: z.literal("join_team"), team: z.enum(["amber", "blue"]) }),
  z.object({ type: z.literal("start_game") }),
  z.object({ type: z.literal("confirm_teams") }),
  z.object({ type: z.literal("submit_clues"), clues: z.array(z.string()) }),
  z.object({ type: z.literal("submit_guess"), guess: z.tuple([z.number(), z.number(), z.number()]) }),
  z.object({ type: z.literal("submit_interception"), guess: z.tuple([z.number(), z.number(), z.number()]) }),
  z.object({ type: z.literal("next_round") }),
  z.object({ type: z.literal("request_state") }),
]);

export type WSMessage = z.infer<typeof wsMessageSchema>;

// Server responses
export const serverMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("game_state"), state: gameStateSchema }),
  z.object({ type: z.literal("player_joined"), player: playerSchema }),
  z.object({ type: z.literal("player_left"), playerId: z.string() }),
  z.object({ type: z.literal("error"), message: z.string() }),
  z.object({ type: z.literal("clue_error"), message: z.string() }),
  z.object({ type: z.literal("your_code"), code: z.tuple([z.number(), z.number(), z.number()]) }),
  z.object({ type: z.literal("keywords"), keywords: z.array(z.string()) }),
  z.object({ type: z.literal("ai_thinking"), aiName: z.string() }),
  z.object({ type: z.literal("ai_done"), aiName: z.string() }),
  z.object({ type: z.literal("ai_fallback"), aiName: z.string(), reason: z.string() }),
]);

export type ServerMessage = z.infer<typeof serverMessageSchema>;

// Create game request
export const createGameSchema = z.object({
  hostName: z.string().min(1).max(20),
});

export type CreateGame = z.infer<typeof createGameSchema>;

// Join game request
export const joinGameSchema = z.object({
  gameId: z.string(),
  playerName: z.string().min(1).max(20),
});

export type JoinGame = z.infer<typeof joinGameSchema>;

// Legacy exports for compatibility
export { users, insertUserSchema } from "./models/user";
export type { InsertUser, User } from "./models/user";
