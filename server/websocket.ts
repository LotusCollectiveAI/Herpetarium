import { WebSocketServer, WebSocket } from "ws";
import { Server } from "http";
import { GameState, Player, WSMessage, ServerMessage, wsMessageSchema, getDefaultConfig, MODEL_OPTIONS, MatchQualitySummary, buildMatchPlayerConfigs, MIN_GAME_PLAYERS, MIN_TEAM_PLAYERS, MAX_TEAM_PLAYERS } from "@shared/schema";
import {
  createNewGame,
  addPlayer,
  removePlayer,
  assignTeam,
  startGame,
  startNewRound,
  advanceFromRoundResults,
  isGameDecided,
  autoAssignRemainingPlayers,
  submitClues,
  submitOwnTeamGuess,
  submitInterception,
  updateSelection,
  generatePlayerId,
  getAIProviderName,
  shuffleArray,
  getConfigForPlayer,
} from "./game";
import { generateClues, generateGuess, generateInterception, AICallResult } from "./ai";
import { storage } from "./storage";
import { log } from "./index";
import { emitMatchEvent, clearMatchEventSequence } from "./matchEvents";

interface ClientConnection {
  ws: WebSocket;
  playerId: string;
  gameId: string;
}

const DEFAULT_AI_TIMEOUT_MS = 900000; // 15 min default for interactive games
// No artificial ceiling — researchers control their own timeouts via config

function createEmptyQualitySummary(): MatchQualitySummary {
  return {
    clueGeneration: {
      amber: { clueCalls: 0, fallbackClueCalls: 0, fallbackRate: 0 },
      blue: { clueCalls: 0, fallbackClueCalls: 0, fallbackRate: 0 },
    },
    taintReasons: [],
    taintEvents: [],
  };
}

function getPlayerTimeout(player: Player): number {
  if (player.aiConfig?.timeoutMs) {
    return player.aiConfig.timeoutMs; // Respect the configured value, no cap
  }
  return DEFAULT_AI_TIMEOUT_MS;
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

function getStem(word: string): string {
  const w = word.toLowerCase();
  if (w.length <= 3) return w;
  return w.replace(/(ing|ed|er|est|ly|tion|sion|ness|ment|able|ible|ful|less|ous|ive|al|ial|ical)$/, "") || w;
}

function validateClues(clues: string[], keywords: string[]): string | null {
  if (!clues || clues.length !== 3) return "Must provide exactly 3 clues";
  for (let i = 0; i < clues.length; i++) {
    const trimmed = clues[i].trim();
    if (trimmed.length === 0) return `Clue ${i + 1} cannot be empty`;
    if (/\s/.test(trimmed)) return `Clue ${i + 1} must be a single word`;
    const lowerClue = trimmed.toLowerCase();
    for (const kw of keywords) {
      const lowerKw = kw.toLowerCase();
      if (lowerClue === lowerKw) return `Clue ${i + 1} cannot be a keyword ("${kw}")`;
      if (getStem(lowerClue) === getStem(lowerKw) && getStem(lowerClue).length >= 3) {
        return `Clue ${i + 1} is too similar to keyword "${kw}"`;
      }
    }
  }
  return null;
}

const games = new Map<string, GameState>();
const clients = new Map<WebSocket, ClientConnection>();
const gameClients = new Map<string, Set<WebSocket>>();
const gameMatchIds = new Map<string, number>();
const persistedRounds = new Set<string>();

function cleanupPersistedRounds(gameId: string) {
  for (const key of persistedRounds) {
    if (key.startsWith(gameId + "-")) {
      persistedRounds.delete(key);
    }
  }
}

function broadcast(gameId: string, message: ServerMessage) {
  const sockets = gameClients.get(gameId);
  if (!sockets) return;
  
  const data = JSON.stringify(message);
  sockets.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  });
}

function sendTo(ws: WebSocket, message: ServerMessage) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

const lastPhase = new Map<string, string>();

// The wire format for GameState carries both teams' secrets (the in-progress
// code, the opposing team's keywords, each team's own decode/interception
// guesses and live picks) because the reducer needs all of it in one shared
// object. None of that may reach a socket outside the team it belongs to --
// e.g. a team's decode guess must stay hidden from the opponent, or the
// opponent could just read it off the wire during interception instead of
// working it out from clues. Round history is exempt: past rounds are
// intentionally revealed to both teams once scored (that's how clue
// deduction across rounds works), so only the *current* round's secrets are
// redacted here.
// ScoreBoard shows both teams' rosters to every player, including a
// submitted/not-submitted indicator driven purely by whether currentGuesses
// is null -- it never reads the actual digits. So a hidden guess still has
// to read as non-null once submitted, or that always-visible progress
// indicator gets permanently stuck on "in progress" for the other team.
// [0, 0, 0] is never a real code/guess (those only ever use digits 1-4), so
// it can't be mistaken for one by anything that did read the value.
const HIDDEN_GUESS: [number, number, number] = [0, 0, 0];
function maskGuess(value: [number, number, number] | null): [number, number, number] | null {
  return value === null ? null : HIDDEN_GUESS;
}

