import {
  GameState,
  GamePhase,
  Player,
  HeadlessMatchConfig,
  AIPlayerConfig,
  AblationFlag,
  ChatterMessage,
  MatchQualityEvent,
  MatchQualityStatus,
  MatchQualitySummary,
  ScratchNotesSnapshot,
  buildMatchPlayerConfigs,
  normalizeHeadlessMatchConfig,
  DEFAULT_GAME_RULES,
  HeadlessPromptOverrides,
  TeamId,
  PromptRole,
} from "@shared/schema";
import {
  createNewGame,
  addPlayer,
  autoAssignRemainingPlayers,
  startGame,
  startNewRound,
  submitClues,
  submitOwnTeamGuess,
  submitInterception,
  generatePlayerId,
  getAIProviderName,
  generateSeed,
  createSeededRng,
  generateSecretCode,
  validateGameState,
  isGameDecided,
  getConfigForPlayer,
} from "./game";
import { getRandomKeywords } from "./wordPacks";
import {
  generateClues,
  generateGuess,
  generateInterception,
  generateDeliberationMessage,
  generateReflection,
  estimateCost,
  AICallResult,
  ADVANCED_STRATEGIES,
  withAICallTimeout,
} from "./ai";
import {
  getPromptStrategy,
  formatScratchNotes,
  defaultDeliberationOwnFirstTurn,
  defaultDeliberationOwnFollowUp,
  defaultDeliberationInterceptFirstTurn,
  defaultDeliberationInterceptFollowUp,
} from "./promptStrategies";
import type { DeliberationOwnTemplateParams, DeliberationInterceptTemplateParams } from "./promptStrategies";
import { storage } from "./storage";
import { log } from "./index";
import { emitMatchEvent, clearMatchEventSequence } from "./matchEvents";
import type { ModelHealthTracker } from "./modelHealth";

// Timeout is now controlled per-player via config.timeoutMs (validated by schema: min 10s, max 1hr)

interface HeadlessResult {
  matchId: number;
  gameId: string;
  winner: "amber" | "blue" | null;
  totalRounds: number;
  teams: GameState["teams"];
  players: Player[];
  updatedScratchNotes?: Partial<Record<"amber" | "blue", ScratchNotesSnapshot>>;
}

function resolveRoleSystemPrompt(
  overrides: HeadlessPromptOverrides | undefined,
  team: TeamId,
  role: Exclude<PromptRole, "coach">,
): string | undefined {
  return overrides?.[team]?.compiledPrompts?.prompts[role]?.systemPrompt
    ?? overrides?.[team]?.monolithicSystemPrompt
    ?? undefined;
}

function resolveRoleTaskDirectives(
  overrides: HeadlessPromptOverrides | undefined,
  team: TeamId,
  role: Exclude<PromptRole, "coach">,
): string | undefined {
  return overrides?.[team]?.compiledPrompts?.prompts[role]?.taskDirectives ?? undefined;
}

function resolveDeliberationPromptRole(
  phase: DeliberationContext["phase"],
): "own_deliberator" | "intercept_deliberator" {
  return phase === "own_guess_deliberation" ? "own_deliberator" : "intercept_deliberator";
}

function normalizePromptOverrides(
  config: HeadlessMatchConfig,
  legacyTeamSystemPrompts?: Record<string, string>,
): HeadlessPromptOverrides | undefined {
  if (config.promptOverrides) return config.promptOverrides;
  if (!legacyTeamSystemPrompts) return undefined;
  const overrides: HeadlessPromptOverrides = {};
  if (legacyTeamSystemPrompts.amber) {
    overrides.amber = { monolithicSystemPrompt: legacyTeamSystemPrompts.amber };
  }
  if (legacyTeamSystemPrompts.blue) {
    overrides.blue = { monolithicSystemPrompt: legacyTeamSystemPrompts.blue };
  }
  return Object.keys(overrides).length > 0 ? overrides : undefined;
}

async function logAiCall(
  matchId: number,
  gameId: string,
  roundNumber: number,
  provider: string,
  actionType: string,
  callResult: AICallResult<any>,
  timedOut: boolean,
  usedFallback: boolean = false,
  team: "amber" | "blue" | null = null,
  playerId: string | null = null,
) {
  try {
    await storage.createAiCallLog({
      matchId,
      gameId,
      roundNumber,
      provider,
      model: callResult.model,
      actionType,
      prompt: callResult.prompt,
      rawResponse: callResult.rawResponse || null,
      parsedResult: callResult.result,
      latencyMs: callResult.latencyMs,
      timedOut,
      error: callResult.error || null,
      parseQuality: callResult.parseQuality || null,
      usedFallback,
      promptTokens: callResult.promptTokens || null,
      completionTokens: callResult.completionTokens || null,
      totalTokens: callResult.totalTokens || null,
      estimatedCostUsd: callResult.estimatedCostUsd || null,
      reasoningTrace: callResult.reasoningTrace || null,
    });
  } catch (err) {
    log(`[headless] Failed to log AI call: ${err}`, "headless");
  }

  await emitMatchEvent(gameId, matchId, {
    eventType: "ai_call",
    team,
    playerId,
    provider,
    model: callResult.model,
    actionType,
    latencyMs: callResult.latencyMs,
    timedOut,
    usedFallback,
    error: callResult.error || null,
    parseQuality: callResult.parseQuality || null,
    promptTokens: callResult.promptTokens || null,
    completionTokens: callResult.completionTokens || null,
    totalTokens: callResult.totalTokens || null,
    estimatedCostUsd: callResult.estimatedCostUsd || null,
    reasoningTrace: callResult.reasoningTrace || null,
  }, { round: roundNumber, team, playerId });
}

interface MatchQualityRuntimeState {
  clueCalls: Record<"amber" | "blue", number>;
  fallbackClueCalls: Record<"amber" | "blue", number>;
  taintEvents: MatchQualityEvent[];
}

function createMatchQualityRuntimeState(): MatchQualityRuntimeState {
  return {
    clueCalls: { amber: 0, blue: 0 },
    fallbackClueCalls: { amber: 0, blue: 0 },
    taintEvents: [],
  };
}

