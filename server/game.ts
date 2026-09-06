import { GameState, Player, RoundHistory, AIProvider, AIPlayerConfig, getDefaultConfig, DEFAULT_GAME_RULES, CLASSIC_GAME_RULES, MAX_GAME_PLAYERS, MAX_TEAM_PLAYERS, type GameRules } from "@shared/schema";
import { dealTeamKeywords } from "./wordPacks";

// Shared by both orchestration layers (live websocket.ts games and the
// headless AI-research runner) so a player's effective AI config is
// resolved identically regardless of which one is driving the match.
export function getConfigForPlayer(player: Player): AIPlayerConfig {
  if (player.aiConfig) return player.aiConfig;
  if (player.aiProvider) return getDefaultConfig(player.aiProvider);
  return getDefaultConfig("chatgpt");
}

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
  // 6 chars over this 32-symbol alphabet is ~1.07B combinations (vs. ~1.05M at 4 chars) --
  // matches are looked up by gameId alone for replay/export, with no DB uniqueness
  // constraint, so a collision silently serves the wrong match's data. 4 chars put the
  // 50%-collision point around ~1,200 games, comfortably within this app's real usage;
  // 6 pushes that to ~38,700.
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "";
  for (let i = 0; i < 6; i++) {
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

function getPenaltyBurden(tokens: { whiteTokens: number; blackTokens: number }): [number, number, number] {
  return [
    tokens.whiteTokens + tokens.blackTokens,
    tokens.blackTokens,
    tokens.whiteTokens,
  ];
}

function comparePenaltyBurden(
  amberTokens: { whiteTokens: number; blackTokens: number },
  blueTokens: { whiteTokens: number; blackTokens: number },
): "amber" | "blue" | null {
  const amberBurden = getPenaltyBurden(amberTokens);
  const blueBurden = getPenaltyBurden(blueTokens);

  for (let index = 0; index < amberBurden.length; index += 1) {
    if (amberBurden[index] < blueBurden[index]) return "amber";
    if (blueBurden[index] < amberBurden[index]) return "blue";
  }

  return null;
}

// Live human games default to CLASSIC_GAME_RULES (2 intercepts, no minimum
// round count) so they play out the way anyone who knows the real Decrypto
// board game would expect. DEFAULT_GAME_RULES (3 intercepts, min 3 rounds)
// exists for the AI-research paths (Tournament/Series/Evolution/Coach/Arena),
// which explicitly pass config.gameRules || DEFAULT_GAME_RULES themselves --
// they don't rely on this default, so this only affects live games.
export function createNewGame(hostId: string, hostName: string, rules: GameRules = CLASSIC_GAME_RULES): GameState {
  return {
    id: generateGameId(),
    phase: "lobby",
    round: 0,
    rules: { ...rules },
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
    decodeSubmitter: { amber: null, blue: null },
    interceptSubmitter: { amber: null, blue: null },
    currentSelections: { amber: {}, blue: {} },
    teams: {
      amber: { keywords: [], whiteTokens: 0, blackTokens: 0, history: [] },
      blue: { keywords: [], whiteTokens: 0, blackTokens: 0, history: [] },
    },
    winner: null,
  };
}

// Picks who is allowed to submit this team's decode guess and interception
// guess for the round. A human always gets the job over an AI teammate
// whenever one is eligible, rotating round-robin by join order so the same
// person isn't stuck deciding every round.
//
// The two roles have different eligibility: decoding excludes the current
// round's clue-giver (they already know the code), but intercepting doesn't
// -- the clue-giver has no more insight into the opponent's code than
// anyone else. Normally the same person handles both jobs for simplicity.
// But if the team's only human happens to be this round's clue-giver,
// decoding is forced to an AI teammate -- and reusing that same AI for
// interception would leave a human who *could* be in control sitting out
// for the whole round. So interception falls back to finding its own
// human instead of blindly mirroring decode's pick.
function getDesignatedSubmitters(
  players: Player[],
  team: "amber" | "blue",
  round: number,
  clueGiverId: string | null,
): { decode: string | null; intercept: string | null } {
  const teamPlayers = players.filter(p => p.team === team);
  if (teamPlayers.length === 0) return { decode: null, intercept: null };

  const decodeEligible = teamPlayers.filter(p => p.id !== clueGiverId);
  const decodeHumans = decodeEligible.filter(p => !p.isAI);
  const decodePool = decodeHumans.length > 0 ? decodeHumans : decodeEligible;
  const decode = decodePool.length > 0 ? decodePool[(round - 1) % decodePool.length].id : null;

  const decodeSubmitterIsHuman = decodeHumans.some(p => p.id === decode);
  let intercept: string | null;
  if (decodeSubmitterIsHuman) {
    intercept = decode;
  } else {
    const interceptHumans = teamPlayers.filter(p => !p.isAI);
    intercept = interceptHumans.length > 0
      ? interceptHumans[(round - 1) % interceptHumans.length].id
      : decode;
  }

  return { decode, intercept };
}

export function addPlayer(game: GameState, player: Player): GameState {
  if (game.players.length >= MAX_GAME_PLAYERS) {
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

// A null team puts the player back in the unassigned pool, where
// autoAssignRemainingPlayers will place them at confirm time.
export function assignTeam(game: GameState, playerId: string, team: "amber" | "blue" | null): GameState {
  if (team !== null) {
    const currentTeamSize = game.players.filter(p => p.team === team && p.id !== playerId).length;
    if (currentTeamSize >= MAX_TEAM_PLAYERS) {
      return game;
    }
  }
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

  // One draw split between the teams rather than a draw each -- see
  // dealTeamKeywords for why a word landing on both boards has to be
  // impossible rather than merely unlikely.
  const dealt = dealTeamKeywords(4);

  return {
    ...game,
    phase: "team_setup",
    teams: {
      amber: { ...game.teams.amber, keywords: dealt.amber },
      blue: { ...game.teams.blue, keywords: dealt.blue },
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
    const amberOpen = amberCount < MAX_TEAM_PLAYERS;
    const blueOpen = blueCount < MAX_TEAM_PLAYERS;

    // Assign to smaller team, prefer blue if equal (humans typically pick
    // amber first), but never push a team past its cap.
    let team: "amber" | "blue";
    if (amberOpen && blueOpen) {
      team = blueCount < amberCount ? "blue" : (amberCount < blueCount ? "amber" : "blue");
    } else if (amberOpen) {
      team = "amber";
    } else {
      team = "blue";
    }

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

  const amberSubmitters = getDesignatedSubmitters(game.players, "amber", newRound, amberClueGiver);
  const blueSubmitters = getDesignatedSubmitters(game.players, "blue", newRound, blueClueGiver);

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
    decodeSubmitter: { amber: amberSubmitters.decode, blue: blueSubmitters.decode },
    interceptSubmitter: { amber: amberSubmitters.intercept, blue: blueSubmitters.intercept },
    currentSelections: { amber: {}, blue: {} },
  };
}

// Whether the round that was just evaluated actually decided the game --
// either a winner was determined, or the round limit was hit (which forces
// a decision, win or tie, via evaluateRound's comparePenaltyBurden call).
export function isGameDecided(game: GameState): boolean {
  return game.winner !== null || game.round >= game.rules.maxRounds;
}

// Called when the host (or, for all-AI games, the server itself) continues
// past round_results: moves on to the next round, or -- if this round
// decided the game -- finalizes the phase to game_over.
export function advanceFromRoundResults(game: GameState): GameState {
  return isGameDecided(game) ? { ...game, phase: "game_over" } : startNewRound(game);
}

export function updateSelection(
  game: GameState,
  team: "amber" | "blue",
  playerId: string,
  selection: [number | null, number | null, number | null],
): GameState {
  return {
    ...game,
    currentSelections: {
      ...game.currentSelections,
      [team]: {
        ...game.currentSelections[team],
        [playerId]: selection,
      },
    },
  };
}

export function submitClues(game: GameState, team: "amber" | "blue", clues: string[]): GameState {
  // Idempotency guard: a redundant call for a team that's already submitted
  // (e.g. two overlapping AI-turn dispatches racing each other) must not
  // silently swap out the clues teammates may already be decoding.
  if (game.currentClues[team] !== null) {
    return game;
  }

  // Normalize casing here so stored clues don't depend on who authored
  // them. The clue input uppercases what a human types, while the AI
  // response parser lowercases what a model returns -- both render through
  // the same uppercasing CSS, so the difference is invisible in game but
  // reaches the match_rounds rows, the CSV/JSON exports, and any
  // case-sensitive analysis downstream.
  const updatedClues = {
    ...game.currentClues,
    [team]: clues.map(clue => clue.trim().toLowerCase()),
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
  // Idempotency guard: a redundant call for a team that's already submitted
  // (e.g. two overlapping AI-turn dispatches racing each other) must not
  // re-run the phase transition, which would wipe out live interception
  // picks teammates had already started making in the meantime.
  if (game.currentGuesses[team].ownTeam !== null) {
    return game;
  }

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
    // Moving from decoding to intercepting is a new guessing task; clear
    // in-progress picks so decode-phase bubbles don't linger into it.
    currentSelections: bothGuessed ? { amber: {}, blue: {} } : game.currentSelections,
  };
}

export function submitInterception(game: GameState, team: "amber" | "blue", guess: [number, number, number]): GameState {
  // Idempotency guard: a redundant call for a team that's already submitted
  // (e.g. two overlapping AI-turn dispatches racing each other) must not
  // re-run evaluateRound -- that would double-count tokens and history for
  // the same round, and could end the game a round earlier than it should.
  if (game.currentGuesses[team].opponent !== null) {
    return game;
  }

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
  const rules = game.rules || DEFAULT_GAME_RULES;
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

  const amberLimitReached =
    newAmberTokens.whiteTokens >= rules.whiteTokenLimit
    || newAmberTokens.blackTokens >= rules.blackTokenLimit;
  const blueLimitReached =
    newBlueTokens.whiteTokens >= rules.whiteTokenLimit
    || newBlueTokens.blackTokens >= rules.blackTokenLimit;
  const canEndOnTokens = game.round >= rules.minRoundsBeforeWin;
  const maxRoundsReached = game.round >= rules.maxRounds;

  if (canEndOnTokens && (amberLimitReached || blueLimitReached)) {
    if (amberLimitReached && !blueLimitReached) {
      winner = "blue";
    } else if (blueLimitReached && !amberLimitReached) {
      winner = "amber";
    } else {
      winner = comparePenaltyBurden(newAmberTokens, newBlueTokens);
    }
  } else if (maxRoundsReached) {
    winner = comparePenaltyBurden(newAmberTokens, newBlueTokens);
  }

  return {
    ...game,
    // Always land on round_results first, even when this round decided
    // the game, so the final round's outcome is shown before the win
    // screen instead of being skipped straight past. advanceFromRoundResults
    // is what actually moves on to game_over, once someone continues.
    phase: "round_results",
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