function redactGameStateForTeam(game: GameState, viewerTeam: "amber" | "blue" | null): GameState {
  return {
    ...game,
    currentCode: { amber: null, blue: null },
    teams: {
      amber: viewerTeam === "amber" ? game.teams.amber : { ...game.teams.amber, keywords: [] },
      blue: viewerTeam === "blue" ? game.teams.blue : { ...game.teams.blue, keywords: [] },
    },
    currentGuesses: {
      amber: viewerTeam === "amber" ? game.currentGuesses.amber : {
        ownTeam: maskGuess(game.currentGuesses.amber.ownTeam),
        opponent: maskGuess(game.currentGuesses.amber.opponent),
      },
      blue: viewerTeam === "blue" ? game.currentGuesses.blue : {
        ownTeam: maskGuess(game.currentGuesses.blue.ownTeam),
        opponent: maskGuess(game.currentGuesses.blue.opponent),
      },
    },
    currentSelections: {
      amber: viewerTeam === "amber" ? game.currentSelections.amber : {},
      blue: viewerTeam === "blue" ? game.currentSelections.blue : {},
    },
  };
}

function sendGameState(gameId: string) {
  const game = games.get(gameId);
  if (!game) return;

  const prevPhase = lastPhase.get(gameId);
  if (prevPhase && prevPhase !== game.phase) {
    broadcast(gameId, { type: "phase_changed", phase: game.phase, round: game.round });
  }
  lastPhase.set(gameId, game.phase);

  const sockets = gameClients.get(gameId);
  if (!sockets) return;

  // At most 3 distinct views exist (amber, blue, no-team-yet), so serialize
  // each once and reuse it across every socket on that team instead of
  // re-stringifying per recipient.
  const serializedByTeam = new Map<"amber" | "blue" | null, string>();
  const getSerializedState = (team: "amber" | "blue" | null): string => {
    let data = serializedByTeam.get(team);
    if (data === undefined) {
      const message: ServerMessage = { type: "game_state", state: redactGameStateForTeam(game, team) };
      data = JSON.stringify(message);
      serializedByTeam.set(team, data);
    }
    return data;
  };

  sockets.forEach(ws => {
    const client = clients.get(ws);
    if (!client) return;

    const player = game.players.find(p => p.id === client.playerId);
    const viewerTeam = player?.team ?? null;

    if (ws.readyState === WebSocket.OPEN) {
      ws.send(getSerializedState(viewerTeam));
    }

    if (!player?.team) return;

    const keywords = game.teams[player.team].keywords;
    if (keywords.length > 0) {
      sendTo(ws, { type: "keywords", keywords });
    }

    if (game.currentClueGiver[player.team] === client.playerId && game.currentCode[player.team]) {
      sendTo(ws, { type: "your_code", code: game.currentCode[player.team]! });
    }
  });
}

