import { WebSocketServer, WebSocket } from "ws";
import { Server } from "http";
import { GameState, Player, WSMessage, ServerMessage, wsMessageSchema, AIPlayerConfig, getDefaultConfig, MODEL_OPTIONS } from "@shared/schema";
import {
  createNewGame,
  addPlayer,
  removePlayer,
  assignTeam,
  startGame,
  startNewRound,
  autoAssignRemainingPlayers,
  submitClues,
  submitOwnTeamGuess,
  submitInterception,
  generatePlayerId,
  getAIProviderName,
  shuffleArray,
} from "./game";
import { generateClues, generateGuess, generateInterception, AICallResult } from "./ai";
import { storage } from "./storage";
import { log } from "./index";

interface ClientConnection {
  ws: WebSocket;
  playerId: string;
  gameId: string;
}

const DEFAULT_AI_TIMEOUT_MS = 120000;
const MAX_AI_TIMEOUT_MS = 300000;

function getPlayerTimeout(player: Player): number {
  if (player.aiConfig?.timeoutMs) {
    return Math.min(player.aiConfig.timeoutMs, MAX_AI_TIMEOUT_MS);
  }
  return DEFAULT_AI_TIMEOUT_MS;
}

function getPlayerConfig(player: Player): AIPlayerConfig {
  if (player.aiConfig) return player.aiConfig;
  if (player.aiProvider) return getDefaultConfig(player.aiProvider);
  return getDefaultConfig("chatgpt");
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
      result: { result: fallback, prompt: "", rawResponse: "", model, latencyMs: timeoutMs, error: "timeout" },
      timedOut: true,
    }), timeoutMs)
  );

  return Promise.race([wrappedPromise, timeoutPromise]).catch(() => ({
    result: { result: fallback, prompt: "", rawResponse: "", model, latencyMs: 0, error: "unknown error" },
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

function sendGameState(gameId: string) {
  const game = games.get(gameId);
  if (!game) return;
  
  const prevPhase = lastPhase.get(gameId);
  if (prevPhase && prevPhase !== game.phase) {
    broadcast(gameId, { type: "phase_changed", phase: game.phase, round: game.round });
  }
  lastPhase.set(gameId, game.phase);
  
  broadcast(gameId, { type: "game_state", state: game });
  
  const sockets = gameClients.get(gameId);
  if (!sockets) return;
  
  sockets.forEach(ws => {
    const client = clients.get(ws);
    if (!client) return;
    
    const player = game.players.find(p => p.id === client.playerId);
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

async function logAiCall(gameId: string, roundNumber: number, provider: string, actionType: string, callResult: AICallResult<any>, timedOut: boolean) {
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
    });
  } catch (err) {
    log(`Failed to log AI call: ${err}`, "websocket");
  }
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
    const playerConfigs = game.players.map(p => ({
      id: p.id,
      name: p.name,
      isAI: p.isAI,
      aiProvider: p.aiProvider || null,
      team: p.team,
    }));

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
    });

    gameMatchIds.set(gameId, match.id);
    log(`Match record created: ${match.id} for game ${gameId}`, "websocket");
  } catch (err) {
    log(`Failed to create match record: ${err}`, "websocket");
  }
}

async function processAITurn(gameId: string) {
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
    const config = getPlayerConfig(clueGiver);
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
    
    await logAiCall(gameId, game.round, clueGiver.aiProvider, "generate_clues", callResult, timedOut);
    
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
    
    broadcast(gameId, { type: "ai_done", aiName });
  }
  
  sendGameState(gameId);
  
  game = games.get(gameId)!;
  if (game.phase === "own_team_guessing") {
    setTimeout(() => processAITurn(gameId), 500);
  }
}

async function processAIGuesses(gameId: string) {
  let game = games.get(gameId);
  if (!game || game.phase !== "own_team_guessing") return;
  
  const fallbackGuess: [number, number, number] = [1, 2, 3];
  
  for (const team of ["amber", "blue"] as const) {
    if (game.currentGuesses[team].ownTeam) continue;
    
    const teamPlayers = game.players.filter(p => p.team === team);
    const nonClueGivers = teamPlayers.filter(p => p.id !== game!.currentClueGiver[team]);
    const aiGuesser = nonClueGivers.find(p => p.isAI);
    
    if (!aiGuesser) {
      const humanGuessers = nonClueGivers.filter(p => !p.isAI);
      if (humanGuessers.length === 0 && teamPlayers.length === 1) {
        continue;
      }
      continue;
    }
    
    const aiName = getAIProviderName(aiGuesser.aiProvider!);
    const config = getPlayerConfig(aiGuesser);
    const timeoutMs = getPlayerTimeout(aiGuesser);
    
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
    
    await logAiCall(gameId, game.round, aiGuesser.aiProvider!, "generate_guess", callResult, timedOut);
    
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
    
    game = games.get(gameId)!;
    game = submitOwnTeamGuess(game, team, callResult.result);
    games.set(gameId, game);
    
    broadcast(gameId, { type: "ai_done", aiName });
  }
  
  sendGameState(gameId);
  
  game = games.get(gameId)!;
  if (game.phase === "opponent_intercepting") {
    setTimeout(() => processAITurn(gameId), 500);
  }
}