function recordMatchQualityEvent(state: MatchQualityRuntimeState, event: MatchQualityEvent) {
  state.taintEvents.push(event);
}

function maybeRecordApiError(
  state: MatchQualityRuntimeState,
  roundNumber: number,
  actionType: string,
  team: "amber" | "blue",
  player: Player,
  config: AIPlayerConfig,
  callResult: AICallResult<any>,
  timedOut: boolean,
) {
  if (!callResult.error || timedOut) return;
  recordMatchQualityEvent(state, {
    type: "api_error",
    roundNumber,
    actionType,
    team,
    playerName: player.name,
    provider: config.provider,
    model: config.model,
    timedOut,
    usedFallback: false,
    error: callResult.error,
  });
}

function buildMatchQualitySummary(state: MatchQualityRuntimeState): { qualityStatus: MatchQualityStatus; qualitySummary: MatchQualitySummary } {
  const clueGeneration = {
    amber: {
      clueCalls: state.clueCalls.amber,
      fallbackClueCalls: state.fallbackClueCalls.amber,
      fallbackRate: state.clueCalls.amber > 0 ? state.fallbackClueCalls.amber / state.clueCalls.amber : 0,
    },
    blue: {
      clueCalls: state.clueCalls.blue,
      fallbackClueCalls: state.fallbackClueCalls.blue,
      fallbackRate: state.clueCalls.blue > 0 ? state.fallbackClueCalls.blue / state.clueCalls.blue : 0,
    },
  } satisfies MatchQualitySummary["clueGeneration"];

  const taintReasons: string[] = [];
  if (clueGeneration.amber.fallbackRate > 0.25) {
    taintReasons.push("amber_clue_fallback_rate_exceeded");
  }
  if (clueGeneration.blue.fallbackRate > 0.25) {
    taintReasons.push("blue_clue_fallback_rate_exceeded");
  }

  return {
    qualityStatus: taintReasons.length > 0 ? "tainted" : "clean",
    qualitySummary: {
      clueGeneration,
      taintReasons,
      taintEvents: state.taintEvents,
    },
  };
}

async function processClues(
  game: GameState,
  matchId: number,
  qualityState: MatchQualityRuntimeState,
  scratchNotesMap?: Record<string, string>,
  ablations?: AblationFlag[],
  promptOverrides?: HeadlessPromptOverrides,
  healthTracker?: ModelHealthTracker,
  matchConfig?: HeadlessMatchConfig,
): Promise<GameState> {
  for (const team of ["amber", "blue"] as const) {
    const clueGiverId = game.currentClueGiver[team];
    if (!clueGiverId || game.currentClues[team]) continue;

    const clueGiver = game.players.find(p => p.id === clueGiverId);
    if (!clueGiver?.isAI || !clueGiver.aiProvider) continue;

    const config = getConfigForPlayer(clueGiver);
    const code = game.currentCode[team]!;
    const keywords = game.teams[team].keywords;
    const history = game.teams[team].history.map(h => ({
      clues: h.clues,
      targetCode: h.targetCode,
    }));

    const noteKey = `${clueGiver.aiProvider}-${team}`;
    const GENERIC_FALLBACK_POOL = ["signal", "trace", "mark", "pulse", "drift", "bloom", "frost", "ridge", "shore", "vault"];
    const fallbackClues = Array.from({ length: 3 }, () => GENERIC_FALLBACK_POOL[Math.floor(Math.random() * GENERIC_FALLBACK_POOL.length)]);
    const teamNotesClue = matchConfig?.scratchNotesByTeam?.[team] ?? scratchNotesMap?.[noteKey];
    const clueParams = { keywords, targetCode: code, history, scratchNotes: teamNotesClue, ablations, systemPromptOverride: resolveRoleSystemPrompt(promptOverrides, team, "cluegiver"), taskDirectives: resolveRoleTaskDirectives(promptOverrides, team, "cluegiver") };

    const { result: callResult, timedOut } = await withAICallTimeout(
      config.timeoutMs,
      generateClues(config, clueParams, { healthTracker }),
      fallbackClues,
      config.model
    );

    if (timedOut) {
      log(`[headless] WARNING: Clue generation timed out for ${clueGiver.name} (${config.model}) in match ${matchId} round ${game.round}`, "headless");
    }
    if (callResult.parseQuality === "error") {
      log(`[headless] WARNING: Clue parse error for ${clueGiver.name} (${config.model}) in match ${matchId} round ${game.round}. Raw: "${(callResult.rawResponse || "").slice(0, 200)}"`, "headless");
    }
    const usedFallback = timedOut || callResult.parseQuality === "error" || callResult.parseQuality === "fallback_used";
    qualityState.clueCalls[team] += 1;
    if (usedFallback) {
      qualityState.fallbackClueCalls[team] += 1;
      recordMatchQualityEvent(qualityState, {
        type: "fallback_clue",
        roundNumber: game.round,
        actionType: "generate_clues",
        team,
        playerName: clueGiver.name,
        provider: config.provider,
        model: config.model,
        timedOut,
        usedFallback,
        error: callResult.error || null,
      });
    }
    maybeRecordApiError(qualityState, game.round, "generate_clues", team, clueGiver, config, callResult, timedOut);
    await logAiCall(matchId, game.id, game.round, clueGiver.aiProvider, "generate_clues", callResult, timedOut, usedFallback, team, clueGiver.id);
    game = submitClues(game, team, callResult.result);

    await emitMatchEvent(game.id, matchId, {
      eventType: "clue_submitted",
      team,
      playerId: clueGiver.id,
      clues: callResult.result,
    }, { round: game.round, team, playerId: clueGiver.id });
  }
  return game;
}

