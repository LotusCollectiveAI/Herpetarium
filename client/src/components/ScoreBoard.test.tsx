// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TeamRosters } from "./ScoreBoard";
import {
  addPlayer,
  createNewGame,
  startGame,
  startNewRound,
  submitClues,
  submitOwnTeamGuess,
  updateSelection,
  createSeededRng,
} from "../../../server/game";
import type { GameState, Player } from "@shared/schema";

// The fixture is built by running the real reducers rather than by writing a
// GameState literal: a literal is a second source of truth for the shape and
// silently drifts from the schema, and the interesting cases here (who is the
// designated submitter, who is the clue-giver) are assigned by those reducers
// anyway, so hand-picking them would be testing an arrangement the game can't
// actually produce.
function threeVersusThree(): GameState {
  const seat = (n: number, team: "amber" | "blue"): Player => ({
    id: `p${n}`,
    name: `Player ${n}`,
    isAI: false,
    team,
    isReady: true,
  });

  let game = createNewGame("p1", "Player 1");
  game = { ...game, players: [{ ...game.players[0], team: "amber" }] };
  for (const [n, team] of [[2, "amber"], [3, "amber"], [4, "blue"], [5, "blue"], [6, "blue"]] as const) {
    game = addPlayer(game, seat(n, team));
  }
  game = startGame(game);
  return startNewRound(game, createSeededRng("scoreboard-fixture"));
}

const statusOf = (playerId: string) =>
  screen.queryByTestId(`player-status-${playerId}`)?.textContent ?? null;

const amberSeats = (game: GameState) => game.players.filter(p => p.team === "amber");

describe("TeamRosters activity attribution", () => {
  it("marks only the clue-giver as working during the clue phase", () => {
    const game = threeVersusThree();
    render(<TeamRosters gameState={game} playerId="p1" />);

    for (const player of amberSeats(game)) {
      const status = statusOf(player.id);
      if (player.id === game.currentClueGiver.amber) {
        expect(status).toBe("Creating clues");
      } else {
        expect(status).toBeNull();
      }
    }
  });

  it("shows the clue-giver as done once clues are in", () => {
    let game = threeVersusThree();
    game = submitClues(game, "amber", ["one", "two", "three"]);
    render(<TeamRosters gameState={game} playerId="p1" />);

    expect(statusOf(game.currentClueGiver.amber!)).toBe("Clues submitted");
    expect(statusOf(game.currentClueGiver.blue!)).toBe("Creating clues");
  });

  it("credits a submitted decode to the designated submitter alone", () => {
    // The bug this pins: the roster read the team's single submitted guess
    // and reported "Guess submitted" against all three teammates, which is
    // wrong the moment a team has more than two players.
    let game = threeVersusThree();
    game = submitClues(game, "amber", ["one", "two", "three"]);
    game = submitClues(game, "blue", ["four", "five", "six"]);
    expect(game.phase).toBe("own_team_guessing");

    game = submitOwnTeamGuess(game, "amber", [2, 3, 4]);
    render(<TeamRosters gameState={game} playerId="p1" />);

    const submitter = game.decodeSubmitter.amber!;
    expect(statusOf(submitter)).toBe("Guess submitted");

    const others = amberSeats(game).filter(
      p => p.id !== submitter && p.id !== game.currentClueGiver.amber,
    );
    expect(others.length).toBeGreaterThan(0);
    for (const player of others) {
      expect(statusOf(player.id)).not.toBe("Guess submitted");
    }
  });

  it("shows an advising teammate as having suggested a pick, not submitted", () => {
    let game = threeVersusThree();
    game = submitClues(game, "amber", ["one", "two", "three"]);
    game = submitClues(game, "blue", ["four", "five", "six"]);

    const adviser = amberSeats(game).find(
      p => p.id !== game.decodeSubmitter.amber && p.id !== game.currentClueGiver.amber,
    )!;
    game = updateSelection(game, "amber", adviser.id, [1, 1, 1]);
    render(<TeamRosters gameState={game} playerId="p1" />);

    expect(statusOf(adviser.id)).toBe("Suggested a pick");
    expect(statusOf(game.decodeSubmitter.amber!)).toBe("Decoding clues");
  });

  it("leaves the clue-giver out of the decode entirely", () => {
    // They wrote the clues for the code, so there is nothing for them to
    // decode and no status to show.
    let game = threeVersusThree();
    game = submitClues(game, "amber", ["one", "two", "three"]);
    game = submitClues(game, "blue", ["four", "five", "six"]);
    render(<TeamRosters gameState={game} playerId="p1" />);

    expect(statusOf(game.currentClueGiver.amber!)).toBeNull();
  });

  it("does not leak the opponent's live picks as their status", () => {
    // currentSelections for the other team is blanked before it reaches a
    // client, so the roster must not claim a blue player suggested anything
    // just because amber's own picks are visible.
    let game = threeVersusThree();
    game = submitClues(game, "amber", ["one", "two", "three"]);
    game = submitClues(game, "blue", ["four", "five", "six"]);
    const blueSeat = game.players.find(
      p => p.team === "blue" && p.id !== game.currentClueGiver.blue,
    )!;
    game = updateSelection(game, "blue", blueSeat.id, [4, 4, 4]);

    // What an amber viewer actually receives: blue's selections blanked.
    const asSeenByAmber: GameState = {
      ...game,
      currentSelections: { ...game.currentSelections, blue: {} },
    };
    render(<TeamRosters gameState={asSeenByAmber} playerId="p1" />);

    expect(statusOf(blueSeat.id)).toBe("Decoding clues");
  });
});

describe("TeamRosters roster rendering", () => {
  it("puts each player under their own team and nowhere else", () => {
    const game = threeVersusThree();
    render(<TeamRosters gameState={game} playerId="p1" />);

    for (const team of ["amber", "blue"] as const) {
      const roster = screen.getByTestId(`team-roster-${team}`);
      for (const player of game.players) {
        const card = screen.getByTestId(`team-player-${player.id}`);
        expect(roster.contains(card)).toBe(player.team === team);
      }
    }
  });

  it("marks the viewer, and only the viewer, as You", () => {
    const game = threeVersusThree();
    render(<TeamRosters gameState={game} playerId="p4" />);

    expect(screen.getAllByText("You")).toHaveLength(1);
    expect(screen.getByTestId("team-player-p4")).toHaveTextContent("You");
  });

  it("labels exactly one clue giver per team", () => {
    const game = threeVersusThree();
    render(<TeamRosters gameState={game} playerId="p1" />);

    expect(screen.getAllByText("Clue giver")).toHaveLength(2);
    for (const team of ["amber", "blue"] as const) {
      const card = screen.getByTestId(`team-player-${game.currentClueGiver[team]}`);
      expect(card).toHaveTextContent("Clue giver");
    }
  });

  it("shows an AI player's name without claiming it is the viewer", () => {
    let game = threeVersusThree();
    game = {
      ...game,
      players: game.players.map(p =>
        p.id === "p6" ? { ...p, isAI: true, name: "Claude (sonnet)", aiProvider: "claude" as const } : p,
      ),
    };
    render(<TeamRosters gameState={game} playerId="p1" />);

    const card = screen.getByTestId("team-player-p6");
    expect(card).toHaveTextContent("Claude (sonnet)");
    expect(card).not.toHaveTextContent("You");
  });
});
