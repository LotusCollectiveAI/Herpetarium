import { WebSocketServer, WebSocket } from "ws";
import { Server } from "http";
import { GameState, Player, WSMessage, ServerMessage, wsMessageSchema, AIProvider } from "@shared/schema";
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
import { generateClues, generateGuess, generateInterception } from "./ai";
import { log } from "./index";

interface ClientConnection {
  ws: WebSocket;
  playerId: string;
  gameId: string;
}

const AI_TIMEOUT_MS = 30000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<{ result: T; timedOut: boolean; failed: boolean }> {
  const wrappedPromise = promise.then(result => ({ result, timedOut: false, failed: false }));

  const timeoutPromise = new Promise<{ result: T; timedOut: boolean; failed: boolean }>(resolve =>
    setTimeout(() => resolve({ result: fallback, timedOut: true, failed: false }), timeoutMs)
  );

  return Promise.race([wrappedPromise, timeoutPromise]).catch(() => ({
    result: fallback, timedOut: false, failed: true,
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

function sendGameState(gameId: string) {
  const game = games.get(gameId);
  if (!game) return;
  
  broadcast(gameId, { type: "game_state", state: game });
  
  // Send private info to clue givers
  const sockets = gameClients.get(gameId);
  if (!sockets) return;
  
  sockets.forEach(ws => {
    const client = clients.get(ws);
    if (!client) return;
    
    const player = game.players.find(p => p.id === client.playerId);
    if (!player?.team) return;
    
    // Send keywords to all team members
    const keywords = game.teams[player.team].keywords;
    if (keywords.length > 0) {
      sendTo(ws, { type: "keywords", keywords });
    }
    
    // Send code only to clue giver
    if (game.currentClueGiver[player.team] === client.playerId && game.currentCode[player.team]) {
      sendTo(ws, { type: "your_code", code: game.currentCode[player.team]! });
    }
  });
}

async function processAITurn(gameId: string) {
  const game = games.get(gameId);
  if (!game) return;
  
  switch (game.phase) {
    case "team_setup":
      // Just send state update - host must click confirm_teams to proceed
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
  // In team_setup phase, just send game state
  // AI players will be assigned when host clicks "confirm_teams"
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
    broadcast(gameId, { type: "ai_thinking", aiName });
    
    const code = game.currentCode[team]!;
    const keywords = game.teams[team].keywords;
    const history = game.teams[team].history.map(h => ({
      clues: h.clues,
      targetCode: h.targetCode,
    }));
    
    const fallbackClues = code.map(n => keywords[n - 1].slice(0, 3));
    
    const { result: clues, timedOut, failed } = await withTimeout(
      generateClues(clueGiver.aiProvider, { keywords, targetCode: code, history }),
      AI_TIMEOUT_MS,
      fallbackClues
    );
    
    if (timedOut) {
      log(`AI clue generation timed out for ${aiName}`, "websocket");
      broadcast(gameId, { type: "ai_fallback", aiName, reason: "AI took too long, using fallback clues" });
    } else if (failed) {
      log(`AI clue generation failed for ${aiName}`, "websocket");
      broadcast(gameId, { type: "ai_fallback", aiName, reason: "AI encountered an error, using fallback clues" });
    }
    
    game = games.get(gameId)!;
    game = submitClues(game, team, clues);
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
    broadcast(gameId, { type: "ai_thinking", aiName });
    
    const clues = game.currentClues[team]!;
    const keywords = game.teams[team].keywords;
    const history = game.teams[team].history.map(h => ({
      clues: h.clues,
      targetCode: h.targetCode,
    }));
    
    const { result: guess, timedOut, failed } = await withTimeout(
      generateGuess(aiGuesser.aiProvider!, { keywords, clues, history }),
      AI_TIMEOUT_MS,
      fallbackGuess
    );
    
    if (timedOut) {
      log(`AI guess timed out for ${aiName}`, "websocket");
      broadcast(gameId, { type: "ai_fallback", aiName, reason: "AI took too long, using fallback guess" });
    } else if (failed) {
      log(`AI guess failed for ${aiName}`, "websocket");
      broadcast(gameId, { type: "ai_fallback", aiName, reason: "AI encountered an error, using fallback guess" });
    }
    
    game = games.get(gameId)!;
    game = submitOwnTeamGuess(game, team, guess);
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
    broadcast(gameId, { type: "ai_thinking", aiName });
    
    const clues = game.currentClues[opponentTeam]!;
    const history = game.teams[opponentTeam].history.map(h => ({
      clues: h.clues,
      targetCode: h.targetCode,
    }));
    
    const { result: guess, timedOut, failed } = await withTimeout(
      generateInterception(aiInterceptor.aiProvider!, { clues, history }),
      AI_TIMEOUT_MS,
      fallbackGuess
    );
    
    if (timedOut) {
      log(`AI interception timed out for ${aiName}`, "websocket");
      broadcast(gameId, { type: "ai_fallback", aiName, reason: "AI took too long, using fallback guess" });
    } else if (failed) {
      log(`AI interception failed for ${aiName}`, "websocket");
      broadcast(gameId, { type: "ai_fallback", aiName, reason: "AI encountered an error, using fallback guess" });
    }
    
    game = games.get(gameId)!;
    game = submitInterception(game, team, guess);
    games.set(gameId, game);
    
    broadcast(gameId, { type: "ai_done", aiName });
  }
  
  sendGameState(gameId);
}

function handleMessage(ws: WebSocket, message: WSMessage) {
  const client = clients.get(ws);
  
  switch (message.type) {
    case "join": {
      const { gameId, playerName, playerId: existingPlayerId } = message;
      
      let game = games.get(gameId);
      let playerId: string;
      
      if (!game) {
        // Create new game
        playerId = generatePlayerId();
        game = createNewGame(playerId, playerName);
        game = { ...game, id: gameId };
        games.set(gameId, game);
        log(`New game ${gameId} created by ${playerName}`, "websocket");
      } else {
        // Check if reconnecting with existing player ID
        const existingPlayer = existingPlayerId 
          ? game.players.find(p => p.id === existingPlayerId && !p.isAI)
          : null;
        
        if (existingPlayer) {
          // Reconnect to existing player
          playerId = existingPlayer.id;
          log(`Player ${playerName} reconnected to game ${gameId}`, "websocket");
        } else {
          // Check if player with same name exists (for browser refresh without stored ID)
          const playerByName = game.players.find(p => p.name === playerName && !p.isAI);
          if (playerByName) {
            playerId = playerByName.id;
            log(`Player ${playerName} reconnected by name to game ${gameId}`, "websocket");
          } else {
            // New player joining
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
      
      // Close any old WebSocket connections for this playerId (ghost cleanup)
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
      
      // Register client
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
      
      const aiPlayer: Player = {
        id: generatePlayerId(),
        name: `${getAIProviderName(message.provider)}`,
        isAI: true,
        aiProvider: message.provider,
        team: null,
        isReady: true,
      };
      
      try {
        const updated = addPlayer(game, aiPlayer);
        games.set(client.gameId, updated);
        sendGameState(client.gameId);
        log(`AI ${aiPlayer.name} added to game ${client.gameId}`, "websocket");
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
      
      // Process AI team assignments
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
      
      // Auto-assign any remaining unassigned players (like AI) to balance teams
      game = autoAssignRemainingPlayers(game);
      games.set(client.gameId, game);
      
      // Verify both teams have at least 1 player after auto-assignment
      const amberPlayers = game.players.filter(p => p.team === "amber");
      const bluePlayers = game.players.filter(p => p.team === "blue");
      
      if (amberPlayers.length < 1 || bluePlayers.length < 1) {
        sendTo(ws, { type: "error", message: "Both teams need at least 1 player" });
        return;
      }
      
      // Start the first round
      let updated = startNewRound(game);
      games.set(client.gameId, updated);
      sendGameState(client.gameId);
      log(`Teams confirmed, Round 1 started for game ${client.gameId}`, "websocket");
      
      // Process AI clues
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
      
      // Check if AI needs to give clues for other team
      setTimeout(() => processAITurn(client.gameId), 100);
      break;
    }
    
    case "submit_guess": {
      if (!client) return;
      
      const game = games.get(client.gameId);
      if (!game || game.phase !== "own_team_guessing") return;
      
      const player = game.players.find(p => p.id === client.playerId);
      if (!player?.team) return;
      
      const updated = submitOwnTeamGuess(game, player.team, message.guess);
      games.set(client.gameId, updated);
      sendGameState(client.gameId);
      
      // Check if AI needs to guess
      setTimeout(() => processAITurn(client.gameId), 100);
      break;
    }
    
    case "submit_interception": {
      if (!client) return;
      
      const game = games.get(client.gameId);
      if (!game || game.phase !== "opponent_intercepting") return;
      
      const player = game.players.find(p => p.id === client.playerId);
      if (!player?.team) return;
      
      const updated = submitInterception(game, player.team, message.guess);
      games.set(client.gameId, updated);
      sendGameState(client.gameId);
      
      // Check if AI needs to intercept
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
      
      // Process AI clues
      setTimeout(() => processAITurn(client.gameId), 500);
      break;
    }
    
    case "request_state": {
      if (!client) return;
      sendGameState(client.gameId);
      break;
    }
  }
}

function handleDisconnect(ws: WebSocket) {
  const client = clients.get(ws);
  if (!client) return;
  
  const { gameId, playerId } = client;
  
  // Remove from game clients
  const sockets = gameClients.get(gameId);
  if (sockets) {
    sockets.delete(ws);
    if (sockets.size === 0) {
      gameClients.delete(gameId);
      // Clean up game after some time if no one reconnects
      setTimeout(() => {
        if (!gameClients.has(gameId) || gameClients.get(gameId)!.size === 0) {
          games.delete(gameId);
          log(`Game ${gameId} cleaned up`, "websocket");
        }
      }, 60000); // 1 minute
    }
  }
  
  clients.delete(ws);
  
  // Don't remove player immediately - they might reconnect
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
          handleMessage(ws, parsed.data);
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

// Export for API route
export function createGame(hostName: string): { gameId: string } {
  const hostId = generatePlayerId();
  const game = createNewGame(hostId, hostName);
  games.set(game.id, game);
  log(`Game ${game.id} created by ${hostName}`, "websocket");
  return { gameId: game.id };
}
