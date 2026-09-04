import { describe, it, expect } from "vitest";
import { redactGameStateForTeam, HIDDEN_GUESS } from "./redactGameState";
import type { GameState, RoundHistory } from "@shared/schema";
import { CLASSIC_GAME_RULES } from "@shared/schema";

const AMBER_CODE: [number, number, number] = [1, 4, 2];
const BLUE_CODE: [number, number, number] = [3, 1, 2];

function pastRound(round: number): RoundHistory {
  return {
    round,
    clueGiverId: "p1",
    clues: ["flower", "sketch", "barn"],
    targetCode: AMBER_CODE,
    ownTeamGuess: AMBER_CODE,
    opponentGuess: [1, 2, 3],
    ownTeamCorrect: true,
    intercepted: false,
  };
}

// Mid-round state with every secret populated, so a leak shows up as a
// value surviving redaction rather than as an absence.
function midRound(): GameState {
  return {
    id: "GAME01",
    phase: "opponent_intercepting",
    round: 2,
    rules: CLASSIC_GAME_RULES,
    players: [
      { id: "p1", name: "Amber Human", isAI: false, team: "amber", isReady: true },
      { id: "p2", name: "Blue Human", isAI: false, team: "blue", isReady: true },
    ],
    hostId: "p1",
    currentClueGiver: { amber: "p1", blue: "p2" },
    currentCode: { amber: AMBER_CODE, blue: BLUE_CODE },
    currentClues: { amber: ["tusk", "pond", "room"], blue: ["nimbus", "clarity", "medal"] },
    currentGuesses: {
      amber: { ownTeam: [1, 4, 2], opponent: [2, 3, 1] },
      blue: { ownTeam: [3, 1, 2], opponent: [4, 4, 4] },
    },
    decodeSubmitter: { amber: "p1", blue: "p2" },
    interceptSubmitter: { amber: "p1", blue: "p2" },
    currentSelections: { amber: { p1: [1, 2, null] }, blue: { p2: [3, null, null] } },
    teams: {
      amber: { keywords: ["lily", "farm", "ivory", "drawing"], whiteTokens: 1, blackTokens: 0, history: [pastRound(1)] },
      blue: { keywords: ["nimbus", "teacup", "medal", "star"], whiteTokens: 0, blackTokens: 1, history: [pastRound(1)] },
    },
    winner: null,
  };
}

describe("redactGameStateForTeam", () => {
  it("never sends either team's current code, not even its owner's", () => {
    // The clue-giver gets their own code through a separate targeted
    // message, so it has no business being in the broadcast at all.
    for (const viewer of ["amber", "blue", null] as const) {
      expect(redactGameStateForTeam(midRound(), viewer).currentCode).toEqual({ amber: null, blue: null });
    }
  });

  it("keeps the viewer's own keywords and blanks the opponent's", () => {
    const forAmber = redactGameStateForTeam(midRound(), "amber");
    expect(forAmber.teams.amber.keywords).toEqual(["lily", "farm", "ivory", "drawing"]);
    expect(forAmber.teams.blue.keywords).toEqual([]);

    const forBlue = redactGameStateForTeam(midRound(), "blue");
    expect(forBlue.teams.blue.keywords).toEqual(["nimbus", "teacup", "medal", "star"]);
    expect(forBlue.teams.amber.keywords).toEqual([]);
  });

  it("keeps the viewer's own guesses and masks the opponent's values", () => {
    const forAmber = redactGameStateForTeam(midRound(), "amber");
    expect(forAmber.currentGuesses.amber).toEqual({ ownTeam: [1, 4, 2], opponent: [2, 3, 1] });
    expect(forAmber.currentGuesses.blue).toEqual({ ownTeam: HIDDEN_GUESS, opponent: HIDDEN_GUESS });
  });

  it("masks to a non-null sentinel so the roster can still show 'submitted'", () => {
    // ScoreBoard decides submitted-vs-pending purely on null-ness, for both
    // teams. Nulling the opponent's guesses left their roster stuck on
    // "in progress" for the whole round.
    const forAmber = redactGameStateForTeam(midRound(), "amber");
    expect(forAmber.currentGuesses.blue.ownTeam).not.toBeNull();
    expect(HIDDEN_GUESS.every(n => n < 1 || n > 4)).toBe(true);
  });

  it("still reports an unsubmitted opponent guess as null", () => {
    const game = midRound();
    game.currentGuesses.blue = { ownTeam: [3, 1, 2], opponent: null };

    const forAmber = redactGameStateForTeam(game, "amber");
    expect(forAmber.currentGuesses.blue.ownTeam).toEqual(HIDDEN_GUESS);
    expect(forAmber.currentGuesses.blue.opponent).toBeNull();
  });

  it("keeps the viewer's own live picks and drops the opponent's", () => {
    const forAmber = redactGameStateForTeam(midRound(), "amber");
    expect(forAmber.currentSelections.amber).toEqual({ p1: [1, 2, null] });
    expect(forAmber.currentSelections.blue).toEqual({});
  });

  it("leaves scored round history intact for both teams", () => {
    // Past codes and clues are deliberately public once a round is scored:
    // deducing across rounds depends on seeing the opponent's.
    const forAmber = redactGameStateForTeam(midRound(), "amber");
    expect(forAmber.teams.blue.history).toHaveLength(1);
    expect(forAmber.teams.blue.history[0].targetCode).toEqual(AMBER_CODE);
    expect(forAmber.teams.amber.history).toEqual(midRound().teams.amber.history);
  });

  it("leaves clues, tokens and roles alone", () => {
    const original = midRound();
    const forAmber = redactGameStateForTeam(original, "amber");
    expect(forAmber.currentClues).toEqual(original.currentClues);
    expect(forAmber.teams.amber.whiteTokens).toBe(1);
    expect(forAmber.teams.blue.blackTokens).toBe(1);
    expect(forAmber.currentClueGiver).toEqual(original.currentClueGiver);
    expect(forAmber.decodeSubmitter).toEqual(original.decodeSubmitter);
    expect(forAmber.players).toEqual(original.players);
  });

  it("gives a viewer with no team yet nothing secret from either side", () => {
    const forNobody = redactGameStateForTeam(midRound(), null);
    expect(forNobody.teams.amber.keywords).toEqual([]);
    expect(forNobody.teams.blue.keywords).toEqual([]);
    expect(forNobody.currentSelections).toEqual({ amber: {}, blue: {} });
    expect(forNobody.currentGuesses.amber).toEqual({ ownTeam: HIDDEN_GUESS, opponent: HIDDEN_GUESS });
    expect(forNobody.currentGuesses.blue).toEqual({ ownTeam: HIDDEN_GUESS, opponent: HIDDEN_GUESS });
  });

  it("does not mutate the state it was given", () => {
    const game = midRound();
    redactGameStateForTeam(game, "amber");
    expect(game).toEqual(midRound());
  });

  it("leaves no trace of the opponent's secrets anywhere in the payload", () => {
    // A blunt backstop against a future field carrying a secret through:
    // serialize the whole thing and look for the values themselves.
    const serialized = JSON.stringify(redactGameStateForTeam(midRound(), "amber"));
    for (const keyword of ["nimbus", "teacup", "star"]) {
      // "nimbus" and "medal" also appear as blue's public clues this round,
      // so only keywords that aren't currently clued can be checked here.
      if (keyword === "nimbus") continue;
      expect(serialized).not.toContain(keyword);
    }
    // Blue's decode guess [3,1,2] must not appear as a triple.
    expect(serialized).not.toContain("[3,1,2]");
  });
});