async function processGuesses(
  game: GameState,
  matchId: number,
  qualityState: MatchQualityRuntimeState,
  scratchNotesMap?: Record<string, string>,
  ablations?: AblationFlag[],
  promptOverrides?: HeadlessPromptOverrides,
  healthTracker?: ModelHealthTracker,
  matchConfig?: HeadlessMatchConfig,
): Promise<GameState> {
  const fallbackGuess: [number, number, number] = [1, 2, 3];

  for (const team of ["amber", "blue"] as const) {
    if (game.currentGuesses[team].ownTeam) continue;

    const teamPlayers = game.players.filter(p => p.team === team);
    const nonClueGivers = teamPlayers.filter(p => p.id !== game.currentClueGiver[team]);
    let aiGuesser = nonClueGivers.find(p => p.isAI);

    if (!aiGuesser) {
      aiGuesser = teamPlayers.find(p => p.isAI);
    }

    if (!aiGuesser?.aiProvider) continue;

    const config = getConfigForPlayer(aiGuesser);
    const clues = game.currentClues[team]!;
    const keywords = game.teams[team].keywords;
    const history = game.teams[team].history.map(h => ({
      clues: h.clues,
      targetCode: h.targetCode,
    }));

    const noteKey = `${aiGuesser.aiProvider}-${team}`;
    const teamNotesGuess = matchConfig?.scratchNotesByTeam?.[team] ?? scratchNotesMap?.[noteKey];
    const guessParams = { keywords, clues, history, scratchNotes: teamNotesGuess, ablations, systemPromptOverride: resolveRoleSystemPrompt(promptOverrides, team, "own_guesser"), taskDirectives: resolveRoleTaskDirectives(promptOverrides, team, "own_guesser") };
    const { result: callResult, timedOut } = await withAICallTimeout(
      config.timeoutMs,
      generateGuess(config, guessParams, { healthTracker }),
      fallbackGuess,
      config.model
    );

    if (timedOut) {
      log(`[headless] WARNING: Guess generation timed out for ${aiGuesser.name} (${config.model}) in match ${matchId} round ${game.round}`, "headless");
    }
    if (callResult.parseQuality === "error") {
      log(`[headless] WARNING: Guess parse error for ${aiGuesser.name} (${config.model}) in match ${matchId} round ${game.round}. Raw: "${(callResult.rawResponse || "").slice(0, 200)}"`, "headless");
    }
    const usedFallback = timedOut || callResult.parseQuality === "error" || callResult.parseQuality === "fallback_used";
    maybeRecordApiError(qualityState, game.round, "generate_guess", team, aiGuesser, config, callResult, timedOut);
    await logAiCall(matchId, game.id, game.round, aiGuesser.aiProvider, "generate_guess", callResult, timedOut, usedFallback, team, aiGuesser.id);
    game = submitOwnTeamGuess(game, team, callResult.result);

    await emitMatchEvent(game.id, matchId, {
      eventType: "guess_submitted",
      team,
      playerId: aiGuesser.id,
      guess: callResult.result,
      correct: arraysEqual(callResult.result, game.currentCode[team]!),
    }, { round: game.round, team, playerId: aiGuesser.id });
  }
  return game;
}

async function processInterceptions(
  game: GameState,
  matchId: number,
  qualityState: MatchQualityRuntimeState,
  scratchNotesMap?: Record<string, string>,
  ablations?: AblationFlag[],
  promptOverrides?: HeadlessPromptOverrides,
  healthTracker?: ModelHealthTracker,
  matchConfig?: HeadlessMatchConfig,
): Promise<GameState> {
  const fallbackGuess: [number, number, number] = [1, 2, 3];

  for (const team of ["amber", "blue"] as const) {
    if (game.currentGuesses[team].opponent) continue;

    const opponentTeam = team === "amber" ? "blue" : "amber";
    const teamPlayers = game.players.filter(p => p.team === team);
    const aiInterceptor = teamPlayers.find(p => p.isAI);

    if (!aiInterceptor?.aiProvider) continue;

    const config = getConfigForPlayer(aiInterceptor);
    const clues = game.currentClues[opponentTeam]!;
    const history = game.teams[opponentTeam].history.map(h => ({
      clues: h.clues,
      targetCode: h.targetCode,
    }));

    const noteKey = `${aiInterceptor.aiProvider}-${team}`;
    const teamNotesIntercept = matchConfig?.scratchNotesByTeam?.[team] ?? scratchNotesMap?.[noteKey];
    const interceptParams = { clues, history, scratchNotes: teamNotesIntercept, ablations, systemPromptOverride: resolveRoleSystemPrompt(promptOverrides, team, "interceptor"), taskDirectives: resolveRoleTaskDirectives(promptOverrides, team, "interceptor") };
    const { result: callResult, timedOut } = await withAICallTimeout(
      config.timeoutMs,
      generateInterception(config, interceptParams, { healthTracker }),
      fallbackGuess,
      config.model
    );

    if (timedOut) {
      log(`[headless] WARNING: Interception generation timed out for ${aiInterceptor.name} (${config.model}) in match ${matchId} round ${game.round}`, "headless");
    }
    if (callResult.parseQuality === "error") {
      log(`[headless] WARNING: Interception parse error for ${aiInterceptor.name} (${config.model}) in match ${matchId} round ${game.round}. Raw: "${(callResult.rawResponse || "").slice(0, 200)}"`, "headless");
    }
    const usedFallback = timedOut || callResult.parseQuality === "error" || callResult.parseQuality === "fallback_used";
    maybeRecordApiError(qualityState, game.round, "generate_interception", team, aiInterceptor, config, callResult, timedOut);
    await logAiCall(matchId, game.id, game.round, aiInterceptor.aiProvider, "generate_interception", callResult, timedOut, usedFallback, team, aiInterceptor.id);
    game = submitInterception(game, team, callResult.result);

    await emitMatchEvent(game.id, matchId, {
      eventType: "interception_submitted",
      team,
      playerId: aiInterceptor.id,
      guess: callResult.result,
      success: arraysEqual(callResult.result, game.currentCode[opponentTeam]!),
    }, { round: game.round, team, playerId: aiInterceptor.id });
  }
  return game;
}

// --- 3v3 Team Deliberation ---

