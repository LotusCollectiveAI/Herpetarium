import { describe, it, expect } from "vitest";
import {
  createNewGame,
  addPlayer,
  assignTeam,
  startGame,
  startNewRound,
  submitClues,
  submitOwnTeamGuess,
  submitInterception,
  updateSelection,
  advanceFromRoundResults,
  isGameDecided,
  autoAssignRemainingPlayers,
  createSeededRng,
} from "./game";
import { CLASSIC_GAME_RULES, MAX_TEAM_PLAYERS, type GameRules, type GameState, type Player } from "@shared/schema";

type Team = "amber" | "blue";

function ai(id: string, name: string): Player {
  return { id, name, isAI: true, aiProvider: "claude", team: null, isReady: true };
}

// Builds a 2v2 sitting in giving_clues, using the real reducers rather than
// a hand-written GameState so the fixture can't drift from what the game
// actually produces. The rng is seeded, so codes are stable per rules.
function startedGame(rules: GameRules = CLASSIC_GAME_RULES, seed = "test-seed"): GameState {
  let game = createNewGame("host", "Host", rules);
  game = { ...game, players: [{ ...game.players[0], team: null }] };
  for (const p of [ai("a2", "A2"), ai("b1", "B1"), ai("b2", "B2")]) {
    game = addPlayer(game, p);
  }
  game = assignTeam(game, "host", "amber");
  game = assignTeam(game, "a2", "amber");
  game = assignTeam(game, "b1", "blue");
  game = assignTeam(game, "b2", "blue");
  game = startGame(game);
  return startNewRound(game, createSeededRng(seed));
}

// Drives a whole round, choosing each guess relative to the real code so
// the outcome is stated rather than depending on what the rng produced.
function playRound(
  game: GameState,
  outcome: Record<Team, { decodes: boolean; intercepts: boolean }>,
): GameState {
  const wrong = (code: readonly number[]): [number, number, number] => {
    const shifted = code.map(n => (n % 4) + 1) as [number, number, number];
    return shifted.every((n, i) => n === code[i]) ? [4, 3, 2] : shifted;
  };

  for (const team of ["amber", "blue"] as const) {
    game = submitClues(game, team, ["one", "two", "three"]);
  }
  for (const team of ["amber", "blue"] as const) {
    const code = game.currentCode[team]!;
    game = submitOwnTeamGuess(game, team, outcome[team].decodes ? [...code] as [number, number, number] : wrong(code));
  }
  for (const team of ["amber", "blue"] as const) {
    const opponent: Team = team === "amber" ? "blue" : "amber";
    const opponentCode = game.currentCode[opponent]!;
    // `intercepts` describes this team cracking the opponent's code.
    game = submitInterception(
      game,
      team,
      outcome[team].intercepts ? [...opponentCode] as [number, number, number] : wrong(opponentCode),
    );
  }
  return game;
}

describe("submitClues", () => {
  it("normalizes casing so stored clues don't depend on who wrote them", () => {
    const game = submitClues(startedGame(), "amber", ["  FLOWER ", "Sketch", "barn"]);
    expect(game.currentClues.amber).toEqual(["flower", "sketch", "barn"]);
  });

  it("ignores a second submission rather than replacing clues mid-round", () => {
    let game = submitClues(startedGame(), "amber", ["first", "second", "third"]);
    game = submitClues(game, "amber", ["late", "late", "late"]);
    expect(game.currentClues.amber).toEqual(["first", "second", "third"]);
  });

  it("moves to decoding only once both teams have clued", () => {
    let game = submitClues(startedGame(), "amber", ["a", "b", "c"]);
    expect(game.phase).toBe("giving_clues");
    game = submitClues(game, "blue", ["d", "e", "f"]);
    expect(game.phase).toBe("own_team_guessing");
  });
});

