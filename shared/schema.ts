import { z } from "zod";
import { pgTable, text, varchar, integer, boolean, timestamp, jsonb, serial } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
export { MODEL_OPTIONS, getDefaultConfigForProvider as getDefaultConfig } from "./modelRegistry";

export type AIProvider = "chatgpt" | "claude" | "gemini" | "openrouter";

export const aiPlayerConfigSchema = z.object({
  provider: z.enum(["chatgpt", "claude", "gemini", "openrouter"]),
  model: z.string(),
  timeoutMs: z.number().min(10000).max(14400000).default(900000), // Up to 4 hours, default 15 min
  temperature: z.number().min(0).max(2).optional(),
  promptStrategy: z.enum(["default", "advanced", "k-level", "enriched"]).default("default"),
  reasoningEffort: z.enum(["low", "medium", "high", "xhigh"]).default("high"),
});

export type AIPlayerConfig = z.infer<typeof aiPlayerConfigSchema>;

export const PROMPT_STRATEGY_OPTIONS = ["default", "advanced", "k-level", "enriched"] as const;

export const playerSchema = z.object({
  id: z.string(),
  name: z.string(),
  isAI: z.boolean(),
  aiProvider: z.enum(["chatgpt", "claude", "gemini", "openrouter"]).optional(),
  aiConfig: aiPlayerConfigSchema.optional(),
  team: z.enum(["amber", "blue"]).nullable(),
  isReady: z.boolean(),
});

export type Player = z.infer<typeof playerSchema>;

export type GamePhase =
  | "lobby"
  | "team_setup"
  | "giving_clues"
  | "own_team_deliberation"
  | "own_team_guessing"
  | "opponent_deliberation"
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
  phase: z.enum(["lobby", "team_setup", "giving_clues", "own_team_deliberation", "own_team_guessing", "opponent_deliberation", "opponent_intercepting", "round_results", "game_over"]),
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
    provider: z.enum(["chatgpt", "claude", "gemini", "openrouter"]),
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
  z.object({ type: z.literal("phase_changed"), phase: z.enum(["lobby", "team_setup", "giving_clues", "own_team_deliberation", "own_team_guessing", "opponent_deliberation", "opponent_intercepting", "round_results", "game_over"]), round: z.number() }),
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
  gameSeed: varchar("game_seed", { length: 50 }),
  ablations: jsonb("ablations"),
  qualityStatus: varchar("quality_status", { length: 20 }).$type<MatchQualityStatus>().notNull().default("clean"),
  qualitySummary: jsonb("quality_summary").$type<MatchQualitySummary>().notNull(),
  // Week 1: experimentId for scoped queries
  // Migration SQL:
  //   ALTER TABLE matches ADD COLUMN experiment_id VARCHAR(100);
  //   CREATE INDEX idx_matches_experiment_id ON matches (experiment_id) WHERE experiment_id IS NOT NULL;
  experimentId: varchar("experiment_id", { length: 100 }),
  teamSize: integer("team_size").notNull().default(2),
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

// Team chatter table for 3v3 deliberation transcripts
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

export interface ChatterMessage {
  playerId: string;
  playerName: string;
  content: string;
  timestamp: string;          // ISO 8601
  exchangeNumber: number;     // 0-indexed exchange this message belongs to
  model: string;
  latencyMs: number;
  promptTokens?: number;
  completionTokens?: number;
  reasoningTokens?: number;
  estimatedCostUsd?: string;
  readySignal?: [number, number, number] | null;  // Extracted READY signal, if present
  status?: "ok" | "timeout" | "error" | "fallback";
  timedOut?: boolean;
  usedFallback?: boolean;
  error?: string | null;
}

export type ParseQuality = "clean" | "partial_recovery" | "fallback_used" | "error";

export type MatchQualityStatus = "clean" | "tainted";

export interface MatchQualityEvent {
  type: "fallback_clue" | "api_error" | "deliberation_failure";
  roundNumber: number;
  team?: "amber" | "blue";
  actionType: string;
  playerName?: string;
  provider?: AIProvider;
  model?: string;
  timedOut?: boolean;
  usedFallback?: boolean;
  error?: string | null;
  detail?: string;
}

export interface MatchQualityTeamSummary {
  clueCalls: number;
  fallbackClueCalls: number;
  fallbackRate: number;
}

