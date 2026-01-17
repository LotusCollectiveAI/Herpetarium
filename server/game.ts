import { GameState, Player, RoundHistory, AIProvider } from "@shared/schema";

// Word list for generating keywords
const WORD_LIST = [
  "beach", "castle", "dragon", "eagle", "forest", "garden", "harbor", "island",
  "jungle", "knight", "lantern", "mountain", "Neptune", "ocean", "palace", "queen",
  "rainbow", "shadow", "thunder", "unicorn", "valley", "wizard", "arctic", "bridge",
  "crystal", "desert", "ember", "falcon", "glacier", "horizon", "ivory", "jasmine",
  "kingdom", "legend", "meteor", "nebula", "oracle", "phoenix", "quartz", "raven",
  "serpent", "temple", "umbrella", "volcano", "whisper", "xenon", "youth", "zenith",
  "anchor", "blossom", "canyon", "diamond", "eclipse", "flame", "ghost", "harvest",
  "iceberg", "jester", "kraken", "labyrinth", "mirror", "nova", "obsidian", "prism"
];

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

export function getRandomKeywords(count: number = 4): string[] {
  const shuffled = shuffleArray(WORD_LIST);
  return shuffled.slice(0, count);
}

export function generateSecretCode(): [number, number, number] {
  const numbers = [1, 2, 3, 4];
  const shuffled = shuffleArray(numbers);
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
  if (game.players.length >= 4) {
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

export function startNewRound(game: GameState): GameState {
  const newRound = game.round + 1;
  
  // Select clue givers (rotate through team members)
  const amberPlayers = game.players.filter(p => p.team === "amber");
  const bluePlayers = game.players.filter(p => p.team === "blue");
  
  const amberClueGiver = amberPlayers[(newRound - 1) % amberPlayers.length]?.id || null;
  const blueClueGiver = bluePlayers[(newRound - 1) % bluePlayers.length]?.id || null;
  
  // Generate secret codes
  const amberCode = generateSecretCode();
  const blueCode = generateSecretCode();
  
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
  }
}
