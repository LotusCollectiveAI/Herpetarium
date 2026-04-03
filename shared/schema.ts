import { z } from "zod";
import { pgTable, text, varchar, integer, boolean, timestamp, jsonb, serial, real, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { getDefaultConfigForProvider, getModelEntry, getModelKey } from "./modelRegistry";
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

export interface TeamRosterMetadata {
  rosterId: string;
  label: string;
  compositionKey: string;
  models: string[];
}

export interface TeamRosters {
  amber: TeamRosterMetadata;
  blue: TeamRosterMetadata;
}

export interface MatchPlayerConfig {
  id: string;
  name: string;
  isAI: boolean;
  aiProvider: string | null;
  aiConfig?: AIPlayerConfig | null;
  team: "amber" | "blue" | null;
  seat?: number | null;
  modelKey?: string | null;
  rosterId?: string | null;
  rosterLabel?: string | null;
  rosterCompositionKey?: string | null;
  rosterModels?: string[] | null;
}

type ConfigurablePlayer = {
  name?: string;
  isAI?: boolean;
  aiProvider?: string | null;
  aiConfig?: Partial<AIPlayerConfig> | AIPlayerConfig | null;
  team: "amber" | "blue" | null;
};

function isAIProvider(provider: string | null | undefined): provider is AIProvider {
  return provider === "chatgpt" || provider === "claude" || provider === "gemini" || provider === "openrouter";
}

function slugifyRosterId(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "unknown-roster";
}

function buildRosterLabel(displayNames: string[]): string {
  if (displayNames.length === 0) return "Unknown";

  const counts = new Map<string, number>();
  for (const displayName of displayNames) {
    counts.set(displayName, (counts.get(displayName) || 0) + 1);
  }

  return Array.from(counts.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([displayName, count]) => count > 1 ? `${count}x ${displayName}` : displayName)
    .join(" + ");
}

export function resolveConfiguredAIPlayerConfig(player: Pick<ConfigurablePlayer, "aiProvider" | "aiConfig">): AIPlayerConfig | null {
  const provider = isAIProvider(player.aiConfig?.provider)
    ? player.aiConfig.provider
    : isAIProvider(player.aiProvider)
      ? player.aiProvider
      : null;

  if (!provider) return null;

  const defaults = getDefaultConfigForProvider(provider);
  return {
    ...defaults,
    ...(player.aiConfig || {}),
    provider,
    model: player.aiConfig?.model || defaults.model,
  };
}

function deriveRosterMetadataFromResolvedConfigs(
  team: "amber" | "blue",
  resolvedConfigs: AIPlayerConfig[],
): TeamRosterMetadata {
  const models = resolvedConfigs.map((config) => config.model);
  const compositionEntries = resolvedConfigs.map((config) => ({
    model: config.model,
    modelKey: getModelKey(config.provider, config.model),
    displayName: getModelEntry(config.provider, config.model)?.displayName || config.model,
  }));

  compositionEntries.sort((left, right) => left.modelKey.localeCompare(right.modelKey));

  const compositionKey = compositionEntries.length > 0
    ? compositionEntries.map((entry) => entry.modelKey).join("|")
    : `${team}:unknown`;

  return {
    rosterId: slugifyRosterId(compositionKey),
    label: buildRosterLabel(compositionEntries.map((entry) => entry.displayName)),
    compositionKey,
    models: compositionEntries.map((entry) => entry.model),
  };
}

export function deriveTeamRosterMetadata(
  players: ConfigurablePlayer[],
  team: "amber" | "blue",
): TeamRosterMetadata {
  const resolvedConfigs = players
    .filter((player) => player.team === team && (player.isAI ?? true))
    .map((player) => resolveConfiguredAIPlayerConfig(player))
    .filter((config): config is AIPlayerConfig => config !== null);

  return deriveRosterMetadataFromResolvedConfigs(team, resolvedConfigs);
}

export function resolveTeamRosters(
  players: ConfigurablePlayer[],
  teamRosters?: Partial<TeamRosters>,
): TeamRosters {
  return {
    amber: teamRosters?.amber || deriveTeamRosterMetadata(players, "amber"),
    blue: teamRosters?.blue || deriveTeamRosterMetadata(players, "blue"),
  };
}

export function normalizeHeadlessMatchConfig(config: HeadlessMatchConfig): HeadlessMatchConfig {
  return {
    ...config,
    teamRosters: resolveTeamRosters(config.players, config.teamRosters),
    gameRules: config.gameRules ? { ...config.gameRules } : { ...DEFAULT_GAME_RULES },
  };
}

export function getStoredPlayerModelId(player: MatchPlayerConfig): string | null {
  if (player.aiConfig?.model) return player.aiConfig.model;
  if (player.modelKey && player.modelKey.includes(":")) {
    return player.modelKey.slice(player.modelKey.indexOf(":") + 1);
  }
  return null;
}

export function getStoredPlayerModelKey(player: MatchPlayerConfig): string | null {
  if (player.modelKey) return player.modelKey;
  if (player.aiConfig?.provider && player.aiConfig.model) {
    return getModelKey(player.aiConfig.provider, player.aiConfig.model);
  }
  return null;
}

export function getStoredPlayerModelDisplayName(player: MatchPlayerConfig): string {
  const provider = player.aiConfig?.provider;
  const model = getStoredPlayerModelId(player);
  if (provider && model) {
    return getModelEntry(provider, model)?.displayName || model;
  }
  return model || player.aiProvider || "unknown";
}

function deriveStoredTeamRosterMetadata(
  playerConfigs: MatchPlayerConfig[],
  team: "amber" | "blue",
): TeamRosterMetadata {
  const teamPlayers = playerConfigs.filter((player) => player.team === team && player.isAI);
  const storedRoster = teamPlayers.find((player) =>
    Boolean(player.rosterId || player.rosterLabel || player.rosterCompositionKey || player.rosterModels?.length),
  );

  if (storedRoster) {
    const derivedModels = teamPlayers
      .map((player) => getStoredPlayerModelId(player))
      .filter((model): model is string => Boolean(model));
    const models = storedRoster.rosterModels && storedRoster.rosterModels.length > 0
      ? storedRoster.rosterModels
      : derivedModels;
    const compositionKey = storedRoster.rosterCompositionKey
      || teamPlayers
        .map((player) => getStoredPlayerModelKey(player))
        .filter((modelKey): modelKey is string => Boolean(modelKey))
        .sort((left, right) => left.localeCompare(right))
        .join("|")
      || `${team}:unknown`;

    return {
      rosterId: storedRoster.rosterId || slugifyRosterId(compositionKey),
      label: storedRoster.rosterLabel || buildRosterLabel(teamPlayers.map((player) => getStoredPlayerModelDisplayName(player))),
      compositionKey,
      models,
    };
  }

  const fallbackConfigs = teamPlayers
    .map((player) => player.aiConfig || null)
    .filter((config): config is AIPlayerConfig => config !== null);

  return deriveRosterMetadataFromResolvedConfigs(team, fallbackConfigs);
}

export function getStoredTeamRosters(playerConfigs: MatchPlayerConfig[]): TeamRosters {
  return {
    amber: deriveStoredTeamRosterMetadata(playerConfigs, "amber"),
    blue: deriveStoredTeamRosterMetadata(playerConfigs, "blue"),
  };
}

export function buildMatchPlayerConfigs(
  players: Array<Pick<Player, "id" | "name" | "isAI" | "aiProvider" | "aiConfig" | "team">>,
  teamRosters?: Partial<TeamRosters>,
): MatchPlayerConfig[] {
  const resolvedTeamRosters = resolveTeamRosters(players, teamRosters);
  const seats = { amber: 0, blue: 0 };

  return players.map((player) => {
    const team = player.team;
    const aiConfig = player.isAI ? resolveConfiguredAIPlayerConfig(player) : null;
    const modelKey = aiConfig ? getModelKey(aiConfig.provider, aiConfig.model) : null;
    const seat = team ? ++seats[team] : null;
    const roster = team ? resolvedTeamRosters[team] : null;

    return {
      id: player.id,
      name: player.name,
      isAI: player.isAI,
      aiProvider: aiConfig?.provider || player.aiProvider || null,
      aiConfig,
      team,
      seat,
      modelKey,
      rosterId: roster?.rosterId || null,
      rosterLabel: roster?.label || null,
      rosterCompositionKey: roster?.compositionKey || null,
      rosterModels: roster?.models || null,
    };
  });
}

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

export const gameRulesSchema = z.object({
  whiteTokenLimit: z.number().int().min(1),
  blackTokenLimit: z.number().int().min(1),
  minRoundsBeforeWin: z.number().int().min(0),
  maxRounds: z.number().int().min(1),
});

export interface GameRules {
  whiteTokenLimit: number;
  blackTokenLimit: number;
  minRoundsBeforeWin: number;
  maxRounds: number;
}

export const DEFAULT_GAME_RULES: GameRules = {
  whiteTokenLimit: 2,
  blackTokenLimit: 2,
  minRoundsBeforeWin: 0,
  maxRounds: 20,
};

export const LONGFORM_ARENA_RULES: GameRules = {
  whiteTokenLimit: 3,
  blackTokenLimit: 3,
  minRoundsBeforeWin: 3,
  maxRounds: 12,
};

export const gameStateSchema = z.object({
  id: z.string(),
  phase: z.enum(["lobby", "team_setup", "giving_clues", "own_team_deliberation", "own_team_guessing", "opponent_deliberation", "opponent_intercepting", "round_results", "game_over"]),
  round: z.number(),
  rules: gameRulesSchema,
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
  gameSeed: varchar("game_seed", { length: 200 }),
  ablations: jsonb("ablations"),
  qualityStatus: varchar("quality_status", { length: 20 }).$type<MatchQualityStatus>().notNull().default("clean"),
  qualitySummary: jsonb("quality_summary").$type<MatchQualitySummary>().notNull(),
  // Week 1: experimentId for scoped queries
  // Migration SQL:
  //   ALTER TABLE matches ADD COLUMN experiment_id VARCHAR(100);
  //   CREATE INDEX idx_matches_experiment_id ON matches (experiment_id) WHERE experiment_id IS NOT NULL;
  experimentId: varchar("experiment_id", { length: 100 }),
  teamSize: integer("team_size").notNull().default(3),
  arenaId: varchar("arena_id", { length: 64 }),
  runId: varchar("run_id", { length: 64 }),
  opponentRunId: varchar("opponent_run_id", { length: 64 }),
  sprintNumber: integer("sprint_number"),
  matchKind: varchar("match_kind", { length: 24 }),
  anchorLabel: varchar("anchor_label", { length: 64 }),
  roleSwapGroupId: varchar("role_swap_group_id", { length: 64 }),
  focalTeam: varchar("focal_team", { length: 10 }).$type<"amber" | "blue" | null>(),
  gameRules: jsonb("game_rules").$type<GameRules | null>(),
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
  gameId: varchar("game_id", { length: 100 }),
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
  teamRosters?: TeamRosters;
  fastMode?: boolean;
  seed?: string;
  ablations?: HeadlessMatchAblations;
  experimentId?: string;
  teamSize?: 2 | 3;
  arenaId?: string;
  runId?: string;
  opponentRunId?: string;
  sprintNumber?: number;
  matchKind?: string;
  anchorLabel?: string;
  roleSwapGroupId?: string;
  focalTeam?: "amber" | "blue";
  gameRules?: GameRules;
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
  executionGuidance: string;
  deliberationScaffold: string;
}

export type GenomeModulesV2 = GenomeModules;

export type GenomeModuleKey = keyof GenomeModules;

export type CoachDeltaOp = "add_rule" | "modify_rule" | "retire_rule";

export interface CoachEvidenceRef {
  sprintNumber: number;
  matchId?: number;
  observation: string;
}

export interface CoachRollbackTrigger {
  description: string;
  metricHint?: string;
  comparatorHint?: "gt" | "lt" | "delta_gt" | "delta_lt";
  threshold?: number;
  reviewAfterSprints?: number;
}

export interface CoachSemanticDelta {
  op: CoachDeltaOp;
  module: GenomeModuleKey;
  oldText?: string;
  newText?: string;
  rationale: string;
  evidenceChain: CoachEvidenceRef[];
  rollbackTriggers: Array<string | CoachRollbackTrigger>;
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

// Coach loop tables

export interface CoachBelief {
  id: string;
  proposition: string;
  confidence: number;
  evidence: string;
  sprintFormed: number;
  revisionOf?: string;
  status: CoachBeliefStatus;
}

export type CoachBeliefStatus = "active" | "superseded" | "retracted";

export type CoachBeliefUpdateOp = "assert" | "revise" | "retract";

export interface CoachBeliefUpdate {
  op: CoachBeliefUpdateOp;
  proposition?: string;
  confidence?: number;
  evidence: string;
  revisionOf?: string;
}

export interface CoachPatch {
  targetModule: keyof GenomeModules;
  oldValue: string;
  newValue: string;
  rationale: string;
  expectedEffect: string;
}

export interface CoachStructuredPatch extends CoachPatch {
  delta?: CoachSemanticDelta;
}

export interface CoachModuleEdit {
  targetModule: GenomeModuleKey;
  oldValue: string;
  newValue: string;
  rationale: string;
  expectedEffect: string;
  delta?: CoachSemanticDelta;
}

export interface CoachPatchBundle {
  proposalId: string;
  summary: string;
  expectedEffect: string;
  edits: CoachModuleEdit[];
  complexityIntent: "increase" | "decrease" | "neutral";
}

export type CoachDecision = "commit" | "revert";

export type CoachRunStatus = "pending" | "running" | "completed" | "failed" | "stopped" | "budget_exceeded";

export interface SearchPolicy {
  policyId: string;
  commitThreshold: number;
  rollbackWindowSprints: number;
  noveltyWeight: number;
  conservationWeight: number;
  evidenceHorizonSprints: number;
}

export const DEFAULT_SEARCH_POLICY: SearchPolicy = {
  policyId: "fixed_v1",
  commitThreshold: 0.5,
  rollbackWindowSprints: 3,
  noveltyWeight: 0.1,
  conservationWeight: 0.9,
  evidenceHorizonSprints: 5,
};

export type PromptRole =
  | "cluegiver"
  | "own_guesser"
  | "interceptor"
  | "own_deliberator"
  | "intercept_deliberator"
  | "coach";

export interface CompiledPromptArtifact {
  role: PromptRole;
  systemPrompt: string;
  tokenEstimate: number;
  charCount: number;
}

export interface CompiledGenomePrompts {
  genomeHash: string;
  compilerVersion: string;
  prompts: Record<PromptRole, CompiledPromptArtifact>;
}

export interface ComplexityMetrics {
  genomeCharCount: number;
  genomeSentenceCount: number;
  compiledPromptChars: Record<PromptRole, number>;
  compiledPromptTotalChars: number;
  deltaGenomeChars: number | null;
  deltaCompiledPromptChars: number | null;
}

export interface ResearcherPolicyThresholds {
  minAnchorDelta?: number;
  maxDecodeDrop?: number;
  maxSideGap?: number;
  maxComplexityGrowthWithoutGain?: number;
}

export interface ResearcherPolicyNotice {
  code: string;
  severity: "info" | "warning";
  message: string;
}

export type DisclosureArtifactType =
  | "patch_card"
  | "exemplar_clue"
  | "delayed_dossier";

export interface DisclosureArtifact {
  type: DisclosureArtifactType;
  title: string;
  body: string;
  sourceRunId?: string;
  sourceSprint?: number;
}

export interface CoachPromptEnvironment {
  opponentGenome?: GenomeModules;
  disclosureText?: string;
  matchmakingBucket?: string;
  researcherPolicy?: ResearcherPolicyThresholds;
  arenaId?: string;
  arenaBriefing?: string;
}

export interface TrainingSprintMetrics {
  matchIds: number[];
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  meanRoundsPerMatch: number;
}

export interface ExecutionMetrics {
  ownDecodeRate: number;
  opponentInterceptRateAgainstUs: number;
  ourInterceptRate: number;
  miscommunicationRate: number;
  catastrophicAsymmetryRate: number;
}

export interface DeliberationExecutionMetrics {
  ownConsensusRate: number;
  interceptConsensusRate: number;
  timeoutRate: number;
  fallbackRate: number;
  meanDeliberationExchanges: number;
}

export interface LeakageMetrics {
  meanLeakageScore: number;
  maxLeakageScore: number;
  keywordMentionRate: number;
  codePatternRate: number;
}

export interface SideBalanceMetrics {
  amberWinRate: number;
  blueWinRate: number;
  sideGap: number;
  amberMatchCount: number;
  blueMatchCount: number;
}

export interface AnchorABReport {
  incomplete: boolean;
  anchorsUsed: string[];
  incumbentWinRate: number;
  candidateWinRate: number;
  delta: number;
  incumbentMatchIds: number[];
  candidateMatchIds: number[];
  perAnchor: Array<{
    label: string;
    incumbentWins: number;
    candidateWins: number;
    total: number;
  }>;
}

export type PatchReviewStatus = "clear" | "trigger_fired" | "mixed" | "insufficient_data";

export interface PatchReviewSummary {
  proposalId: string;
  committedSprint: number;
  status: PatchReviewStatus;
  firedTriggers: string[];
}

export interface SprintEvaluation {
  runId: string;
  sprintNumber: number;
  training: TrainingSprintMetrics;
  execution: ExecutionMetrics;
  deliberation: DeliberationExecutionMetrics;
  leakage: LeakageMetrics;
  sideBalance: SideBalanceMetrics;
  complexity: ComplexityMetrics;
  anchor?: AnchorABReport;
  pendingPatchReviews: PatchReviewSummary[];
  policyNotices: ResearcherPolicyNotice[];
  evidenceLines: string[];
}

export interface SprintEvaluationInput {
  runId: string;
  sprintNumber: number;
  matchIds: number[];
  focalTeam: "amber" | "blue";
  currentGenome: GenomeModules;
  previousGenome?: GenomeModules;
  compiledPrompts?: CompiledGenomePrompts;
}

export interface CoachProposal {
  proposalId: string;
  beliefUpdates: CoachBeliefUpdate[];
  summary: string;
  hypothesis: string;
  patch: CoachPatchBundle | null;
  review?: CoachReviewResult;
}

export interface CoachReviewResult {
  decision: CoachDecision;
  rationale: string;
  confidence: number;
  policyResponse?: string;
}

export interface RollbackTriggerEvaluation {
  description: string;
  status: "clear" | "fired" | "insufficient_data";
  evidenceLines: string[];
  supportingMetrics: Record<string, number | null>;
}

export interface PatchReview {
  runId: string;
  proposalId: string;
  committedSprint: number;
  reviewSprint: number;
  status: PatchReviewStatus;
  evaluations: RollbackTriggerEvaluation[];
  summary: string;
}

export interface CoachConfig {
  coachProvider: AIProvider;
  coachModel: string;
  playerProvider: AIProvider;
  playerModel: string;
  matchesPerSprint: number;
  sprintConcurrency: number;
  totalSprints: number;
  opponentGenome?: GenomeModules;
  teamSize: 2 | 3;
  budgetCapUsd?: number;
}

export interface MatchmakingWeights {
  nearPeer: number;
  diagnostic: number;
  mirror: number;
  novelty: number;
  baseline: number;
}

export interface ArenaConfig {
  arenaId: string;
  seedGenomes: GenomeModules[];
  coachConfig: Omit<CoachConfig, "opponentGenome">;
  totalSprints: number;
  matchesPerSprint: number;
  globalMatchConcurrency: number;
  matchmaking: MatchmakingWeights;
  foiaEnabled: boolean;
  foiaDelaySprints?: number;
  gameRules?: GameRules;
}

export interface ArenaCoachSlot {
  slotIndex: number;
  runId: string;
  seedGenome: GenomeModules;
  currentGenome: GenomeModules;
  wins: number;
  losses: number;
  draws: number;
}

export interface ArenaResult {
  arenaId: string;
  slots: ArenaCoachSlot[];
  totalGamesPlayed: number;
  sprintsCompleted: number;
}

export interface CoachMatchmakingNote {
  bucket: string;
  reason: string;
  opponentRunId?: string;
  opponentSlotIndex: number;
  appearanceCount: number;
}

export type DeceptionCategory =
  | "behavior_rationale_divergence"
  | "selective_omission"
  | "observation_sensitivity";

export interface DeliberationPatternVector {
  meanMessageLength: number;
  hedgeRate: number;
  disagreementRate: number;
  revisionRate: number;
  phraseOverlap: number;
}

export interface CoachResearchMetrics {
  completedMatches?: number;
  wins?: number;
  losses?: number;
  draws?: number;
  matchmaking?: CoachMatchmakingNote[];
  deception?: Record<DeceptionCategory, { meanScore: number; maxScore: number; totalFindings: number }>;
  deliberationPatterns?: DeliberationPatternVector;
}

export type PatchIndexDecision = "committed" | "reverted" | "invalid" | "rolled_back";

export interface PatchMeasuredOutcome {
  wins: number;
  losses: number;
  draws: number;
}

export const coachRuns = pgTable("coach_runs", {
  id: varchar("id", { length: 64 }).primaryKey(),
  status: varchar("status", { length: 20 }).$type<CoachRunStatus>().notNull(),
  config: jsonb("config").$type<CoachConfig>().notNull(),
  initialGenome: jsonb("initial_genome").$type<GenomeModules>().notNull(),
  currentGenome: jsonb("current_genome").$type<GenomeModules>().notNull(),
  currentBeliefs: jsonb("current_beliefs").$type<CoachBelief[]>().default([]),
  currentSprint: integer("current_sprint").notNull().default(0),
  arenaId: varchar("arena_id", { length: 64 }),
  searchPolicy: jsonb("search_policy").$type<SearchPolicy>().notNull().default(DEFAULT_SEARCH_POLICY),
  budgetCapUsd: varchar("budget_cap_usd", { length: 20 }),
  actualCostUsd: varchar("actual_cost_usd", { length: 20 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
});

export const insertCoachRunSchema = createInsertSchema(coachRuns).omit({ createdAt: true });
export type InsertCoachRun = z.infer<typeof insertCoachRunSchema>;
export type CoachRun = typeof coachRuns.$inferSelect;

export const coachSprints = pgTable("coach_sprints", {
  id: serial("id").primaryKey(),
  runId: varchar("run_id", { length: 64 }).notNull(),
  sprintNumber: integer("sprint_number").notNull(),
  opponentRunId: varchar("opponent_run_id", { length: 64 }),
  matchIds: jsonb("match_ids").$type<number[]>().default([]),
  record: varchar("record", { length: 20 }).notNull(),
  winRate: varchar("win_rate", { length: 20 }).notNull(),
  genomeBefore: jsonb("genome_before").$type<GenomeModules>().notNull(),
  genomeAfter: jsonb("genome_after").$type<GenomeModules>().notNull(),
  beliefsAfter: jsonb("beliefs_after").$type<CoachBelief[]>().default([]),
  decision: varchar("decision", { length: 10 }).$type<CoachDecision>().notNull(),
  patch: jsonb("patch").$type<CoachStructuredPatch | null>(),
  proposal: jsonb("proposal").$type<CoachProposal | null>(),
  anchorSummary: jsonb("anchor_summary").$type<AnchorABReport | null>(),
  patchBundle: jsonb("patch_bundle").$type<CoachPatchBundle | null>(),
  disclosureText: text("disclosure_text"),
  researchMetrics: jsonb("research_metrics").$type<CoachResearchMetrics>().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertCoachSprintSchema = createInsertSchema(coachSprints).omit({ id: true, createdAt: true });
export type InsertCoachSprint = z.infer<typeof insertCoachSprintSchema>;
export type CoachSprint = typeof coachSprints.$inferSelect;

export const sprintEvaluations = pgTable("sprint_evaluations", {
  id: serial("id").primaryKey(),
  runId: varchar("run_id", { length: 64 }).notNull(),
  sprintNumber: integer("sprint_number").notNull(),
  evaluation: jsonb("evaluation").$type<SprintEvaluation>().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  runSprintUnique: uniqueIndex("sprint_evaluations_run_id_sprint_number_unique").on(table.runId, table.sprintNumber),
}));

export const insertSprintEvaluationRecordSchema = createInsertSchema(sprintEvaluations).omit({ id: true, createdAt: true });
export type InsertSprintEvaluationRecord = z.infer<typeof insertSprintEvaluationRecordSchema>;
export type SprintEvaluationRecord = typeof sprintEvaluations.$inferSelect;

export type AnchorEvaluationVariant = "incumbent" | "candidate";
export type AnchorEvaluationSummary = Record<string, unknown>;

export const anchorEvaluations = pgTable("anchor_evaluations", {
  id: serial("id").primaryKey(),
  runId: varchar("run_id", { length: 64 }).notNull(),
  sprintNumber: integer("sprint_number").notNull(),
  proposalId: varchar("proposal_id", { length: 64 }),
  variant: varchar("variant", { length: 16 }).$type<AnchorEvaluationVariant>().notNull(),
  anchorLabel: varchar("anchor_label", { length: 64 }).notNull(),
  matchIds: jsonb("match_ids").$type<number[] | null>(),
  summary: jsonb("summary").$type<AnchorEvaluationSummary | null>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAnchorEvaluationRecordSchema = createInsertSchema(anchorEvaluations).omit({ id: true, createdAt: true });
export type InsertAnchorEvaluationRecord = z.infer<typeof insertAnchorEvaluationRecordSchema>;
export type AnchorEvaluationRecord = typeof anchorEvaluations.$inferSelect;

export const patchIndex = pgTable("patch_index", {
  id: serial("id").primaryKey(),
  runId: varchar("run_id", { length: 64 }).notNull(),
  sprintNumber: integer("sprint_number").notNull(),
  module: varchar("module", { length: 32 }).notNull(),
  decision: varchar("decision", { length: 16 }).$type<PatchIndexDecision>().notNull(),
  proposalId: varchar("proposal_id", { length: 64 }),
  delta: jsonb("delta").$type<CoachSemanticDelta | null>(),
  genomeBefore: jsonb("genome_before").$type<GenomeModules | null>(),
  genomeAfter: jsonb("genome_after").$type<GenomeModules | null>(),
  measuredOutcome: jsonb("measured_outcome").$type<PatchMeasuredOutcome | null>(),
  reviewDueSprint: integer("review_due_sprint"),
  reviewStatus: varchar("review_status", { length: 24 }).$type<PatchReviewStatus | null>(),
  reviewSummary: text("review_summary"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertPatchIndexSchema = createInsertSchema(patchIndex).omit({ id: true, createdAt: true });
export type InsertPatchIndex = z.infer<typeof insertPatchIndexSchema>;
export type PatchIndex = typeof patchIndex.$inferSelect;

export const patchReviews = pgTable("patch_reviews", {
  id: serial("id").primaryKey(),
  runId: varchar("run_id", { length: 64 }).notNull(),
  proposalId: varchar("proposal_id", { length: 64 }).notNull(),
  committedSprint: integer("committed_sprint").notNull(),
  reviewSprint: integer("review_sprint").notNull(),
  status: varchar("status", { length: 24 }).$type<PatchReviewStatus>().notNull(),
  evaluations: jsonb("evaluations").$type<RollbackTriggerEvaluation[] | null>(),
  summary: text("summary"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertPatchReviewRecordSchema = createInsertSchema(patchReviews).omit({ id: true, createdAt: true });
export type InsertPatchReviewRecord = z.infer<typeof insertPatchReviewRecordSchema>;
export type PatchReviewRecord = typeof patchReviews.$inferSelect;

export const metricYield = pgTable("metric_yield", {
  id: serial("id").primaryKey(),
  arenaId: varchar("arena_id", { length: 64 }).notNull(),
  metricKey: varchar("metric_key", { length: 100 }).notNull(),
  sampleSize: integer("sample_size").notNull().default(0),
  coverage: real("coverage").notNull().default(0),
  variance: real("variance"),
  correlationWithNextSprintWinRate: real("correlation_with_next_sprint_win_rate"),
  correlationWithCommitDecision: real("correlation_with_commit_decision"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertMetricYieldSchema = createInsertSchema(metricYield).omit({ id: true, updatedAt: true });
export type InsertMetricYield = z.infer<typeof insertMetricYieldSchema>;
export type MetricYield = typeof metricYield.$inferSelect;

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