interface DeliberationContext {
  team: "amber" | "blue";
  phase: "own_guess_deliberation" | "opponent_intercept_deliberation";
  clues: string[];
  keywords?: string[];
  teamHistory: Array<{ clues: string[]; targetCode: [number, number, number] }>;
  opponentHistory?: Array<{ clues: string[]; targetCode: [number, number, number] }>;
  opponentDeliberationTranscript?: ChatterMessage[];
  clueGiverName: string;
  // 2 for own-guess (clue-giver always excluded); all team members (including the
  // clue-giver, who has no special knowledge of the opponent's code) for interception.
  guessers: Player[];
  scratchNotes?: Record<string, string>;
  scratchNotesByTeam?: Partial<Record<"amber" | "blue", string>>;
  ablations?: AblationFlag[];
  promptOverrides?: HeadlessPromptOverrides;
  roundNumber: number;
  score: { amber: { miscommunication: number; interception: number }; blue: { miscommunication: number; interception: number } };
}

interface DeliberationResult {
  answer: [number, number, number];
  messages: ChatterMessage[];
  totalExchanges: number;
  consensusReached: boolean;
  timedOut: boolean;
  usedFallback: boolean;
  error: string | null;
  terminationReason: "timeout" | "phase_timeout" | "error" | "max_exchanges" | null;
}

function parseReadySignal(content: string): [number, number, number] | null {
  const match = content.match(/READY:\s*([1-4])\s*,\s*([1-4])\s*,\s*([1-4])/i);
  if (!match) return null;
  return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
}

function arraysEqual(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((val, idx) => val === b[idx]);
}

