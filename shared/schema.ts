import { z } from "zod";
import { pgTable, text, varchar, integer, boolean, timestamp, jsonb, serial } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export type AIProvider = "chatgpt" | "claude" | "gemini";

export const aiPlayerConfigSchema = z.object({
  provider: z.enum(["chatgpt", "claude", "gemini"]),
  model: z.string(),
  timeoutMs: z.number().min(10000).max(300000).default(120000),
  temperature: z.number().min(0).max(2).optional(),
  promptStrategy: z.enum(["default", "advanced"]).default("default"),
});

export type AIPlayerConfig = z.infer<typeof aiPlayerConfigSchema>;

export const MODEL_OPTIONS: Record<AIProvider, Array<{ value: string; label: string; isReasoning?: boolean }>> = {
  chatgpt: [
    { value: "gpt-4o", label: "GPT-4o" },
    { value: "gpt-4o-mini", label: "GPT-4o Mini" },
    { value: "o3", label: "o3 (Reasoning)", isReasoning: true },
    { value: "o3-mini", label: "o3-mini (Reasoning)", isReasoning: true },
    { value: "o1", label: "o1 (Reasoning)", isReasoning: true },
  ],
  claude: [
    { value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
    { value: "claude-haiku-4-20250414", label: "Claude Haiku 4" },
    { value: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet" },
  ],
  gemini: [
    { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
    { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro (Thinking)", isReasoning: true },
    { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash (Thinking)", isReasoning: true },
  ],
};

export const PROMPT_STRATEGY_OPTIONS = ["default", "advanced"] as const;

export function getDefaultConfig(provider: AIProvider): AIPlayerConfig {
  const defaultModels: Record<AIProvider, string> = {
    chatgpt: "gpt-4o",
    claude: "claude-sonnet-4-20250514",
    gemini: "gemini-2.0-flash",
  };
  return {
    provider,
    model: defaultModels[provider],
    timeoutMs: 120000,
    temperature: 0.7,
    promptStrategy: "default",
  };
}

export const playerSchema = z.object({
  id: z.string(),
  name: z.string(),
  isAI: z.boolean(),
  aiProvider: z.enum(["chatgpt", "claude", "gemini"]).optional(),
  aiConfig: aiPlayerConfigSchema.optional(),
  team: z.enum(["amber", "blue"]).nullable(),
  isReady: z.boolean(),
});

export type Player = z.infer<typeof playerSchema>;

export type GamePhase = 
  | "lobby"
  | "team_setup"
  | "giving_clues"
  | "own_team_guessing"
  | "opponent_intercepting"
  | "round_results"
  | "game_over";

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

export const teamStateSchema = z.object({
  keywords: z.array(z.string()),
  whiteTokens: z.number(),
  blackTokens: z.number(),
  history: z.array(roundHistorySchema),
});

export type TeamState = z.infer<typeof teamStateSchema>;

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

export const wsMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("join"), gameId: z.string(), playerName: z.string(), playerId: z.string().optional() }),
  z.object({ 
    type: z.literal("add_ai"), 
    provider: z.enum(["chatgpt", "claude", "gemini"]),
    config: aiPlayerConfigSchema.optional(),
  }),
  z.object({ type: z.literal("remove_player"), playerId: z.string() }),
  z.object({ type: z.literal("join_team"), team: z.enum(["amber", "blue"]) }),
  z.object({ type: z.literal("start_game") }),
  z.object({ type: z.literal("confirm_teams") }),
  z.object({ type: z.literal("submit_clues"), clues: z.array(z.string()) }),
  z.object({ type: z.literal("submit_guess"), guess: z.tuple([z.number(), z.number(), z.number()]) }),
  z.object({ type: z.literal("submit_interception"), guess: z.tuple([z.number(), z.number(), z.number()]) }),
  z.object({ type: z.literal("next_round") }),
  z.object({ type: z.literal("request_state") }),
  z.object({ type: z.literal("new_game_same_players") }),
]);

export type WSMessage = z.infer<typeof wsMessageSchema>;

export const serverMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("game_state"), state: gameStateSchema }),
  z.object({ type: z.literal("player_joined"), player: playerSchema }),
  z.object({ type: z.literal("player_left"), playerId: z.string() }),
  z.object({ type: z.literal("error"), message: z.string() }),
  z.object({ type: z.literal("clue_error"), message: z.string() }),
  z.object({ type: z.literal("your_code"), code: z.tuple([z.number(), z.number(), z.number()]) }),
  z.object({ type: z.literal("keywords"), keywords: z.array(z.string()) }),
  z.object({ type: z.literal("ai_thinking"), aiName: z.string(), startTime: z.number().optional() }),
  z.object({ type: z.literal("ai_done"), aiName: z.string() }),
  z.object({ type: z.literal("ai_fallback"), aiName: z.string(), reason: z.string() }),
  z.object({ type: z.literal("new_game_created"), gameId: z.string() }),
  z.object({ type: z.literal("phase_changed"), phase: z.enum(["lobby", "team_setup", "giving_clues", "own_team_guessing", "opponent_intercepting", "round_results", "game_over"]), round: z.number() }),
]);

export type ServerMessage = z.infer<typeof serverMessageSchema>;

export const createGameSchema = z.object({
  hostName: z.string().min(1).max(20),
});

