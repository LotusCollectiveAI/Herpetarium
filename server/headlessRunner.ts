import { GameState, Player, HeadlessMatchConfig, AIProvider, AIPlayerConfig, getDefaultConfig } from "@shared/schema";
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
  getRandomKeywords,
  generateSecretCode,
  validateGameState,
} from "./game";
import {
  generateClues,
  generateGuess,
  generateInterception,
  AICallResult,
} from "./ai";
import { storage } from "./storage";
import { log } from "./index";

const AI_TIMEOUT_MS = 60000;

interface HeadlessResult {
  matchId: number;
  gameId: string;
  winner: "amber" | "blue" | null;
  totalRounds: number;
  teams: GameState["teams"];
  players: Player[];
}

function withTimeout<T>(
  promise: Promise<AICallResult<T>>,
  timeoutMs: number,
  fallback: T,
  model: string
): Promise<{ result: AICallResult<T>; timedOut: boolean }> {
  const wrappedPromise = promise.then(r => ({ result: r, timedOut: false }));
  const timeoutPromise = new Promise<{ result: AICallResult<T>; timedOut: boolean }>(resolve =>
    setTimeout(() => resolve({
      result: { result: fallback, prompt: "", rawResponse: "", model, latencyMs: timeoutMs, error: "timeout", parseQuality: "error" as const },
      timedOut: true,
    }), timeoutMs)
  );
  return Promise.race([wrappedPromise, timeoutPromise]).catch(() => ({
    result: { result: fallback, prompt: "", rawResponse: "", model, latencyMs: 0, error: "unknown error", parseQuality: "error" as const },
    timedOut: false,
  }));
}

function getConfigForPlayer(player: Player): AIPlayerConfig {
  if (player.aiConfig) return player.aiConfig;
  if (player.aiProvider) return getDefaultConfig(player.aiProvider);
  return getDefaultConfig("chatgpt");
}

async function logAiCall(matchId: number, gameId: string, roundNumber: number, provider: string, actionType: string, callResult: AICallResult<any>, timedOut: boolean) {
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
      promptTokens: callResult.promptTokens || null,
      completionTokens: callResult.completionTokens || null,
      totalTokens: callResult.totalTokens || null,
      estimatedCostUsd: callResult.estimatedCostUsd || null,
    });
  } catch (err) {
    log(`[headless] Failed to log AI call: ${err}`, "headless");
  }
}

async function processClues(game: GameState, matchId: number, scratchNotesMap?: Record<string, string>): Promise<GameState> {
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
    const fallbackClues = code.map(n => keywords[n - 1].slice(0, 3));
    const clueParams = { keywords, targetCode: code, history, scratchNotes: scratchNotesMap?.[noteKey] };

    const { result: callResult, timedOut } = await withTimeout(
      generateClues(config, clueParams),
      AI_TIMEOUT_MS,
      fallbackClues,
      config.model
    );

    await logAiCall(matchId, game.id, game.round, clueGiver.aiProvider, "generate_clues", callResult, timedOut);
    game = submitClues(game, team, callResult.result);
  }
  return game;
}

async function processGuesses(game: GameState, matchId: number, scratchNotesMap?: Record<string, string>): Promise<GameState> {
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
    const guessParams = { keywords, clues, history, scratchNotes: scratchNotesMap?.[noteKey] };
    const { result: callResult, timedOut } = await withTimeout(
      generateGuess(config, guessParams),
      AI_TIMEOUT_MS,
      fallbackGuess,
      config.model
    );

    await logAiCall(matchId, game.id, game.round, aiGuesser.aiProvider, "generate_guess", callResult, timedOut);
    game = submitOwnTeamGuess(game, team, callResult.result);
  }
  return game;
}

async function processInterceptions(game: GameState, matchId: number, scratchNotesMap?: Record<string, string>): Promise<GameState> {
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
    const interceptParams = { clues, history, scratchNotes: scratchNotesMap?.[noteKey] };
    const { result: callResult, timedOut } = await withTimeout(
      generateInterception(config, interceptParams),
      AI_TIMEOUT_MS,
      fallbackGuess,
      config.model
    );

    await logAiCall(matchId, game.id, game.round, aiInterceptor.aiProvider, "generate_interception", callResult, timedOut);
    game = submitInterception(game, team, callResult.result);
  }
  return game;
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

const MAX_ROUNDS = 20;

export async function runHeadlessMatch(config: HeadlessMatchConfig, scratchNotesMap?: Record<string, string>): Promise<HeadlessResult> {
  const hostId = generatePlayerId();
  let game = createNewGame(hostId, config.players[0].name);

  game = {
    ...game,
    players: [{
      id: hostId,
      name: config.players[0].name,
      isAI: true,
      aiProvider: config.players[0].aiProvider,
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

  const playerConfigs = game.players.map(p => ({
    id: p.id,
    name: p.name,
    isAI: p.isAI,
    aiProvider: p.aiProvider || null,
    team: p.team,
  }));

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
  });

  const matchId = match.id;
  log(`[headless] Match ${matchId} started (game ${game.id})`, "headless");

  while (game.phase !== "game_over" && game.round < MAX_ROUNDS) {
    game = startNewRound(game, rng);
    log(`[headless] Match ${matchId} - Round ${game.round}`, "headless");

    game = await processClues(game, matchId, scratchNotesMap);

    if (game.phase !== "own_team_guessing") {
      log(`[headless] Match ${matchId} - Unexpected phase after clues: ${game.phase}`, "headless");
      break;
    }

    game = await processGuesses(game, matchId, scratchNotesMap);

    if (game.phase !== "opponent_intercepting") {
      log(`[headless] Match ${matchId} - Unexpected phase after guesses: ${game.phase}`, "headless");
      break;
    }

    game = await processInterceptions(game, matchId, scratchNotesMap);

    if (game.phase === "round_results" || game.phase === "game_over") {
      await persistRoundResults(matchId, game);
    }

    const validationErrors = validateGameState(game);
    if (validationErrors.length > 0) {
      log(`[headless] Match ${matchId} validation issues: ${JSON.stringify(validationErrors)}`, "headless");
    }

    if (game.phase === "game_over") {
      break;
    }
  }

  await storage.updateMatch(matchId, {
    completedAt: new Date(),
    winner: game.winner,
    totalRounds: game.round,
    amberWhiteTokens: game.teams.amber.whiteTokens,
    amberBlackTokens: game.teams.amber.blackTokens,
    blueWhiteTokens: game.teams.blue.whiteTokens,
    blueBlackTokens: game.teams.blue.blackTokens,
  });

  log(`[headless] Match ${matchId} completed - Winner: ${game.winner || "none"} in ${game.round} rounds`, "headless");

  return {
    matchId,
    gameId: game.id,
    winner: game.winner,
    totalRounds: game.round,
    teams: game.teams,
    players: game.players,
  };
}