async function processDeliberation(
  context: DeliberationContext,
  matchId: number,
  gameId: string,
  roundNumber: number,
  qualityState: MatchQualityRuntimeState,
  healthTracker?: ModelHealthTracker,
): Promise<DeliberationResult> {
  const MAX_EXCHANGES = 10; // 10 rounds of every participant speaking once
  const messages: ChatterMessage[] = [];
  const readySignals: Map<string, [number, number, number]> = new Map();
  const participants = context.guessers;
  const opponentTeam: "amber" | "blue" = context.team === "amber" ? "blue" : "amber";
  const phaseStartMs = Date.now();
  const maxPhaseDurationMs = MAX_EXCHANGES * participants.reduce(
    (sum, p) => sum + getConfigForPlayer(p).timeoutMs, 0
  );

  // The single-shot calls get their content ablations applied inside ai.ts
  // (applyAblations, on the clue/guess/interception params). Deliberation
  // builds its own prompts here and generateDeliberationMessage never reads
  // params.ablations, so without this the flags travel with the call and do
  // nothing -- and since teamSize defaults to 3, a no_history or
  // no_scratch_notes run was measuring the un-ablated condition on the path
  // that actually decides both guesses. Semantics deliberately mirror
  // applyAblations: no_history drops all history, no_opponent_history drops
  // only the opponent's (which is read solely by the intercept prompt).
  const flags = context.ablations;
  const teamHistory = flags?.includes("no_history") ? [] : context.teamHistory;
  const opponentHistory =
    flags?.includes("no_history") || flags?.includes("no_opponent_history")
      ? []
      : context.opponentHistory || [];
  const scratchNotesAllowed = !flags?.includes("no_scratch_notes");

  const finalizeDeliberation = (
    terminationReason: DeliberationResult["terminationReason"],
    error: string | null,
    timedOut: boolean,
    usedFallback: boolean,
  ): DeliberationResult => {
    const readyValues = [...readySignals.values()];
    const fallbackAnswer = readyValues.length > 0 ? readyValues[readyValues.length - 1] : [1, 2, 3] as [number, number, number];

    return {
      answer: fallbackAnswer,
      messages,
      totalExchanges: Math.ceil(messages.length / 2),
      consensusReached: false,
      timedOut,
      usedFallback,
      error,
      terminationReason,
    };
  };

  for (let exchange = 0; exchange < MAX_EXCHANGES; exchange++) {
    for (const currentPlayer of participants) {
      const otherPlayers = participants.filter(p => p.id !== currentPlayer.id);
      const lensIndex = participants.indexOf(currentPlayer);
      const isFirstMessageFromCurrentPlayer = !messages.some(m => m.playerId === currentPlayer.id);

      const config = getConfigForPlayer(currentPlayer);
      const strategy = getPromptStrategy(config.promptStrategy || "default");
      // Mirrors generateClues/generateGuess/generateInterception in ai.ts:
      // no_chain_of_thought swaps to the plain templates *and* has to
      // disable native provider reasoning below, or deliberation exchanges
      // would keep using the full advanced-strategy prompt and reasoning
      // budget even after a player's clue/guess/interception calls are
      // correctly de-reasoned by that same ablation.
      const useSimplePrompt = context.ablations?.includes("no_chain_of_thought") && ADVANCED_STRATEGIES.includes(config.promptStrategy);
      const activeStrategy = useSimplePrompt ? getPromptStrategy("default") : strategy;
      let prompt: string;

      // Build conversation-so-far for prompt injection
      const conversationSoFar = messages.map(m => ({ playerName: m.playerName, content: m.content }));

      if (context.phase === "own_guess_deliberation") {
        const templateParams: DeliberationOwnTemplateParams = {
          team: context.team,
          keywords: context.keywords || [],
          clues: context.clues,
          history: teamHistory,
          clueGiverName: context.clueGiverName,
          currentPlayerName: currentPlayer.name,
          otherPlayerNames: otherPlayers.map(p => p.name),
          conversationSoFar,
          exchangeNumber: exchange,
          roundNumber: context.roundNumber,
          score: context.score,
          ablations: context.ablations,
          systemPromptOverride: resolveRoleSystemPrompt(context.promptOverrides, context.team, resolveDeliberationPromptRole(context.phase)),
          taskDirectives: resolveRoleTaskDirectives(context.promptOverrides, context.team, resolveDeliberationPromptRole(context.phase)),
          lensIndex,
        };

        if (isFirstMessageFromCurrentPlayer) {
          const builder = activeStrategy.deliberationOwnTemplate
            ? activeStrategy.deliberationOwnTemplate
            : defaultDeliberationOwnFirstTurn;
          prompt = builder(templateParams);
        } else {
          prompt = defaultDeliberationOwnFollowUp({ ...templateParams, exchangeNumber: exchange });
        }
      } else {
        // opponent_intercept_deliberation
        const opponentTranscriptFormatted = (context.opponentDeliberationTranscript || [])
          .map(m => ({ playerName: m.playerName, content: m.content }));

        const templateParams: DeliberationInterceptTemplateParams = {
          team: context.team,
          opponentTeam,
          clues: context.clues,
          opponentHistory,
          opponentDeliberationTranscript: opponentTranscriptFormatted,
          currentPlayerName: currentPlayer.name,
          otherPlayerNames: otherPlayers.map(p => p.name),
          conversationSoFar,
          exchangeNumber: exchange,
          roundNumber: context.roundNumber,
          score: context.score,
          ablations: context.ablations,
          systemPromptOverride: resolveRoleSystemPrompt(context.promptOverrides, context.team, resolveDeliberationPromptRole(context.phase)),
          taskDirectives: resolveRoleTaskDirectives(context.promptOverrides, context.team, resolveDeliberationPromptRole(context.phase)),
          lensIndex,
        };

        if (isFirstMessageFromCurrentPlayer) {
          const builder = activeStrategy.deliberationInterceptTemplate
            ? activeStrategy.deliberationInterceptTemplate
            : defaultDeliberationInterceptFirstTurn;
          prompt = builder(templateParams);
        } else {
          prompt = defaultDeliberationInterceptFollowUp({ ...templateParams, exchangeNumber: exchange });
        }
      }

      // Append scratch notes (prefer scratchNotesByTeam, fall back to legacy map)
      if (scratchNotesAllowed) {
        const teamNote = context.scratchNotesByTeam?.[context.team];
        if (teamNote) {
          prompt += formatScratchNotes(teamNote);
        } else {
          const noteKey = `${currentPlayer.aiProvider}-${context.team}`;
          if (context.scratchNotes?.[noteKey]) {
            prompt += formatScratchNotes(context.scratchNotes[noteKey]);
          }
        }
      }

      // Get system prompt from strategy
      const systemPrompt = resolveRoleSystemPrompt(context.promptOverrides, context.team, resolveDeliberationPromptRole(context.phase)) || activeStrategy.systemPrompt;

      const remainingPhaseMs = maxPhaseDurationMs - (Date.now() - phaseStartMs);
      if (remainingPhaseMs <= 0) {
        const error = "deliberation phase timeout";
        recordMatchQualityEvent(qualityState, {
          type: "deliberation_failure",
          roundNumber,
          actionType: context.phase === "own_guess_deliberation" ? "deliberation_own" : "deliberation_intercept",
          team: context.team,
          playerName: currentPlayer.name,
          provider: config.provider,
          model: config.model,
          timedOut: true,
          usedFallback: true,
          error,
          detail: "phase_timeout",
        });
        return finalizeDeliberation("phase_timeout", error, true, true);
      }

      const { result: callResult, timedOut } = await withAICallTimeout(
        Math.min(config.timeoutMs, remainingPhaseMs),
        generateDeliberationMessage(config, {
          systemPrompt,
          userPrompt: prompt,
          ablations: context.ablations,
        }, {
          healthTracker,
          ...(useSimplePrompt ? { disableReasoning: true } : {}),
        }),
        "",
        config.model,
      );
      const usedFallback = timedOut || !!callResult.error || !callResult.result.trim();

      const readySignal = parseReadySignal(callResult.result);
      if (readySignal) {
        readySignals.set(currentPlayer.id, readySignal);
      }

      const message: ChatterMessage = {
        playerId: currentPlayer.id,
        playerName: currentPlayer.name,
        content: callResult.result,
        timestamp: new Date().toISOString(),
        exchangeNumber: exchange,
        model: config.model,
        latencyMs: callResult.latencyMs,
        promptTokens: callResult.promptTokens,
        completionTokens: callResult.completionTokens,
        estimatedCostUsd: callResult.estimatedCostUsd,
        readySignal,
        status: timedOut ? "timeout" : callResult.error ? "error" : usedFallback ? "fallback" : "ok",
        timedOut,
        usedFallback,
        error: callResult.error || null,
      };
      messages.push(message);

      // Log to ai_call_logs
      const actionType = context.phase === "own_guess_deliberation"
        ? "deliberation_own"
        : "deliberation_intercept";
      maybeRecordApiError(qualityState, roundNumber, actionType, context.team, currentPlayer, config, callResult, timedOut);
      await logAiCall(matchId, gameId, roundNumber, currentPlayer.aiProvider!, actionType, callResult, timedOut, usedFallback, context.team, currentPlayer.id);

      if (timedOut || callResult.error || !callResult.result.trim()) {
        recordMatchQualityEvent(qualityState, {
          type: "deliberation_failure",
          roundNumber,
          actionType,
          team: context.team,
          playerName: currentPlayer.name,
          provider: config.provider,
          model: config.model,
          timedOut,
          usedFallback,
          error: callResult.error || (timedOut ? "timeout" : "empty deliberation response"),
          detail: timedOut ? "call_timeout" : callResult.error ? "call_error" : "empty_response",
        });
        return finalizeDeliberation(
          timedOut ? "timeout" : "error",
          callResult.error || (timedOut ? "timeout" : "empty deliberation response"),
          timedOut,
          true,
        );
      }

      // Check consensus: every participant READY with the same answer
      if (readySignals.size === participants.length) {
        const signals = [...readySignals.values()];
        if (signals.every(s => arraysEqual(s, signals[0]))) {
          return {
            answer: signals[0] as [number, number, number],
            messages,
            totalExchanges: exchange + 1,
            consensusReached: true,
            timedOut: false,
            usedFallback: false,
            error: null,
            terminationReason: null,
          };
        }
      }
    }
  }

  return finalizeDeliberation("max_exchanges", null, false, false);
}

async function persistRoundResults(matchId: number, game: GameState) {
  for (const team of ["amber", "blue"] as const) {
    const latestHistory = game.teams[team].history[game.teams[team].history.length - 1];
    if (!latestHistory) continue;

    await storage.createMatchRound({
      matchId,
      roundNumber: latestHistory.round,
      team,
      clueGiverId: latestHistory.clueGiverId,
      code: latestHistory.targetCode,
      clues: latestHistory.clues,
      ownGuess: latestHistory.ownTeamGuess,
      opponentGuess: latestHistory.opponentGuess,
      ownCorrect: latestHistory.ownTeamCorrect,
      intercepted: latestHistory.intercepted,
    });
  }

  await storage.updateMatch(matchId, {
    totalRounds: game.round,
    amberWhiteTokens: game.teams.amber.whiteTokens,
    amberBlackTokens: game.teams.amber.blackTokens,
    blueWhiteTokens: game.teams.blue.whiteTokens,
    blueBlackTokens: game.teams.blue.blackTokens,
  });
}