async function logAiCall(
  gameId: string,
  roundNumber: number,
  provider: string,
  actionType: string,
  callResult: AICallResult<any>,
  timedOut: boolean,
  team: "amber" | "blue" | null = null,
  playerId: string | null = null,
) {
  const usedFallback = timedOut || !!callResult.error;

  try {
    const matchId = gameMatchIds.get(gameId);
    await storage.createAiCallLog({
      matchId: matchId || null,
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
    log(`Failed to log AI call: ${err}`, "websocket");
  }

  await emitMatchEvent(gameId, gameMatchIds.get(gameId) ?? null, {
    eventType: "ai_call",
    team,
    playerId,
    provider,
    model: callResult.model,
    actionType,
    latencyMs: callResult.latencyMs ?? null,
    timedOut,
    usedFallback,
    error: callResult.error ?? null,
    parseQuality: callResult.parseQuality ?? null,
    promptTokens: callResult.promptTokens ?? null,
    completionTokens: callResult.completionTokens ?? null,
    totalTokens: callResult.totalTokens ?? null,
    estimatedCostUsd: callResult.estimatedCostUsd ?? null,
    reasoningTrace: callResult.reasoningTrace ?? null,
  }, { round: roundNumber, team, playerId });
}

async function persistRoundResults(gameId: string, game: GameState) {
  try {
    const matchId = gameMatchIds.get(gameId);
    if (!matchId) return;

    const roundKey = `${gameId}-${game.round}`;
    if (persistedRounds.has(roundKey)) return;

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

    persistedRounds.add(roundKey);
  } catch (err) {
    log(`Failed to persist round results: ${err}`, "websocket");
  }
}

async function persistGameCompletion(gameId: string, game: GameState) {
  try {
    const matchId = gameMatchIds.get(gameId);
    if (!matchId) return;

    await storage.updateMatch(matchId, {
      completedAt: new Date(),
      winner: game.winner,
      totalRounds: game.round,
      amberWhiteTokens: game.teams.amber.whiteTokens,
      amberBlackTokens: game.teams.amber.blackTokens,
      blueWhiteTokens: game.teams.blue.whiteTokens,
      blueBlackTokens: game.teams.blue.blackTokens,
    });
  } catch (err) {
    log(`Failed to persist game completion: ${err}`, "websocket");
  }
}

async function createMatchRecord(gameId: string, game: GameState) {
  try {
    const playerConfigs = buildMatchPlayerConfigs(game.players);

    const match = await storage.createMatch({
      gameId,
      playerConfigs,
      amberKeywords: game.teams.amber.keywords,
      blueKeywords: game.teams.blue.keywords,
      totalRounds: 0,
      amberWhiteTokens: 0,
      amberBlackTokens: 0,
      blueWhiteTokens: 0,
      blueBlackTokens: 0,
      qualityStatus: "clean",
      qualitySummary: createEmptyQualitySummary(),
      gameRules: game.rules,
    });

    gameMatchIds.set(gameId, match.id);
    log(`Match record created: ${match.id} for game ${gameId}`, "websocket");
  } catch (err) {
    log(`Failed to create match record: ${err}`, "websocket");
  }
}

async function emitRoundEvaluationEvents(gameId: string, game: GameState) {
  const matchId = gameMatchIds.get(gameId) ?? null;
  const amberLatest = game.teams.amber.history[game.teams.amber.history.length - 1];
  const blueLatest = game.teams.blue.history[game.teams.blue.history.length - 1];

  if (amberLatest && blueLatest) {
    await emitMatchEvent(gameId, matchId, {
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

  if (isGameDecided(game)) {
    await emitMatchEvent(gameId, matchId, {
      eventType: "game_completed",
      winner: game.winner,
      finalTokens: {
        amber: { whiteTokens: game.teams.amber.whiteTokens, blackTokens: game.teams.amber.blackTokens },
        blue: { whiteTokens: game.teams.blue.whiteTokens, blackTokens: game.teams.blue.blackTokens },
      },
    }, { round: game.round });
  }
}

async function emitRoundStartedEvent(gameId: string, game: GameState) {
  const matchId = gameMatchIds.get(gameId) ?? null;
  await emitMatchEvent(gameId, matchId, {
    eventType: "round_started",
    round: game.round,
    clueGiver: game.currentClueGiver,
    code: {
      amber: game.currentCode.amber!,
      blue: game.currentCode.blue!,
    },
    keywords: {
      amber: game.teams.amber.keywords,
      blue: game.teams.blue.keywords,
    },
  }, { round: game.round });
}

// processAITurn is scheduled via setTimeout from many independent call sites
// (WS message handlers, internal transitions). More than one of those can
// land while a game is still in the same phase, and each phase handler below
// loops over teams with real (slow) AI calls in between checking and acting
// on shared state -- without this guard, two overlapping invocations can
// both generate and submit an AI turn for the same team, wasting a real,
// billed AI call. (submitClues/submitOwnTeamGuess/submitInterception also
// guard against the redundant submission itself, independently of this.)
const aiTurnInProgress = new Set<string>();

async function processAITurn(gameId: string) {
  if (aiTurnInProgress.has(gameId)) return;
  aiTurnInProgress.add(gameId);
  try {
    const game = games.get(gameId);
    if (!game) return;

    switch (game.phase) {
      case "team_setup":
        await handleTeamSetupPhase(gameId);
        break;
      case "giving_clues":
        await processAIClues(gameId);
        break;
      case "own_team_guessing":
        await processAIGuesses(gameId);
        break;
      case "opponent_intercepting":
        await processAIInterceptions(gameId);
        break;
    }
  } finally {
    aiTurnInProgress.delete(gameId);
  }
}

async function handleTeamSetupPhase(gameId: string) {
  sendGameState(gameId);
}

async function processAIClues(gameId: string) {
  let game = games.get(gameId);
  if (!game || game.phase !== "giving_clues") return;
  
  for (const team of ["amber", "blue"] as const) {
    const clueGiverId = game.currentClueGiver[team];
    if (!clueGiverId || game.currentClues[team]) continue;
    
    const clueGiver = game.players.find(p => p.id === clueGiverId);
    if (!clueGiver?.isAI || !clueGiver.aiProvider) continue;
    
    const aiName = getAIProviderName(clueGiver.aiProvider);
    const config = getConfigForPlayer(clueGiver);
    const timeoutMs = getPlayerTimeout(clueGiver);
    
    broadcast(gameId, { type: "ai_thinking", aiName, startTime: Date.now() });
    
    const code = game.currentCode[team]!;
    const keywords = game.teams[team].keywords;
    const history = game.teams[team].history.map(h => ({
      clues: h.clues,
      targetCode: h.targetCode,
    }));
    
    const fallbackClues = code.map(n => keywords[n - 1].slice(0, 3));
    
    const { result: callResult, timedOut } = await withTimeout(
      generateClues(config, { keywords, targetCode: code, history }),
      timeoutMs,
      fallbackClues,
      config.model
    );
    
    await logAiCall(gameId, game.round, clueGiver.aiProvider, "generate_clues", callResult, timedOut, team, clueGiver.id);
    
    if (timedOut) {
      log(`AI clue generation timed out for ${aiName} (${config.model}, ${timeoutMs}ms)`, "websocket");
      broadcast(gameId, { type: "ai_fallback", aiName, reason: "AI took too long, using fallback clues" });
    } else if (callResult.error) {
      log(`AI clue generation failed for ${aiName} (${config.model})`, "websocket");
      broadcast(gameId, { type: "ai_fallback", aiName, reason: "AI encountered an error, using fallback clues" });
    }
    
    if (callResult.reasoningTrace) {
      log(`[Reasoning Trace] ${aiName} (${config.model}) clue generation:\n${callResult.reasoningTrace}`, "websocket");
    }
    
    game = games.get(gameId)!;
    game = submitClues(game, team, callResult.result);
    games.set(gameId, game);

    await emitMatchEvent(gameId, gameMatchIds.get(gameId) ?? null, {
      eventType: "clue_submitted",
      team,
      playerId: clueGiver.id,
      clues: callResult.result,
    }, { round: game.round, team, playerId: clueGiver.id });

    broadcast(gameId, { type: "ai_done", aiName });
  }
  
  sendGameState(gameId);
  
  game = games.get(gameId)!;
  if (game.phase === "own_team_guessing") {
    setTimeout(() => processAITurn(gameId), 500);
  }
}

async function runAIGuessCall(
  gameId: string,
  game: GameState,
  team: "amber" | "blue",
  aiPlayer: Player,
  fallbackGuess: [number, number, number],
): Promise<[number, number, number]> {
  const aiName = getAIProviderName(aiPlayer.aiProvider!);
  const config = getConfigForPlayer(aiPlayer);
  const timeoutMs = getPlayerTimeout(aiPlayer);

  broadcast(gameId, { type: "ai_thinking", aiName, startTime: Date.now() });

  const clues = game.currentClues[team]!;
  const keywords = game.teams[team].keywords;
  const history = game.teams[team].history.map(h => ({
    clues: h.clues,
    targetCode: h.targetCode,
  }));

  const { result: callResult, timedOut } = await withTimeout(
    generateGuess(config, { keywords, clues, history }),
    timeoutMs,
    fallbackGuess,
    config.model
  );

  await logAiCall(gameId, game.round, aiPlayer.aiProvider!, "generate_guess", callResult, timedOut, aiPlayer.team, aiPlayer.id);

  if (timedOut) {
    log(`AI guess timed out for ${aiName} (${config.model}, ${timeoutMs}ms)`, "websocket");
    broadcast(gameId, { type: "ai_fallback", aiName, reason: "AI took too long, using fallback guess" });
  } else if (callResult.error) {
    log(`AI guess failed for ${aiName} (${config.model})`, "websocket");
    broadcast(gameId, { type: "ai_fallback", aiName, reason: "AI encountered an error, using fallback guess" });
  }

  if (callResult.reasoningTrace) {
    log(`[Reasoning Trace] ${aiName} (${config.model}) guess:\n${callResult.reasoningTrace}`, "websocket");
  }

  broadcast(gameId, { type: "ai_done", aiName });

  return callResult.result;
}

async function processAIGuesses(gameId: string) {
  let game = games.get(gameId);
  if (!game || game.phase !== "own_team_guessing") return;

  const fallbackGuess: [number, number, number] = [1, 2, 3];

  for (const team of ["amber", "blue"] as const) {
    if (game.currentGuesses[team].ownTeam) continue;

    const teamPlayers = game.players.filter(p => p.team === team);
    const clueGiverId = game!.currentClueGiver[team];
    const decodeSubmitterId = game!.decodeSubmitter[team];

    // AI teammates who aren't the designated submitter still weigh in with
    // a suggested pick — shown to the team as a live selection, same as a
    // human clicking numbers — so a human submitter isn't guessing blind
    // to what their AI teammates would have picked. The clue-giver is
    // excluded since they already know the code and never decode it.
    const opinionGivers = teamPlayers.filter(p =>
      p.isAI && p.id !== clueGiverId && p.id !== decodeSubmitterId && !game!.currentSelections[team][p.id]
    );

    for (const aiPlayer of opinionGivers) {
      const guess = await runAIGuessCall(gameId, game, team, aiPlayer, fallbackGuess);
      game = games.get(gameId)!;
      game = updateSelection(game, team, aiPlayer.id, guess);
      games.set(gameId, game);
      sendGameState(gameId);

      await emitMatchEvent(gameId, gameMatchIds.get(gameId) ?? null, {
        eventType: "selection_updated",
        team,
        playerId: aiPlayer.id,
        phase: "decode",
        selection: guess,
      }, { round: game.round, team, playerId: aiPlayer.id });
    }

    const aiGuesser = teamPlayers.find(p => p.id === decodeSubmitterId && p.isAI);
    if (!aiGuesser) continue;

    const guess = await runAIGuessCall(gameId, game, team, aiGuesser, fallbackGuess);
    const ownCode = game.currentCode[team]!;
    game = games.get(gameId)!;
    game = submitOwnTeamGuess(game, team, guess);
    games.set(gameId, game);

    await emitMatchEvent(gameId, gameMatchIds.get(gameId) ?? null, {
      eventType: "guess_submitted",
      team,
      playerId: aiGuesser.id,
      guess,
      correct: guess.every((n, i) => n === ownCode[i]),
    }, { round: game.round, team, playerId: aiGuesser.id });
  }

  sendGameState(gameId);

  game = games.get(gameId)!;
  if (game.phase === "opponent_intercepting") {
    setTimeout(() => processAITurn(gameId), 500);
  }
}

async function runAIInterceptionCall(
  gameId: string,
  game: GameState,
  opponentTeam: "amber" | "blue",
  aiPlayer: Player,
  fallbackGuess: [number, number, number],
): Promise<[number, number, number]> {
  const aiName = getAIProviderName(aiPlayer.aiProvider!);
  const config = getConfigForPlayer(aiPlayer);
  const timeoutMs = getPlayerTimeout(aiPlayer);

  broadcast(gameId, { type: "ai_thinking", aiName, startTime: Date.now() });

  const clues = game.currentClues[opponentTeam]!;
  const history = game.teams[opponentTeam].history.map(h => ({
    clues: h.clues,
    targetCode: h.targetCode,
  }));

  const { result: callResult, timedOut } = await withTimeout(
    generateInterception(config, { clues, history }),
    timeoutMs,
    fallbackGuess,
    config.model
  );

  await logAiCall(gameId, game.round, aiPlayer.aiProvider!, "generate_interception", callResult, timedOut, aiPlayer.team, aiPlayer.id);

  if (timedOut) {
    log(`AI interception timed out for ${aiName} (${config.model}, ${timeoutMs}ms)`, "websocket");
    broadcast(gameId, { type: "ai_fallback", aiName, reason: "AI took too long, using fallback guess" });
  } else if (callResult.error) {
    log(`AI interception failed for ${aiName} (${config.model})`, "websocket");
    broadcast(gameId, { type: "ai_fallback", aiName, reason: "AI encountered an error, using fallback guess" });
  }

  if (callResult.reasoningTrace) {
    log(`[Reasoning Trace] ${aiName} (${config.model}) interception:\n${callResult.reasoningTrace}`, "websocket");
  }

  broadcast(gameId, { type: "ai_done", aiName });

  return callResult.result;
}

async function processAIInterceptions(gameId: string) {
  let game = games.get(gameId);
  if (!game || game.phase !== "opponent_intercepting") return;

  const fallbackGuess: [number, number, number] = [1, 2, 3];

  for (const team of ["amber", "blue"] as const) {
    if (game.currentGuesses[team].opponent) continue;

    const opponentTeam = team === "amber" ? "blue" : "amber";
    const teamPlayers = game.players.filter(p => p.team === team);
    const interceptSubmitterId = game!.interceptSubmitter[team];

    // AI teammates who aren't the designated submitter still weigh in
    // with a suggested pick, same as during decoding. Unlike decoding,
    // the clue-giver isn't excluded here — they know as little about the
    // opponent's code as anyone else.
    const opinionGivers = teamPlayers.filter(p =>
      p.isAI && p.id !== interceptSubmitterId && !game!.currentSelections[team][p.id]
    );

    for (const aiPlayer of opinionGivers) {
      const guess = await runAIInterceptionCall(gameId, game, opponentTeam, aiPlayer, fallbackGuess);
      game = games.get(gameId)!;
      game = updateSelection(game, team, aiPlayer.id, guess);
      games.set(gameId, game);
      sendGameState(gameId);

      await emitMatchEvent(gameId, gameMatchIds.get(gameId) ?? null, {
        eventType: "selection_updated",
        team,
        playerId: aiPlayer.id,
        phase: "intercept",
        selection: guess,
      }, { round: game.round, team, playerId: aiPlayer.id });
    }

    const aiInterceptor = teamPlayers.find(p => p.id === interceptSubmitterId && p.isAI);
    if (!aiInterceptor) continue;

    const guess = await runAIInterceptionCall(gameId, game, opponentTeam, aiInterceptor, fallbackGuess);
    const preSubmitCode = game.currentCode[opponentTeam]!;
    game = games.get(gameId)!;
    game = submitInterception(game, team, guess);
    games.set(gameId, game);

    await emitMatchEvent(gameId, gameMatchIds.get(gameId) ?? null, {
      eventType: "interception_submitted",
      team,
      playerId: aiInterceptor.id,
      guess,
      success: guess.every((n, i) => n === preSubmitCode[i]),
    }, { round: game.round, team, playerId: aiInterceptor.id });
  }

  sendGameState(gameId);

  game = games.get(gameId)!;
  if (game.phase === "round_results") {
    await persistRoundResults(gameId, game);
    if (isGameDecided(game)) {
      await persistGameCompletion(gameId, game);
    }
    await emitRoundEvaluationEvents(gameId, game);

    const allAI = game.players.every(p => p.isAI);
    if (allAI) {
      setTimeout(() => autoAdvanceRound(gameId), 1000);
    }
  }
}

async function autoAdvanceRound(gameId: string) {
  const game = games.get(gameId);
  if (!game || game.phase !== "round_results") return;

  const updated = advanceFromRoundResults(game);
  games.set(gameId, updated);
  sendGameState(gameId);

  if (updated.phase === "game_over") {
    log(`Auto-advancing all-AI game ${gameId} to game over`, "websocket");
    return;
  }

  log(`Auto-advancing all-AI game ${gameId} to round ${updated.round}`, "websocket");
  await emitRoundStartedEvent(gameId, updated);
  setTimeout(() => processAITurn(gameId), 500);
}

async function handleMessage(ws: WebSocket, message: WSMessage) {
  const client = clients.get(ws);
  
  switch (message.type) {
    case "join": {
      const { gameId, playerName, playerId: existingPlayerId } = message;
      
      let game = games.get(gameId);
      let playerId: string;
      
      if (!game) {
        playerId = generatePlayerId();
        game = createNewGame(playerId, playerName);
        game = { ...game, id: gameId };
        games.set(gameId, game);
        log(`New game ${gameId} created by ${playerName}`, "websocket");
      } else {
        const existingPlayer = existingPlayerId 
          ? game.players.find(p => p.id === existingPlayerId && !p.isAI)
          : null;
        
        if (existingPlayer) {
          playerId = existingPlayer.id;
          log(`Player ${playerName} reconnected to game ${gameId}`, "websocket");
        } else {
          const playerByName = game.players.find(p => p.name === playerName && !p.isAI);
          if (playerByName) {
            playerId = playerByName.id;
            log(`Player ${playerName} reconnected by name to game ${gameId}`, "websocket");
          } else {
            playerId = generatePlayerId();
            const newPlayer: Player = {
              id: playerId,
              name: playerName,
              isAI: false,
              team: null,
              isReady: false,
            };
            
            try {
              game = addPlayer(game, newPlayer);
              games.set(gameId, game);
              log(`Player ${playerName} joined game ${gameId}`, "websocket");
            } catch (error: any) {
              sendTo(ws, { type: "error", message: error.message });
              return;
            }
          }
        }
      }
      
      const gameSockets = gameClients.get(gameId);
      if (gameSockets) {
        const staleConnections: WebSocket[] = [];
        gameSockets.forEach(existingWs => {
          const existingClient = clients.get(existingWs);
          if (existingClient && existingClient.playerId === playerId && existingWs !== ws) {
            staleConnections.push(existingWs);
          }
        });
        staleConnections.forEach(staleWs => {
          log(`Closing old connection for player ${playerId}`, "websocket");
          clients.delete(staleWs);
          gameSockets.delete(staleWs);
          try { staleWs.close(); } catch {}
        });
      }
      
      clients.set(ws, { ws, playerId, gameId });
      
      if (!gameClients.has(gameId)) {
        gameClients.set(gameId, new Set());
      }
      gameClients.get(gameId)!.add(ws);
      
      sendGameState(gameId);
      log(`Player ${playerName} joined game ${gameId}`, "websocket");
      break;
    }
    
    case "add_ai": {
      if (!client) return;
      
      const game = games.get(client.gameId);
      if (!game || game.hostId !== client.playerId) {
        sendTo(ws, { type: "error", message: "Only host can add AI players" });
        return;
      }
      
      const config = message.config || getDefaultConfig(message.provider);
      
      const validModels = MODEL_OPTIONS[config.provider].map(m => m.value);
      if (!validModels.includes(config.model)) {
        sendTo(ws, { type: "error", message: `Invalid model "${config.model}" for provider ${config.provider}` });
        return;
      }
      
      const modelLabel = config.model || message.provider;
      const displayName = `${getAIProviderName(config.provider)} (${modelLabel})`;
      
      const aiPlayer: Player = {
        id: generatePlayerId(),
        name: displayName,
        isAI: true,
        aiProvider: config.provider,
        aiConfig: config,
        team: null,
        isReady: true,
      };
      
      try {
        const updated = addPlayer(game, aiPlayer);
        games.set(client.gameId, updated);
        sendGameState(client.gameId);
        log(`AI ${aiPlayer.name} added to game ${client.gameId} (model: ${config.model}, timeout: ${config.timeoutMs}ms, strategy: ${config.promptStrategy})`, "websocket");
      } catch (error: any) {
        sendTo(ws, { type: "error", message: error.message });
      }
      break;
    }
    
    case "remove_player": {
      if (!client) return;
      
      const game = games.get(client.gameId);
      if (!game || game.hostId !== client.playerId) {
        sendTo(ws, { type: "error", message: "Only host can remove players" });
        return;
      }
      
      const updated = removePlayer(game, message.playerId);
      games.set(client.gameId, updated);
      sendGameState(client.gameId);
      break;
    }
    
    case "join_team": {
      if (!client) return;

      const game = games.get(client.gameId);
      if (!game) return;

      const targetTeamSize = game.players.filter(p => p.team === message.team && p.id !== client.playerId).length;
      if (targetTeamSize >= MAX_TEAM_PLAYERS) {
        sendTo(ws, { type: "error", message: `Team ${message.team === "amber" ? "Amber" : "Blue"} is full (max ${MAX_TEAM_PLAYERS} players)` });
        return;
      }

      const updated = assignTeam(game, client.playerId, message.team);
      games.set(client.gameId, updated);
      sendGameState(client.gameId);
      break;
    }
    
    case "start_game": {
      if (!client) return;
      
      const game = games.get(client.gameId);
      if (!game || game.hostId !== client.playerId) {
        sendTo(ws, { type: "error", message: "Only host can start the game" });
        return;
      }
      
      if (game.players.length < MIN_GAME_PLAYERS) {
        sendTo(ws, { type: "error", message: `Need at least ${MIN_GAME_PLAYERS} players` });
        return;
      }
      
      let updated = startGame(game);
      games.set(client.gameId, updated);
      sendGameState(client.gameId);
      log(`Game ${client.gameId} started`, "websocket");
      
      setTimeout(() => processAITurn(client.gameId), 500);
      break;
    }
    
    case "confirm_teams": {
      if (!client) return;
      
      let game = games.get(client.gameId);
      if (!game || game.hostId !== client.playerId) {
        sendTo(ws, { type: "error", message: "Only host can confirm teams" });
        return;
      }
      
      if (game.phase !== "team_setup") {
        sendTo(ws, { type: "error", message: "Game is not in team setup phase" });
        return;
      }
      
      const assignedGame = autoAssignRemainingPlayers(game);
      
      const amberPlayers = assignedGame.players.filter(p => p.team === "amber");
      const bluePlayers = assignedGame.players.filter(p => p.team === "blue");
      
      if (amberPlayers.length < MIN_TEAM_PLAYERS || bluePlayers.length < MIN_TEAM_PLAYERS) {
        sendTo(ws, { type: "error", message: `Each team needs at least ${MIN_TEAM_PLAYERS} players` });
        return;
      }

      game = assignedGame;
      games.set(client.gameId, game);

      await createMatchRecord(client.gameId, game);

      const createdMatchId = gameMatchIds.get(client.gameId) ?? null;
      await emitMatchEvent(client.gameId, createdMatchId, {
        eventType: "game_created",
        rules: game.rules,
        players: game.players,
        teamSize: Math.max(amberPlayers.length, bluePlayers.length),
      });

      let updated = startNewRound(game);
      games.set(client.gameId, updated);
      sendGameState(client.gameId);
      log(`Teams confirmed, Round 1 started for game ${client.gameId}`, "websocket");

      await emitRoundStartedEvent(client.gameId, updated);

      setTimeout(() => processAITurn(client.gameId), 500);
      break;
    }
    
    case "submit_clues": {
      if (!client) return;
      
      const game = games.get(client.gameId);
      if (!game || game.phase !== "giving_clues") return;
      
      const player = game.players.find(p => p.id === client.playerId);
      if (!player?.team) return;
      
      if (game.currentClueGiver[player.team] !== client.playerId) {
        sendTo(ws, { type: "error", message: "You are not the clue giver" });
        return;
      }
      
      const teamKeywords = game.teams[player.team].keywords;
      const clueError = validateClues(message.clues, teamKeywords);
      if (clueError) {
        sendTo(ws, { type: "clue_error", message: clueError });
        return;
      }
      
      const updated = submitClues(game, player.team, message.clues);
      games.set(client.gameId, updated);
      sendGameState(client.gameId);

      await emitMatchEvent(client.gameId, gameMatchIds.get(client.gameId) ?? null, {
        eventType: "clue_submitted",
        team: player.team,
        playerId: player.id,
        clues: message.clues,
      }, { round: game.round, team: player.team, playerId: player.id });

      setTimeout(() => processAITurn(client.gameId), 100);
      break;
    }

    case "submit_guess": {
      if (!client) return;
      
      let game = games.get(client.gameId);
      if (!game || game.phase !== "own_team_guessing") return;
      
      const player = game.players.find(p => p.id === client.playerId);
      if (!player?.team) return;

      if (game.decodeSubmitter[player.team] !== client.playerId) {
        sendTo(ws, { type: "error", message: "You are not the designated submitter for your team this round" });
        return;
      }

      const updated = submitOwnTeamGuess(game, player.team, message.guess);
      games.set(client.gameId, updated);
      sendGameState(client.gameId);

      const ownCode = game.currentCode[player.team]!;
      await emitMatchEvent(client.gameId, gameMatchIds.get(client.gameId) ?? null, {
        eventType: "guess_submitted",
        team: player.team,
        playerId: player.id,
        guess: message.guess,
        correct: message.guess.every((n, i) => n === ownCode[i]),
      }, { round: game.round, team: player.team, playerId: player.id });

      setTimeout(() => processAITurn(client.gameId), 100);
      break;
    }

    case "submit_interception": {
      if (!client) return;
      
      let game = games.get(client.gameId);
      if (!game || game.phase !== "opponent_intercepting") return;
      
      const player = game.players.find(p => p.id === client.playerId);
      if (!player?.team) return;

      if (game.interceptSubmitter[player.team] !== client.playerId) {
        sendTo(ws, { type: "error", message: "You are not the designated submitter for your team this round" });
        return;
      }

      const updated = submitInterception(game, player.team, message.guess);
      games.set(client.gameId, updated);
      sendGameState(client.gameId);

      const opponentTeam = player.team === "amber" ? "blue" : "amber";
      const opponentCode = game.currentCode[opponentTeam]!;
      await emitMatchEvent(client.gameId, gameMatchIds.get(client.gameId) ?? null, {
        eventType: "interception_submitted",
        team: player.team,
        playerId: player.id,
        guess: message.guess,
        success: message.guess.every((n, i) => n === opponentCode[i]),
      }, { round: game.round, team: player.team, playerId: player.id });

      if (updated.phase === "round_results") {
        persistRoundResults(client.gameId, updated);
        if (isGameDecided(updated)) {
          persistGameCompletion(client.gameId, updated);
        }
        await emitRoundEvaluationEvents(client.gameId, updated);
      }

      setTimeout(() => processAITurn(client.gameId), 100);
      break;
    }

    case "update_selection": {
      if (!client) return;

      const game = games.get(client.gameId);
      if (!game || (game.phase !== "own_team_guessing" && game.phase !== "opponent_intercepting")) return;

      const player = game.players.find(p => p.id === client.playerId);
      if (!player?.team) return;

      const updated = updateSelection(game, player.team, player.id, message.selection);
      games.set(client.gameId, updated);
      sendGameState(client.gameId);

      await emitMatchEvent(client.gameId, gameMatchIds.get(client.gameId) ?? null, {
        eventType: "selection_updated",
        team: player.team,
        playerId: player.id,
        phase: game.phase === "own_team_guessing" ? "decode" : "intercept",
        selection: message.selection,
      }, { round: game.round, team: player.team, playerId: player.id });
      break;
    }

    case "next_round": {
      if (!client) return;

      const game = games.get(client.gameId);
      if (!game || game.hostId !== client.playerId) {
        sendTo(ws, { type: "error", message: "Only host can advance rounds" });
        return;
      }
      if (game.phase !== "round_results") return;

      const updated = advanceFromRoundResults(game);
      games.set(client.gameId, updated);
      sendGameState(client.gameId);

      if (updated.phase !== "game_over") {
        await emitRoundStartedEvent(client.gameId, updated);
        setTimeout(() => processAITurn(client.gameId), 500);
      }
      break;
    }
    
    case "request_state": {
      if (!client) return;
      sendGameState(client.gameId);
      break;
    }
    
    case "new_game_same_players": {
      if (!client) return;
      
      const game = games.get(client.gameId);
      if (!game || game.phase !== "game_over") {
        sendTo(ws, { type: "error", message: "Game is not over" });
        return;
      }
      
      if (game.hostId !== client.playerId) {
        sendTo(ws, { type: "error", message: "Only the host can start a new game" });
        return;
      }
      
      const newHostId = generatePlayerId();
      const newGame = createNewGame(newHostId, "host");
      
      const playerMapping = new Map<string, string>();
      const newPlayers: Player[] = [];
      
      for (const player of game.players) {
        const newId = player.id === client.playerId ? newHostId : generatePlayerId();
        playerMapping.set(player.id, newId);
        newPlayers.push({
          id: newId,
          name: player.name,
          isAI: player.isAI,
          aiProvider: player.aiProvider,
          aiConfig: player.aiConfig,
          team: null,
          isReady: player.isAI,
        });
      }
      
      const freshGame: GameState = {
        ...newGame,
        players: newPlayers,
        hostId: newHostId,
      };
      
      const newGameId = freshGame.id;
      games.set(newGameId, freshGame);
      
      const sockets = gameClients.get(client.gameId);
      if (sockets) {
        sockets.forEach(existingWs => {
          const existingClient = clients.get(existingWs);
          if (existingClient) {
            const newPid = playerMapping.get(existingClient.playerId) || existingClient.playerId;
            clients.set(existingWs, { ws: existingWs, playerId: newPid, gameId: newGameId });
          }
        });
        gameClients.set(newGameId, new Set(sockets));
        gameClients.delete(client.gameId);
      }
      
      games.delete(client.gameId);
      gameMatchIds.delete(client.gameId);
      clearMatchEventSequence(client.gameId);
      cleanupPersistedRounds(client.gameId);
      
      broadcast(newGameId, { type: "new_game_created", gameId: newGameId });
      sendGameState(newGameId);
      log(`New game ${newGameId} created from ${client.gameId} with same players`, "websocket");
      break;
    }
  }
}

function handleDisconnect(ws: WebSocket) {
  const client = clients.get(ws);
  if (!client) return;
  
  const { gameId, playerId } = client;
  
  const sockets = gameClients.get(gameId);
  if (sockets) {
    sockets.delete(ws);
    if (sockets.size === 0) {
      gameClients.delete(gameId);
      setTimeout(() => {
        if (!gameClients.has(gameId) || gameClients.get(gameId)!.size === 0) {
          games.delete(gameId);
          gameMatchIds.delete(gameId);
          clearMatchEventSequence(gameId);
          cleanupPersistedRounds(gameId);
          log(`Game ${gameId} cleaned up`, "websocket");
        }
      }, 60000);
    }
  }
  
  clients.delete(ws);
  
  log(`Player disconnected from game ${gameId}`, "websocket");
}

export function setupWebSocket(server: Server) {
  // Attaching via { server, path } makes `ws` register its own "upgrade"
  // listener on the shared HTTP server, and that listener destroys the
  // socket for any request whose path doesn't match — including requests
  // meant for other upgrade handlers on the same server (e.g. Vite's HMR
  // WebSocket in dev). Using noServer + a path check here lets non-matching
  // upgrades fall through untouched.
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    const pathname = req.url?.split("?")[0];
    if (pathname !== "/ws") return;
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });

  wss.on("connection", (ws) => {
    log("WebSocket client connected", "websocket");
    
    ws.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString());
        const parsed = wsMessageSchema.safeParse(message);
        
        if (parsed.success) {
          void handleMessage(ws, parsed.data).catch(err => {
            log(`Error handling message: ${err}`, "websocket");
          });
        } else {
          log(`Invalid message: ${JSON.stringify(parsed.error)}`, "websocket");
          sendTo(ws, { type: "error", message: "Invalid message format" });
        }
      } catch (error) {
        log(`WebSocket error: ${error}`, "websocket");
      }
    });
    
    ws.on("close", () => handleDisconnect(ws));
    ws.on("error", (error) => {
      log(`WebSocket error: ${error}`, "websocket");
      handleDisconnect(ws);
    });
  });
  
  log("WebSocket server initialized on /ws", "websocket");
  return wss;
}

export function createGame(hostName: string): { gameId: string } {
  const hostId = generatePlayerId();
  const game = createNewGame(hostId, hostName);
  games.set(game.id, game);
  log(`Game ${game.id} created by ${hostName}`, "websocket");
  return { gameId: game.id };
}