export interface MatchQualitySummary {
  clueGeneration: Record<"amber" | "blue", MatchQualityTeamSummary>;
  taintReasons: string[];
  taintEvents: MatchQualityEvent[];
}

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
  parseQuality: varchar("parse_quality", { length: 20 }),
  usedFallback: boolean("used_fallback").notNull().default(false),
  promptTokens: integer("prompt_tokens"),
  completionTokens: integer("completion_tokens"),
  totalTokens: integer("total_tokens"),
  estimatedCostUsd: varchar("estimated_cost_usd", { length: 20 }),
  reasoningTrace: text("reasoning_trace"),
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
  budgetCapUsd: varchar("budget_cap_usd", { length: 20 }),
  actualCostUsd: varchar("actual_cost_usd", { length: 20 }),
  estimatedCostUsd: varchar("estimated_cost_usd", { length: 20 }),
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
    aiConfig?: AIPlayerConfig;
  }>;
  fastMode?: boolean;
  seed?: string;
  ablations?: HeadlessMatchAblations;
  experimentId?: string;
  teamSize?: 2 | 3;
}

export interface TournamentConfig {
  name: string;
  matchConfigs: HeadlessMatchConfig[];
  gamesPerMatchup?: number;
  budgetCapUsd?: string;
  concurrency?: number;
  delayBetweenMatchesMs?: number;
  ablations?: HeadlessMatchAblations;
}

export type AblationFlag =
  | "no_history"
  | "no_scratch_notes"
  | "no_opponent_history"
  | "no_chain_of_thought"
  | "random_clues"
  // Enriched strategy module ablations:
  | "no_persona"            // Disable persona injection in enriched strategy
  | "no_semantic_context"   // Disable word card vibe/tags in enriched strategy keyword listing
  ;

export interface HeadlessMatchAblations {
  flags: AblationFlag[];
}

// Series tables for persistent scratch notes