describe("submitOwnTeamGuess", () => {
  it("ignores a second submission", () => {
    let game = startedGame();
    game = submitClues(game, "amber", ["a", "b", "c"]);
    game = submitClues(game, "blue", ["d", "e", "f"]);
    game = submitOwnTeamGuess(game, "amber", [1, 2, 3]);
    game = submitOwnTeamGuess(game, "amber", [4, 4, 4]);
    expect(game.currentGuesses.amber.ownTeam).toEqual([1, 2, 3]);
  });

  it("clears in-progress picks when the phase turns to intercepting", () => {
    let game = startedGame();
    game = submitClues(game, "amber", ["a", "b", "c"]);
    game = submitClues(game, "blue", ["d", "e", "f"]);
    game = updateSelection(game, "amber", "a2", [1, 2, null]);
    expect(Object.keys(game.currentSelections.amber)).toHaveLength(1);

    game = submitOwnTeamGuess(game, "amber", [1, 2, 3]);
    expect(game.currentSelections.amber).toEqual({ a2: [1, 2, null] });

    game = submitOwnTeamGuess(game, "blue", [1, 2, 3]);
    expect(game.phase).toBe("opponent_intercepting");
    expect(game.currentSelections).toEqual({ amber: {}, blue: {} });
  });
});

describe("evaluateRound scoring", () => {
  it("gives a white token for failing to decode and none for succeeding", () => {
    const game = playRound(startedGame(), {
      amber: { decodes: false, intercepts: false },
      blue: { decodes: true, intercepts: false },
    });
    expect(game.phase).toBe("round_results");
    expect(game.teams.amber.whiteTokens).toBe(1);
    expect(game.teams.blue.whiteTokens).toBe(0);
  });

  it("charges the black token to the team whose code was cracked", () => {
    const game = playRound(startedGame(), {
      amber: { decodes: true, intercepts: true },
      blue: { decodes: true, intercepts: false },
    });
    // Amber cracked blue's code, so the penalty lands on blue.
    expect(game.teams.blue.blackTokens).toBe(1);
    expect(game.teams.amber.blackTokens).toBe(0);
  });

  it("records one history entry per team per round, with the real code", () => {
    const game = playRound(startedGame(), {
      amber: { decodes: true, intercepts: false },
      blue: { decodes: true, intercepts: false },
    });
    expect(game.teams.amber.history).toHaveLength(1);
    expect(game.teams.blue.history).toHaveLength(1);
    const entry = game.teams.amber.history[0];
    expect(entry.round).toBe(1);
    expect(entry.ownTeamGuess).toEqual(entry.targetCode);
    expect(entry.ownTeamCorrect).toBe(true);
    expect(entry.intercepted).toBe(false);
  });
});

describe("submitInterception idempotency", () => {
  it("does not evaluate the round twice, which would double the tokens", () => {
    let game = startedGame();
    game = submitClues(game, "amber", ["a", "b", "c"]);
    game = submitClues(game, "blue", ["d", "e", "f"]);
    const amberCode = game.currentCode.amber!;
    const blueCode = game.currentCode.blue!;

    // Both teams misread their own code: one white token each, once.
    game = submitOwnTeamGuess(game, "amber", [9, 9, 9] as unknown as [number, number, number]);
    game = submitOwnTeamGuess(game, "blue", [9, 9, 9] as unknown as [number, number, number]);
    game = submitInterception(game, "amber", [...blueCode] as [number, number, number]);
    game = submitInterception(game, "blue", [...amberCode] as [number, number, number]);

    const afterFirst = game;
    expect(afterFirst.teams.amber.whiteTokens).toBe(1);
    expect(afterFirst.teams.amber.history).toHaveLength(1);

    // A duplicate dispatch for a team that already submitted must be inert.
    const afterRepeat = submitInterception(afterFirst, "blue", [...amberCode] as [number, number, number]);
    expect(afterRepeat).toBe(afterFirst);
    expect(afterRepeat.teams.amber.whiteTokens).toBe(1);
    expect(afterRepeat.teams.amber.history).toHaveLength(1);
  });
});