async function processAIInterceptions(gameId: string) {
  let game = games.get(gameId);
  if (!game || game.phase !== "opponent_intercepting") return;
  
  const fallbackGuess: [number, number, number] = [1, 2, 3];
  
  for (const team of ["amber", "blue"] as const) {
    if (game.currentGuesses[team].opponent) continue;
    
    const opponentTeam = team === "amber" ? "blue" : "amber";
    
    const teamPlayers = game.players.filter(p => p.team === team);
    const aiInterceptor = teamPlayers.find(p => p.isAI);
    
    if (!aiInterceptor) continue;
    
    const aiName = getAIProviderName(aiInterceptor.aiProvider!);
    const config = getPlayerConfig(aiInterceptor);
    const timeoutMs = getPlayerTimeout(aiInterceptor);
    
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
    
    await logAiCall(gameId, game.round, aiInterceptor.aiProvider!, "generate_interception", callResult, timedOut);
    
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
    
    game = games.get(gameId)!;
    game = submitInterception(game, team, callResult.result);
    games.set(gameId, game);
    
    broadcast(gameId, { type: "ai_done", aiName });
  }
  
  sendGameState(gameId);
  
  game = games.get(gameId)!;
  if (game.phase === "round_results" || game.phase === "game_over") {
    await persistRoundResults(gameId, game);
    if (game.phase === "game_over") {
      await persistGameCompletion(gameId, game);
    }
  }
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
      
      if (game.players.length < 2) {
        sendTo(ws, { type: "error", message: "Need at least 2 players" });
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
      
      game = autoAssignRemainingPlayers(game);
      games.set(client.gameId, game);
      
      const amberPlayers = game.players.filter(p => p.team === "amber");
      const bluePlayers = game.players.filter(p => p.team === "blue");
      
      if (amberPlayers.length < 1 || bluePlayers.length < 1) {
        sendTo(ws, { type: "error", message: "Both teams need at least 1 player" });
        return;
      }
      
      await createMatchRecord(client.gameId, game);
      
      let updated = startNewRound(game);
      games.set(client.gameId, updated);
      sendGameState(client.gameId);
      log(`Teams confirmed, Round 1 started for game ${client.gameId}`, "websocket");
      
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
      
      setTimeout(() => processAITurn(client.gameId), 100);
      break;
    }
    
    case "submit_guess": {
      if (!client) return;
      
      let game = games.get(client.gameId);
      if (!game || game.phase !== "own_team_guessing") return;
      
      const player = game.players.find(p => p.id === client.playerId);
      if (!player?.team) return;
      
      const updated = submitOwnTeamGuess(game, player.team, message.guess);
      games.set(client.gameId, updated);
      sendGameState(client.gameId);
      
      setTimeout(() => processAITurn(client.gameId), 100);
      break;
    }
    
    case "submit_interception": {
      if (!client) return;
      
      let game = games.get(client.gameId);
      if (!game || game.phase !== "opponent_intercepting") return;
      
      const player = game.players.find(p => p.id === client.playerId);
      if (!player?.team) return;
      
      const updated = submitInterception(game, player.team, message.guess);
      games.set(client.gameId, updated);
      sendGameState(client.gameId);
      
      if (updated.phase === "round_results" || updated.phase === "game_over") {
        persistRoundResults(client.gameId, updated);
        if (updated.phase === "game_over") {
          persistGameCompletion(client.gameId, updated);
        }
      }
      
      setTimeout(() => processAITurn(client.gameId), 100);
      break;
    }
    
    case "next_round": {
      if (!client) return;
      
      const game = games.get(client.gameId);
      if (!game || game.hostId !== client.playerId) {
        sendTo(ws, { type: "error", message: "Only host can advance rounds" });
        return;
      }
      
      const updated = startNewRound(game);
      games.set(client.gameId, updated);
      sendGameState(client.gameId);
      
      setTimeout(() => processAITurn(client.gameId), 500);
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
  const wss = new WebSocketServer({ server, path: "/ws" });
  
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