export type CreateGame = z.infer<typeof createGameSchema>;

export const joinGameSchema = z.object({
  gameId: z.string(),
  playerName: z.string().min(1).max(20),
});

export type JoinGame = z.infer<typeof joinGameSchema>;

// Database tables for match persistence

export const matches = pgTable("matches", {
  id: serial("id").primaryKey(),
  gameId: varchar("game_id", { length: 10 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  winner: varchar("winner", { length: 10 }),
  playerConfigs: jsonb("player_configs").notNull(),
  amberKeywords: jsonb("amber_keywords").notNull(),
  blueKeywords: jsonb("blue_keywords").notNull(),
  totalRounds: integer("total_rounds").notNull().default(0),
  amberWhiteTokens: integer("amber_white_tokens").notNull().default(0),
  amberBlackTokens: integer("amber_black_tokens").notNull().default(0),
  blueWhiteTokens: integer("blue_white_tokens").notNull().default(0),
  blueBlackTokens: integer("blue_black_tokens").notNull().default(0),
});

export const insertMatchSchema = createInsertSchema(matches).omit({ id: true, createdAt: true });
export type InsertMatch = z.infer<typeof insertMatchSchema>;
export type Match = typeof matches.$inferSelect;

export const matchRounds = pgTable("match_rounds", {
  id: serial("id").primaryKey(),
  matchId: integer("match_id").notNull(),
  roundNumber: integer("round_number").notNull(),
  team: varchar("team", { length: 10 }).notNull(),
  clueGiverId: varchar("clue_giver_id", { length: 100 }).notNull(),
  code: jsonb("code").notNull(),
  clues: jsonb("clues").notNull(),
  ownGuess: jsonb("own_guess"),
  opponentGuess: jsonb("opponent_guess"),
  ownCorrect: boolean("own_correct").notNull().default(false),
  intercepted: boolean("intercepted").notNull().default(false),
});

export const insertMatchRoundSchema = createInsertSchema(matchRounds).omit({ id: true });
export type InsertMatchRound = z.infer<typeof insertMatchRoundSchema>;
export type MatchRound = typeof matchRounds.$inferSelect;

export const aiCallLogs = pgTable("ai_call_logs", {
  id: serial("id").primaryKey(),
  matchId: integer("match_id"),
  gameId: varchar("game_id", { length: 10 }),
  roundNumber: integer("round_number"),
  provider: varchar("provider", { length: 20 }).notNull(),
  model: varchar("model", { length: 100 }).notNull(),
  actionType: varchar("action_type", { length: 30 }).notNull(),
  prompt: text("prompt").notNull(),
  rawResponse: text("raw_response"),
  parsedResult: jsonb("parsed_result"),
  latencyMs: integer("latency_ms"),
  timedOut: boolean("timed_out").notNull().default(false),
  error: text("error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAiCallLogSchema = createInsertSchema(aiCallLogs).omit({ id: true, createdAt: true });
export type InsertAiCallLog = z.infer<typeof insertAiCallLogSchema>;
export type AiCallLog = typeof aiCallLogs.$inferSelect;

// Tournament tables

export const tournaments = pgTable("tournaments", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  config: jsonb("config").notNull(),
  totalMatches: integer("total_matches").notNull().default(0),
  completedMatches: integer("completed_matches").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
});

export const insertTournamentSchema = createInsertSchema(tournaments).omit({ id: true, createdAt: true });
export type InsertTournament = z.infer<typeof insertTournamentSchema>;
export type Tournament = typeof tournaments.$inferSelect;

export const tournamentMatches = pgTable("tournament_matches", {
  id: serial("id").primaryKey(),
  tournamentId: integer("tournament_id").notNull(),
  matchId: integer("match_id"),
  matchIndex: integer("match_index").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  config: jsonb("config").notNull(),
  result: jsonb("result"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

export const insertTournamentMatchSchema = createInsertSchema(tournamentMatches).omit({ id: true, createdAt: true });
export type InsertTournamentMatch = z.infer<typeof insertTournamentMatchSchema>;
export type TournamentMatch = typeof tournamentMatches.$inferSelect;

export const experiments = pgTable("experiments", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  model: varchar("model", { length: 100 }).notNull(),
  provider: varchar("provider", { length: 20 }).notNull(),
  strategyA: varchar("strategy_a", { length: 50 }).notNull(),
  strategyB: varchar("strategy_b", { length: 50 }).notNull(),
  numGames: integer("num_games").notNull().default(10),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  matchIdsA: jsonb("match_ids_a").notNull().default([]),
  matchIdsB: jsonb("match_ids_b").notNull().default([]),
  results: jsonb("results"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

export const insertExperimentSchema = createInsertSchema(experiments).omit({ id: true, createdAt: true });
export type InsertExperiment = z.infer<typeof insertExperimentSchema>;
export type Experiment = typeof experiments.$inferSelect;

// Match config type for headless runner
export interface HeadlessMatchConfig {
  players: Array<{
    name: string;
    aiProvider: AIProvider;
    team: "amber" | "blue";
  }>;
  fastMode?: boolean;
}

export interface TournamentConfig {
  name: string;
  matchConfigs: HeadlessMatchConfig[];
  gamesPerMatchup?: number;
}

// Legacy exports for compatibility
export { users, insertUserSchema } from "./models/user";
export type { InsertUser, User } from "./models/user";
