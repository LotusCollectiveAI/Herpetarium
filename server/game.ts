import { GameState, Player, RoundHistory, AIProvider } from "@shared/schema";
import { getRandomKeywords } from "./wordPacks";

export function createSeededRng(seed: string): () => number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(31, h) + seed.charCodeAt(i) | 0;
  }
  let s = h >>> 0;
  return () => {
    s ^= s << 13;
    s ^= s >> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

export function generateSeed(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function seededShuffleArray<T>(array: T[], rng: () => number): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function generateGameId(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "";
  for (let i = 0; i < 4; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function generatePlayerId(): string {
  return `p_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// getRandomKeywords is now imported from ./wordPacks (see top of file)

export function generateSecretCode(rng?: () => number): [number, number, number] {
  const numbers = [1, 2, 3, 4];
  const shuffled = rng ? seededShuffleArray(numbers, rng) : shuffleArray(numbers);
  return [shuffled[0], shuffled[1], shuffled[2]] as [number, number, number];
}

export function createNewGame(hostId: string, hostName: string): GameState {
  return {
    id: generateGameId(),
    phase: "lobby",
    round: 0,
    players: [{
      id: hostId,
      name: hostName,
      isAI: false,
      team: null,
      isReady: false,
    }],
    hostId,
    currentClueGiver: { amber: null, blue: null },
    currentCode: { amber: null, blue: null },
    currentClues: { amber: null, blue: null },
    currentGuesses: {
      amber: { ownTeam: null, opponent: null },
      blue: { ownTeam: null, opponent: null },
    },
    teams: {
      amber: { keywords: [], whiteTokens: 0, blackTokens: 0, history: [] },
      blue: { keywords: [], whiteTokens: 0, blackTokens: 0, history: [] },
    },
    winner: null,
  };
}

export function addPlayer(game: GameState, player: Player): GameState {
  if (game.players.length >= 6) {
    throw new Error("Game is full");
  }
  if (game.phase !== "lobby") {
    throw new Error("Game has already started");
  }
  return {
    ...game,
    players: [...game.players, player],
  };
}

export function removePlayer(game: GameState, playerId: string): GameState {
  return {
    ...game,
    players: game.players.filter(p => p.id !== playerId),
  };
}

export function assignTeam(game: GameState, playerId: string, team: "amber" | "blue"): GameState {
  return {
    ...game,
    players: game.players.map(p => 
      p.id === playerId ? { ...p, team } : p
    ),
  };
}

export function startGame(game: GameState): GameState {
  // Don't auto-assign anyone yet - let players pick teams in team_setup phase
  // AI players will be assigned when the host confirms teams

  // Generate keywords for each team
  const amberKeywords = getRandomKeywords(4);
  const blueKeywords = getRandomKeywords(4);

  return {
    ...game,
    phase: "team_setup",
    teams: {
      amber: { ...game.teams.amber, keywords: amberKeywords },
      blue: { ...game.teams.blue, keywords: blueKeywords },
    },
  };
}

export function autoAssignRemainingPlayers(game: GameState): GameState {
  // Assign any unassigned players (mostly AI) to balance teams
  const unassigned = game.players.filter(p => p.team === null);
  
  // Count existing team members
  let amberCount = game.players.filter(p => p.team === "amber").length;
  let blueCount = game.players.filter(p => p.team === "blue").length;
  
  // Build assignment map
  const assignments = new Map<string, "amber" | "blue">();
  for (const player of unassigned) {
    // Assign to smaller team, prefer blue if equal (humans typically pick amber first)
    const team: "amber" | "blue" = blueCount < amberCount ? "blue" : (amberCount < blueCount ? "amber" : "blue");
    assignments.set(player.id, team);
    if (team === "amber") {
      amberCount++;
    } else {
      blueCount++;
    }
  }
  
  const updatedPlayers = game.players.map(p => {
    if (p.team !== null) return p;
    const assignedTeam = assignments.get(p.id);
    return assignedTeam ? { ...p, team: assignedTeam } : p;
  });

  return {
    ...game,
    players: updatedPlayers,
  };
}

export function startNewRound(game: GameState, rng?: () => number): GameState {
  const newRound = game.round + 1;
  
  const amberPlayers = game.players.filter(p => p.team === "amber");
  const bluePlayers = game.players.filter(p => p.team === "blue");
  
  const amberClueGiver = amberPlayers[(newRound - 1) % amberPlayers.length]?.id || null;
  const blueClueGiver = bluePlayers[(newRound - 1) % bluePlayers.length]?.id || null;
  
  const amberCode = generateSecretCode(rng);
  const blueCode = generateSecretCode(rng);
  
  return {
    ...game,
    phase: "giving_clues",
    round: newRound,
    currentClueGiver: { amber: amberClueGiver, blue: blueClueGiver },
    currentCode: { amber: amberCode, blue: blueCode },
    currentClues: { amber: null, blue: null },
    currentGuesses: {
      amber: { ownTeam: null, opponent: null },
      blue: { ownTeam: null, opponent: null },
    },
  };
}

export function submitClues(game: GameState, team: "amber" | "blue", clues: string[]): GameState {
  const updatedClues = {
    ...game.currentClues,
    [team]: clues,
  };
  
  // Check if both teams have submitted clues
  const bothSubmitted = updatedClues.amber !== null && updatedClues.blue !== null;
  
  return {
    ...game,
    currentClues: updatedClues,
    phase: bothSubmitted ? "own_team_guessing" : game.phase,
  };
}

export function submitOwnTeamGuess(game: GameState, team: "amber" | "blue", guess: [number, number, number]): GameState {
  const updatedGuesses = {
    ...game.currentGuesses,
    [team]: {
      ...game.currentGuesses[team],
      ownTeam: guess,
    },
  };
  
  // Check if both teams have guessed
  const bothGuessed = updatedGuesses.amber.ownTeam !== null && updatedGuesses.blue.ownTeam !== null;
  
  return {
    ...game,
    currentGuesses: updatedGuesses,
    phase: bothGuessed ? "opponent_intercepting" : game.phase,
  };
}

export function submitInterception(game: GameState, team: "amber" | "blue", guess: [number, number, number]): GameState {
  const updatedGuesses = {
    ...game.currentGuesses,
    [team]: {
      ...game.currentGuesses[team],
      opponent: guess,
    },
  };
  
  // Check if both teams have submitted interceptions
  const bothIntercepted = updatedGuesses.amber.opponent !== null && updatedGuesses.blue.opponent !== null;
  
  if (bothIntercepted) {
    return evaluateRound({
      ...game,
      currentGuesses: updatedGuesses,
    });
  }
  
  return {
    ...game,
    currentGuesses: updatedGuesses,
  };
}

function arraysEqual(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((val, idx) => val === b[idx]);
}

export function evaluateRound(game: GameState): GameState {
  // Evaluate both teams
  const evaluateTeam = (team: "amber" | "blue"): { history: RoundHistory; whiteTokens: number; blackTokens: number } => {
    const opponentTeam = team === "amber" ? "blue" : "amber";
    const targetCode = game.currentCode[team]!;
    const ownGuess = game.currentGuesses[team].ownTeam!;
    const opponentGuess = game.currentGuesses[opponentTeam].opponent!;
    
    const ownTeamCorrect = arraysEqual(ownGuess, targetCode);
    const intercepted = arraysEqual(opponentGuess, targetCode);
    
    return {
      history: {
        round: game.round,
        clueGiverId: game.currentClueGiver[team]!,
        clues: game.currentClues[team]!,
        targetCode,
        ownTeamGuess: ownGuess,
        opponentGuess: opponentGuess,
        ownTeamCorrect,
        intercepted,
      },
      whiteTokens: !ownTeamCorrect ? 1 : 0,
      blackTokens: intercepted ? 1 : 0,
    };
  };
  
  const amberResult = evaluateTeam("amber");
  const blueResult = evaluateTeam("blue");
  
  const newAmberTokens = {
    whiteTokens: game.teams.amber.whiteTokens + amberResult.whiteTokens,
    blackTokens: game.teams.amber.blackTokens + amberResult.blackTokens,
  };
  
  const newBlueTokens = {
    whiteTokens: game.teams.blue.whiteTokens + blueResult.whiteTokens,
    blackTokens: game.teams.blue.blackTokens + blueResult.blackTokens,
  };
  
  // Check win conditions
  let winner: "amber" | "blue" | null = null;
  
  // Team loses if they have 2 white or 2 black tokens
  if (newAmberTokens.whiteTokens >= 2 || newAmberTokens.blackTokens >= 2) {
    winner = "blue";
  } else if (newBlueTokens.whiteTokens >= 2 || newBlueTokens.blackTokens >= 2) {
    winner = "amber";
  }
  
  return {
    ...game,
    phase: winner ? "game_over" : "round_results",
    winner,
    teams: {
      amber: {
        ...game.teams.amber,
        ...newAmberTokens,
        history: [...game.teams.amber.history, amberResult.history],
      },
      blue: {
        ...game.teams.blue,
        ...newBlueTokens,
        history: [...game.teams.blue.history, blueResult.history],
      },
    },
  };
}

export function getAIProviderName(provider: AIProvider): string {
  switch (provider) {
    case "chatgpt": return "ChatGPT";
    case "claude": return "Claude";
    case "gemini": return "Gemini";
    case "openrouter": return "OpenRouter";
  }
}

export interface ValidationError {
  field: string;
  message: string;
  severity: "error" | "warning";
}

export function validateGameState(game: GameState): ValidationError[] {
  const errors: ValidationError[] = [];

  if (game.round < 0) {
    errors.push({ field: "round", message: `Invalid round number: ${game.round}`, severity: "error" });
  }

  for (const team of ["amber", "blue"] as const) {
    const ts = game.teams[team];
    if (ts.whiteTokens < 0) {
      errors.push({ field: `teams.${team}.whiteTokens`, message: `Negative white tokens: ${ts.whiteTokens}`, severity: "error" });
    }
    if (ts.blackTokens < 0) {
      errors.push({ field: `teams.${team}.blackTokens`, message: `Negative black tokens: ${ts.blackTokens}`, severity: "error" });
    }
    if (game.phase !== "lobby" && game.phase !== "team_setup" && ts.keywords.length !== 4) {
      errors.push({ field: `teams.${team}.keywords`, message: `Expected 4 keywords, got ${ts.keywords.length}`, severity: "error" });
    }
    if (ts.keywords.length > 0) {
      const uniqueKeywords = new Set(ts.keywords.map(k => k.toLowerCase()));
      if (uniqueKeywords.size !== ts.keywords.length) {
        errors.push({ field: `teams.${team}.keywords`, message: `Duplicate keywords detected`, severity: "error" });
      }
    }
    const completedRounds = (game.phase === "round_results" || game.phase === "game_over") ? game.round : Math.max(0, game.round - 1);
    if (game.round > 0 && ts.history.length !== completedRounds) {
      errors.push({ field: `teams.${team}.history`, message: `Expected ${completedRounds} history entries, got ${ts.history.length}`, severity: "warning" });
    }
    for (let h = 0; h < ts.history.length; h++) {
      const entry = ts.history[h];
      if (entry.clues && entry.clues.length !== 3) {
        errors.push({ field: `teams.${team}.history[${h}].clues`, message: `Expected 3 clues, got ${entry.clues.length}`, severity: "warning" });
      }
      if (entry.targetCode) {
        const code = entry.targetCode;
        if (code.length !== 3) {
          errors.push({ field: `teams.${team}.history[${h}].targetCode`, message: `Expected 3-element code, got ${code.length}`, severity: "error" });
        }
        const validPositions = code.every((n: number) => n >= 1 && n <= 4);
        if (!validPositions) {
          errors.push({ field: `teams.${team}.history[${h}].targetCode`, message: `Code contains invalid positions (must be 1-4)`, severity: "error" });
        }
        const uniquePositions = new Set(code);
        if (uniquePositions.size !== code.length) {
          errors.push({ field: `teams.${team}.history[${h}].targetCode`, message: `Code contains duplicate positions`, severity: "warning" });
        }
      }
    }
  }

  const amberPlayers = game.players.filter(p => p.team === "amber");
  const bluePlayers = game.players.filter(p => p.team === "blue");

  if (game.phase !== "lobby" && game.phase !== "team_setup") {
    if (amberPlayers.length === 0) {
      errors.push({ field: "players", message: "Amber team has no players", severity: "error" });
    }
    if (bluePlayers.length === 0) {
      errors.push({ field: "players", message: "Blue team has no players", severity: "error" });
    }
  }

  if (game.phase === "game_over" && game.winner === null) {
    errors.push({ field: "winner", message: "Game is over but no winner set", severity: "warning" });
  }

  if (game.phase !== "game_over" && game.winner !== null) {
    errors.push({ field: "winner", message: "Winner set but game not over", severity: "error" });
  }

  const playerIds = game.players.map(p => p.id);
  const uniqueIds = new Set(playerIds);
  if (uniqueIds.size !== playerIds.length) {
    errors.push({ field: "players", message: "Duplicate player IDs detected", severity: "error" });
  }

  return errors;
}