const DEFAULT_REFLECTION_TOKEN_BUDGET = 1500;
const CONSOLIDATION_THRESHOLD_RATIO = 0.8;

async function logReflectionCall(matchId: number, gameId: string, provider: string, callResult: AICallResult<string>) {
  try {
    await storage.createAiCallLog({
      matchId,
      gameId,
      roundNumber: 0,
      provider,
      model: callResult.model,
      actionType: "reflection",
      prompt: callResult.prompt,
      rawResponse: callResult.rawResponse || null,
      parsedResult: { notes: callResult.result.slice(0, 500) },
      latencyMs: callResult.latencyMs,
      timedOut: false,
      error: callResult.error || null,
      parseQuality: callResult.parseQuality || null,
      usedFallback: false,
      promptTokens: callResult.promptTokens || null,
      completionTokens: callResult.completionTokens || null,
      totalTokens: callResult.totalTokens || null,
      estimatedCostUsd: callResult.estimatedCostUsd || null,
      reasoningTrace: callResult.reasoningTrace || null,
    });
  } catch (err) {
    log(`[headless] Failed to log reflection AI call: ${err}`, "headless");
  }
}

async function buildUpdatedScratchNotes(
  game: GameState,
  matchId: number,
  gameId: string,
  config: HeadlessMatchConfig,
): Promise<Partial<Record<"amber" | "blue", ScratchNotesSnapshot>>> {
  if (!config.enablePostMatchReflection) {
    return {};
  }

  // Reflection exists only to write the scratch notes that later matches
  // read. Under no_scratch_notes nothing will ever read them, so the two
  // calls it makes per match are pure spend -- and any that leaked into a
  // prompt would be measuring the condition the ablation is meant to remove.
  if (config.ablations?.flags.includes("no_scratch_notes")) {
    return {};
  }

  const tokenBudget = config.reflectionTokenBudget ?? DEFAULT_REFLECTION_TOKEN_BUDGET;
  const consolidationThreshold = Math.floor(tokenBudget * CONSOLIDATION_THRESHOLD_RATIO);
  const result: Partial<Record<"amber" | "blue", ScratchNotesSnapshot>> = {};

  for (const team of ["amber", "blue"] as const) {
    const teamPlayers = game.players.filter(p => p.team === team && p.isAI);
    if (teamPlayers.length === 0) continue;

    const reflectionPlayer = teamPlayers[0];
    const playerConfig = getConfigForPlayer(reflectionPlayer);
    const opponentTeam: "amber" | "blue" = team === "amber" ? "blue" : "amber";
    const currentNotes = config.scratchNotesByTeam?.[team] || "";
    const currentTokenEstimate = Math.ceil(currentNotes.length / 4);

    let effectiveTokenBudget = tokenBudget;
    let consolidationHint = "";
    if (currentTokenEstimate > consolidationThreshold) {
      consolidationHint = "Consolidate your existing notes into the most essential strategic insights before adding new observations. Stay under " + tokenBudget + " tokens total.";
    }

    try {
      const reflectionResult = await generateReflection(playerConfig, {
        teamKeywords: game.teams[team].keywords,
        teamHistory: game.teams[team].history.map(h => ({ clues: h.clues, targetCode: h.targetCode })),
        opponentHistory: game.teams[opponentTeam].history.map(h => ({ clues: h.clues, targetCode: h.targetCode })),
        winner: game.winner,
        myTeam: team,
        whiteTokens: game.teams[team].whiteTokens,
        blackTokens: game.teams[team].blackTokens,
        opponentWhiteTokens: game.teams[opponentTeam].whiteTokens,
        opponentBlackTokens: game.teams[opponentTeam].blackTokens,
        currentNotes: consolidationHint ? `${consolidationHint}\n\n${currentNotes}` : currentNotes,
        tokenBudget: effectiveTokenBudget,
      });

      await logReflectionCall(matchId, gameId, playerConfig.provider, reflectionResult);

      if (reflectionResult.error) {
        log(`[headless] Reflection failed for team ${team} in match ${matchId}, keeping previous notes`, "headless");
        // On failure, keep previous notes unchanged
        if (currentNotes) {
          result[team] = {
            notesText: currentNotes,
            tokenCount: currentTokenEstimate,
            lastUpdatedMatchId: matchId,
          };
        }
        continue;
      }

      let notesText = reflectionResult.result;
      // Enforce token budget: truncate if exceeding budget
      const approxTokens = Math.ceil(notesText.length / 4);
      if (approxTokens > tokenBudget) {
        notesText = notesText.slice(0, tokenBudget * 4);
      }

      result[team] = {
        notesText,
        tokenCount: Math.ceil(notesText.length / 4),
        lastUpdatedMatchId: matchId,
      };
    } catch (err) {
      log(`[headless] Reflection exception for team ${team} in match ${matchId}: ${err}`, "headless");
      // On failure, keep previous notes unchanged
      if (currentNotes) {
        result[team] = {
          notesText: currentNotes,
          tokenCount: currentTokenEstimate,
          lastUpdatedMatchId: matchId,
        };
      }
    }
  }

  return result;
}