describe("win conditions", () => {
  const twoWhiteToLose: GameRules = { ...CLASSIC_GAME_RULES, whiteTokenLimit: 2, minRoundsBeforeWin: 0 };

  it("hands the win to the other team once one hits the token limit", () => {
    let game = startedGame(twoWhiteToLose);
    for (let round = 0; round < 2; round++) {
      game = playRound(game, {
        amber: { decodes: false, intercepts: false },
        blue: { decodes: true, intercepts: false },
      });
      if (round === 0) {
        expect(game.winner).toBeNull();
        game = advanceFromRoundResults(game);
      }
    }
    expect(game.teams.amber.whiteTokens).toBe(2);
    expect(game.winner).toBe("blue");
  });

  it("shows the deciding round before the game-over screen", () => {
    let game = startedGame(twoWhiteToLose);
    game = playRound(game, { amber: { decodes: false, intercepts: false }, blue: { decodes: true, intercepts: false } });
    game = advanceFromRoundResults(game);
    game = playRound(game, { amber: { decodes: false, intercepts: false }, blue: { decodes: true, intercepts: false } });

    expect(game.winner).toBe("blue");
    expect(game.phase).toBe("round_results");
    expect(isGameDecided(game)).toBe(true);
    expect(advanceFromRoundResults(game).phase).toBe("game_over");
  });

  it("does not end on tokens before minRoundsBeforeWin", () => {
    const patientRules: GameRules = { ...CLASSIC_GAME_RULES, whiteTokenLimit: 1, minRoundsBeforeWin: 3 };
    const game = playRound(startedGame(patientRules), {
      amber: { decodes: false, intercepts: false },
      blue: { decodes: true, intercepts: false },
    });
    expect(game.teams.amber.whiteTokens).toBe(1);
    expect(game.winner).toBeNull();
  });
});

describe("assignTeam", () => {
  it("refuses to push a team past its cap", () => {
    let game = createNewGame("host", "Host", CLASSIC_GAME_RULES);
    game = { ...game, players: [{ ...game.players[0], team: null }] };
    for (let i = 0; i < MAX_TEAM_PLAYERS; i++) {
      game = addPlayer(game, ai(`x${i}`, `X${i}`));
      game = assignTeam(game, `x${i}`, "amber");
    }
    expect(game.players.filter(p => p.team === "amber")).toHaveLength(MAX_TEAM_PLAYERS);

    const rejected = assignTeam(game, "host", "amber");
    expect(rejected).toBe(game);
    expect(rejected.players.find(p => p.id === "host")?.team).toBeNull();
  });

  it("puts a player back in the pool when given a null team", () => {
    let game = startedGame();
    game = assignTeam(game, "a2", null);
    expect(game.players.find(p => p.id === "a2")?.team).toBeNull();
  });
});

describe("autoAssignRemainingPlayers", () => {
  it("leaves explicit assignments alone and only fills the gaps", () => {
    let game = createNewGame("host", "Host", CLASSIC_GAME_RULES);
    game = { ...game, players: [{ ...game.players[0], team: null }] };
    for (const p of [ai("bot1", "Bot1"), ai("bot2", "Bot2"), ai("bot3", "Bot3")]) {
      game = addPlayer(game, p);
    }
    // The host's deliberate lineup: two bots on amber, nothing on blue.
    game = assignTeam(game, "bot1", "amber");
    game = assignTeam(game, "bot2", "amber");
    game = assignTeam(game, "host", "blue");

    const filled = autoAssignRemainingPlayers(game);
    expect(filled.players.find(p => p.id === "bot1")?.team).toBe("amber");
    expect(filled.players.find(p => p.id === "bot2")?.team).toBe("amber");
    expect(filled.players.find(p => p.id === "host")?.team).toBe("blue");
    expect(filled.players.find(p => p.id === "bot3")?.team).toBe("blue");
    expect(filled.players.every(p => p.team !== null)).toBe(true);
  });
});