export const series = pgTable("series", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  config: jsonb("config").notNull(),
  totalGames: integer("total_games").notNull().default(0),
  completedGames: integer("completed_games").notNull().default(0),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  noteTokenBudget: integer("note_token_budget").notNull().default(500),
  budgetCapUsd: varchar("budget_cap_usd", { length: 20 }),
  actualCostUsd: varchar("actual_cost_usd", { length: 20 }),
  estimatedCostUsd: varchar("estimated_cost_usd", { length: 20 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
});

export const insertSeriesSchema = createInsertSchema(series).omit({ id: true, createdAt: true });
export type InsertSeries = z.infer<typeof insertSeriesSchema>;
export type Series = typeof series.$inferSelect;

export const scratchNotes = pgTable("scratch_notes", {
  id: serial("id").primaryKey(),
  seriesId: integer("series_id").notNull(),
  playerConfigHash: varchar("player_config_hash", { length: 100 }).notNull(),
  gameIndex: integer("game_index").notNull(),
  notesText: text("notes_text").notNull(),
  tokenCount: integer("token_count").notNull().default(0),
  matchId: integer("match_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertScratchNoteSchema = createInsertSchema(scratchNotes).omit({ id: true, createdAt: true });
export type InsertScratchNote = z.infer<typeof insertScratchNoteSchema>;
export type ScratchNote = typeof scratchNotes.$inferSelect;

export interface SeriesConfig {
  matchConfig: HeadlessMatchConfig;
  totalGames: number;
  noteTokenBudget?: number;
  budgetCapUsd?: string;
  estimatedCostUsd?: string;
}

// Evolution tables

export interface GenomeModules {
  cluePhilosophy: string;
  opponentModeling: string;
  riskTolerance: string;
  memoryPolicy: string;
}

export const strategyGenomes = pgTable("strategy_genomes", {
  id: serial("id").primaryKey(),
  evolutionRunId: integer("evolution_run_id").notNull(),
  generationNumber: integer("generation_number").notNull(),
  parentIds: jsonb("parent_ids").$type<number[]>().default([]),
  modules: jsonb("modules").$type<GenomeModules>().notNull(),
  fitnessScore: varchar("fitness_score", { length: 20 }),
  eloRating: integer("elo_rating").notNull().default(1200),
  matchesPlayed: integer("matches_played").notNull().default(0),
  wins: integer("wins").notNull().default(0),
  losses: integer("losses").notNull().default(0),
  interceptionRate: varchar("interception_rate", { length: 20 }),
  miscommunicationRate: varchar("miscommunication_rate", { length: 20 }),
  lineageTag: varchar("lineage_tag", { length: 100 }),
  mutationLog: text("mutation_log"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertStrategyGenomeSchema = createInsertSchema(strategyGenomes).omit({ id: true, createdAt: true });
export type InsertStrategyGenome = z.infer<typeof insertStrategyGenomeSchema>;
export type StrategyGenome = typeof strategyGenomes.$inferSelect;

export const evolutionRuns = pgTable("evolution_runs", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  config: jsonb("config").notNull(),
  populationSize: integer("population_size").notNull().default(8),
  totalGenerations: integer("total_generations").notNull().default(10),
  currentGeneration: integer("current_generation").notNull().default(0),
  mutationRate: varchar("mutation_rate", { length: 10 }).notNull().default("0.3"),
  crossoverRate: varchar("crossover_rate", { length: 10 }).notNull().default("0.7"),
  elitismCount: integer("elitism_count").notNull().default(2),
  budgetCapUsd: varchar("budget_cap_usd", { length: 20 }),
  actualCostUsd: varchar("actual_cost_usd", { length: 20 }),
  phaseTransitions: jsonb("phase_transitions").$type<PhaseTransition[]>().default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
});

export const insertEvolutionRunSchema = createInsertSchema(evolutionRuns).omit({ id: true, createdAt: true });
export type InsertEvolutionRun = z.infer<typeof insertEvolutionRunSchema>;
export type EvolutionRun = typeof evolutionRuns.$inferSelect;

export const generations = pgTable("generations", {
  id: serial("id").primaryKey(),
  evolutionRunId: integer("evolution_run_id").notNull(),
  generationNumber: integer("generation_number").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  avgFitness: varchar("avg_fitness", { length: 20 }),
  maxFitness: varchar("max_fitness", { length: 20 }),
  minFitness: varchar("min_fitness", { length: 20 }),
  fitnessStdDev: varchar("fitness_std_dev", { length: 20 }),
  avgElo: integer("avg_elo"),
  maxElo: integer("max_elo"),
  diversityScore: varchar("diversity_score", { length: 20 }),
  matchIds: jsonb("match_ids").$type<number[]>().default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

export const insertGenerationSchema = createInsertSchema(generations).omit({ id: true, createdAt: true });
export type InsertGeneration = z.infer<typeof insertGenerationSchema>;
export type Generation = typeof generations.$inferSelect;

export interface PopulationSnapshot {
  genomeId: number;
  lineageTag: string | null;
  fitnessScore: number;
  eloRating: number;
  modules: GenomeModules;
}

export interface PhaseTransition {
  fromGeneration: number;
  toGeneration: number;
  type: "exploration" | "exploitation" | "convergence" | "collapse";
  evidence: string;
  detectedAt: string;
  populationSnapshot?: PopulationSnapshot[];
}

export interface EvolutionConfig {
  baseProvider: AIProvider;
  baseModel: string;
  populationSize: number;
  totalGenerations: number;
  mutationRate: number;
  crossoverRate: number;
  elitismCount: number;
  matchesPerEvaluation: number;
  budgetCapUsd?: string;
}

// Experiment config schema for reproducible experiments (Week 3)

export const experimentConfigSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  hypothesis: z.string().optional(),

  // Independent variable: strategy comparison
  strategies: z.array(z.enum(["default", "advanced", "k-level", "enriched"])).min(1),

  // Models to test across
  models: z.array(z.object({
    provider: z.enum(["chatgpt", "claude", "gemini", "openrouter"]),
    model: z.string(),
  })).min(1),

  // Experiment parameters
  gamesPerCell: z.number().int().min(1).max(100).default(10),
  seed: z.string().optional(),  // Base seed; per-match seeds derived as `${seed}-cell${cellIndex}-game${gameIndex}`

  // Optional ablations applied to all matches
  ablations: z.object({
    flags: z.array(z.enum([
      "no_history", "no_scratch_notes", "no_opponent_history",
      "no_chain_of_thought", "random_clues",
      "no_persona", "no_semantic_context",
    ])),
  }).optional(),

  // Budget
  budgetCapUsd: z.string().optional(),
});

export type ExperimentConfig = z.infer<typeof experimentConfigSchema>;

// Legacy exports for compatibility
export { users, insertUserSchema } from "./models/user";
export type { InsertUser, User } from "./models/user";