export async function runHeadlessMatch(
  config: HeadlessMatchConfig,
  scratchNotesMap?: Record<string, string>,
  legacyTeamSystemPrompts?: Record<string, string>,
  healthTracker?: ModelHealthTracker,
  onMatchCreated?: (matchId: number) => void,
): Promise<HeadlessResult> {
  config = normalizeHeadlessMatchConfig(config);
  const promptOverrides = normalizePromptOverrides(config, legacyTeamSystemPrompts);
  const hostId = generatePlayerId();
  let game = createNewGame(hostId, config.players[0].name, config.gameRules || DEFAULT_GAME_RULES);

  game = {
    ...game,
    players: [{
      id: hostId,
      name: config.players[0].name,
      isAI: true,
      aiProvider: config.players[0].aiProvider,
      aiConfig: config.players[0].aiConfig,
      team: config.players[0].team,
      isReady: true,
    }],
  };

  for (let i = 1; i < config.players.length; i++) {
    const p = config.players[i];
    const player: Player = {
      id: generatePlayerId(),
      name: p.name,
      isAI: true,
      aiProvider: p.aiProvider,
      aiConfig: p.aiConfig,
      team: p.team,
      isReady: true,
    };
    game = addPlayer(game, player);
  }

  const seed = config.seed || generateSeed();
  const rng = createSeededRng(seed);

  game = startGame(game);
  game = autoAssignRemainingPlayers(game);

  game = {
    ...game,
    teams: {
      amber: { ...game.teams.amber, keywords: getRandomKeywords(4, rng) },
      blue: { ...game.teams.blue, keywords: getRandomKeywords(4, rng) },
    },
  };

  const playerConfigs = buildMatchPlayerConfigs(game.players, config.teamRosters);

  const teamSize = config.teamSize || 3;
  const qualityState = createMatchQualityRuntimeState();
  const initialQuality = buildMatchQualitySummary(qualityState);

  const match = await storage.createMatch({
    gameId: game.id,
    playerConfigs,
    amberKeywords: game.teams.amber.keywords,
    blueKeywords: game.teams.blue.keywords,
    totalRounds: 0,
    amberWhiteTokens: 0,
    amberBlackTokens: 0,
    blueWhiteTokens: 0,
    blueBlackTokens: 0,
    gameSeed: seed,
    ablations: config.ablations || null,
    qualityStatus: initialQuality.qualityStatus,
    qualitySummary: initialQuality.qualitySummary,
    experimentId: config.experimentId || null,
    teamSize,
    arenaId: config.arenaId || null,
    runId: config.runId || null,
    opponentRunId: config.opponentRunId || null,
    sprintNumber: config.sprintNumber ?? null,
    matchKind: config.matchKind || null,
    anchorLabel: config.anchorLabel || null,
    roleSwapGroupId: config.roleSwapGroupId || null,
    focalTeam: config.focalTeam || null,
    gameRules: game.rules,
    matchmakingBucket: config.matchmakingBucket || null,
  });

  const matchId = match.id;
  log(`[headless] Match ${matchId} started (game ${game.id})`, "headless");
  onMatchCreated?.(matchId);

  await emitMatchEvent(game.id, matchId, {
    eventType: "game_created",
    rules: game.rules,
    players: game.players,
    teamSize,
  });

  const ablations = config.ablations?.flags;

  while (game.phase !== "game_over") {
    game = startNewRound(game, rng);
    log(`[headless] Match ${matchId} - Round ${game.round}`, "headless");

    await emitMatchEvent(game.id, matchId, {
      eventType: "round_started",
      round: game.round,
      clueGiver: game.currentClueGiver,
      code: { amber: game.currentCode.amber!, blue: game.currentCode.blue! },
      keywords: { amber: game.teams.amber.keywords, blue: game.teams.blue.keywords },
    }, { round: game.round });

    game = await processClues(game, matchId, qualityState, scratchNotesMap, ablations, promptOverrides, healthTracker, config);

    if (teamSize === 3) {
      // 3v3 mode: deliberation replaces single-shot guess/intercept

      // Phase: own_team_deliberation
      game = { ...game, phase: "own_team_deliberation" as GamePhase };

      const buildScore = () => ({
        amber: { miscommunication: game.teams.amber.whiteTokens, interception: game.teams.amber.blackTokens },
        blue: { miscommunication: game.teams.blue.whiteTokens, interception: game.teams.blue.blackTokens },
      });

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
          // Own-guess deliberation is always exactly the 2 non-clue-givers, by design --
          // the clue-giver already knows the answer, so "guessing" it isn't meaningful.
          guessers: guessers.slice(0, 2),
          scratchNotes: scratchNotesMap,
          scratchNotesByTeam: config.scratchNotesByTeam,
          ablations,
          promptOverrides,
          roundNumber: game.round,
          score: buildScore(),
        };
      };

      const amberCtx = buildOwnDelibContext("amber");
      const blueCtx = buildOwnDelibContext("blue");

      // Run both teams in parallel
      const [amberResult, blueResult] = await Promise.all([
        amberCtx ? processDeliberation(amberCtx, matchId, game.id, game.round, qualityState, healthTracker) : Promise.resolve(null),
        blueCtx ? processDeliberation(blueCtx, matchId, game.id, game.round, qualityState, healthTracker) : Promise.resolve(null),
      ]);

      const ownDelibResults: Record<string, DeliberationResult | null> = {
        amber: amberResult,
        blue: blueResult,
      };

      // Persist chatter and apply guesses
      for (const team of ["amber", "blue"] as const) {
        const result = ownDelibResults[team];
        if (result) {
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

          const lastSpeaker = result.messages[result.messages.length - 1]?.playerId ?? "";
          await emitMatchEvent(game.id, matchId, {
            eventType: "guess_submitted",
            team,
            playerId: lastSpeaker,
            guess: result.answer,
            correct: arraysEqual(result.answer, game.currentCode[team]!),
          }, { round: game.round, team, playerId: lastSpeaker });
        }
      }

      // A team with <2 eligible guessers (e.g. a 1-player-per-team evolution
      // match) gets a null context above and is silently skipped -- despite
      // the log claiming a single-shot fallback, nothing actually submitted
      // a guess for it, so it would never leave this phase. processGuesses
      // already tolerates (and skips) a team that already has a guess in,
      // so this call only affects the team(s) that fell through above.
      if (!amberCtx || !blueCtx) {
        game = await processGuesses(game, matchId, qualityState, scratchNotesMap, ablations, promptOverrides, healthTracker, config);
      }

      // Phase: opponent_deliberation
      game = { ...game, phase: "opponent_deliberation" as GamePhase };

      let interceptionNeedsFallback = false;

      for (const team of ["amber", "blue"] as const) {
        const opponentTeam: "amber" | "blue" = team === "amber" ? "blue" : "amber";
        // Unlike own-guess, the clue-giver is NOT excluded here: intercepting the
        // opponent's code doesn't touch anything the clue-giver has special knowledge
        // of, so all team members are equally eligible (matching the live game's
        // designated-submitter logic, which makes the same call for the same reason).
        const interceptors = game.players.filter(p => p.team === team);

        if (interceptors.length < 2) {
          interceptionNeedsFallback = true;
          continue;
        }

        const opponentTranscript = ownDelibResults[opponentTeam]?.messages || [];

        const result = await processDeliberation({
          team,
          phase: "opponent_intercept_deliberation",
          clues: game.currentClues[opponentTeam]!,
          opponentHistory: game.teams[opponentTeam].history.map(h => ({ clues: h.clues, targetCode: h.targetCode })),
          teamHistory: game.teams[team].history.map(h => ({ clues: h.clues, targetCode: h.targetCode })),
          opponentDeliberationTranscript: opponentTranscript,
          clueGiverName: game.players.find(p => p.id === game.currentClueGiver[opponentTeam]!)!.name,
          guessers: interceptors,
          scratchNotes: scratchNotesMap,
          scratchNotesByTeam: config.scratchNotesByTeam,
          ablations,
          promptOverrides,
          roundNumber: game.round,
          score: buildScore(),
        }, matchId, game.id, game.round, qualityState, healthTracker);

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

        game = submitInterception(game, team, result.answer);

        const lastSpeaker = result.messages[result.messages.length - 1]?.playerId ?? interceptors[0].id;
        await emitMatchEvent(game.id, matchId, {
          eventType: "interception_submitted",
          team,
          playerId: lastSpeaker,
          guess: result.answer,
          success: arraysEqual(result.answer, game.currentCode[opponentTeam]!),
        }, { round: game.round, team, playerId: lastSpeaker });
      }

      // Same single-shot fallback as the own-guess phase above, for
      // whichever team(s) had <2 eligible guessers for interception.
      if (interceptionNeedsFallback) {
        game = await processInterceptions(game, matchId, qualityState, scratchNotesMap, ablations, promptOverrides, healthTracker, config);
      }

    } else {
      // 2v2 mode: existing single-shot behavior
      if (game.phase !== "own_team_guessing") {
        log(`[headless] Match ${matchId} - Unexpected phase after clues: ${game.phase}`, "headless");
        break;
      }

      game = await processGuesses(game, matchId, qualityState, scratchNotesMap, ablations, promptOverrides, healthTracker, config);

      if (game.phase !== "opponent_intercepting") {
        log(`[headless] Match ${matchId} - Unexpected phase after guesses: ${game.phase}`, "headless");
        break;
      }

      game = await processInterceptions(game, matchId, qualityState, scratchNotesMap, ablations, promptOverrides, healthTracker, config);
    }

    if (game.phase === "round_results" || game.phase === "game_over") {
      await persistRoundResults(matchId, game);

      const amberLatest = game.teams.amber.history[game.teams.amber.history.length - 1];
      const blueLatest = game.teams.blue.history[game.teams.blue.history.length - 1];
      if (amberLatest && blueLatest) {
        await emitMatchEvent(game.id, matchId, {
          eventType: "round_completed",
          round: game.round,
          teams: {
            amber: {
              ownTeamCorrect: amberLatest.ownTeamCorrect,
              intercepted: amberLatest.intercepted,
              whiteTokensAwarded: amberLatest.ownTeamCorrect ? 0 : 1,
              blackTokensAwarded: amberLatest.intercepted ? 1 : 0,
            },
            blue: {
              ownTeamCorrect: blueLatest.ownTeamCorrect,
              intercepted: blueLatest.intercepted,
              whiteTokensAwarded: blueLatest.ownTeamCorrect ? 0 : 1,
              blackTokensAwarded: blueLatest.intercepted ? 1 : 0,
            },
          },
        }, { round: game.round });
      }
    }

    // startNewRound doesn't check whether the round it just followed already
    // decided the game -- only advanceFromRoundResults does that, and this
    // loop calls startNewRound directly (to keep seeded rng threading through
    // it) rather than that helper. So a decided game must be finalized here,
    // or the loop would keep playing rounds past the token limits forever.
    if (game.phase === "round_results" && isGameDecided(game)) {
      game = { ...game, phase: "game_over" };
    }

    const validationErrors = validateGameState(game);
    if (validationErrors.length > 0) {
      log(`[headless] Match ${matchId} validation issues: ${JSON.stringify(validationErrors)}`, "headless");
    }

    if (game.phase === "game_over") {
      break;
    }
  }

  const finalQuality = buildMatchQualitySummary(qualityState);
  await storage.updateMatch(matchId, {
    completedAt: new Date(),
    winner: game.winner,
    totalRounds: game.round,
    amberWhiteTokens: game.teams.amber.whiteTokens,
    amberBlackTokens: game.teams.amber.blackTokens,
    blueWhiteTokens: game.teams.blue.whiteTokens,
    blueBlackTokens: game.teams.blue.blackTokens,
    qualityStatus: finalQuality.qualityStatus,
    qualitySummary: finalQuality.qualitySummary,
  });

  log(`[headless] Match ${matchId} completed - Winner: ${game.winner || "none"} in ${game.round} rounds`, "headless");

  await emitMatchEvent(game.id, matchId, {
    eventType: "game_completed",
    winner: game.winner,
    finalTokens: {
      amber: { whiteTokens: game.teams.amber.whiteTokens, blackTokens: game.teams.amber.blackTokens },
      blue: { whiteTokens: game.teams.blue.whiteTokens, blackTokens: game.teams.blue.blackTokens },
    },
  });
  clearMatchEventSequence(game.id);

  // Post-match reflection for scratch notes
  const updatedScratchNotes = await buildUpdatedScratchNotes(game, matchId, game.id, config);

  return {
    matchId,
    gameId: game.id,
    winner: game.winner,
    totalRounds: game.round,
    teams: game.teams,
    players: game.players,
    updatedScratchNotes: Object.keys(updatedScratchNotes).length > 0 ? updatedScratchNotes : undefined,
  };
}
