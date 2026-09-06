// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { GameContext } from "@/lib/gameContext";
import { ClueHistoryPanel } from "./ClueHistoryPanel";
import { redactGameStateForTeam } from "../../../server/redactGameState";
import {
  addPlayer, createNewGame, startGame, startNewRound, submitClues,
  submitOwnTeamGuess, submitInterception, evaluateRound,
  advanceFromRoundResults, createSeededRng,
} from "../../../server/game";
import type { GameState, Player, WSMessage } from "@shared/schema";

// The panel is fed by whatever the server chose to send, so these tests run
// the fixture through the real redaction rather than hand-writing a payload.
// That is the whole point of the keyword reveal: the UI shows the word when
// it has one, and only the server decides when that is.
function twoVersusTwo(): GameState {
  const seat = (n: number, team: "amber" | "blue"): Player => ({
    id: `p${n}`, name: `Player ${n}`, isAI: false, team, isReady: true,
  });

  let game = createNewGame("p1", "Player 1");
  game = { ...game, players: [{ ...game.players[0], team: "amber" }] };
  for (const [n, team] of [[2, "blue"], [3, "amber"], [4, "blue"]] as const) {
    game = addPlayer(game, seat(n, team));
  }
  game = startGame(game);
  return startNewRound(game, createSeededRng("clue-panel-fixture"));
}

// Plays rounds until the game ends, so the end-of-game view is reached the
// way a real game reaches it.
function playedOut(): GameState {
  let game = twoVersusTwo();
  for (let guard = 0; guard < 20 && game.phase !== "game_over"; guard++) {
    game = submitClues(game, "amber", ["one", "two", "three"]);
    game = submitClues(game, "blue", ["four", "five", "six"]);
    game = submitOwnTeamGuess(game, "amber", game.currentCode.amber!);
    game = submitOwnTeamGuess(game, "blue", [1, 1, 1]);
    game = submitInterception(game, "amber", game.currentCode.blue!);
    game = submitInterception(game, "blue", [1, 1, 1]);
    // evaluateRound always lands on round_results so the final round's
    // outcome is shown; advanceFromRoundResults is what reaches game_over.
    game = advanceFromRoundResults(evaluateRound(game));
  }
  return game;
}

function renderAsAmber(game: GameState) {
  const value = {
    gameState: redactGameStateForTeam(game, "amber"),
    isReplay: false,
    playerId: "p1",
    playerName: "Player 1",
    myTeam: "amber" as const,
    isHost: true,
    isConnected: true,
    aiThinking: null,
    aiThinkingStartTime: null,
    aiFallback: null,
    clueError: null,
    myKeywords: game.teams.amber.keywords,
    myCode: null,
    phaseAnnouncement: null,
    sendMessage: (_m: WSMessage) => {},
    connect: () => {},
    disconnect: () => {},
  };
  return render(
    <GameContext.Provider value={value}>
      <ClueHistoryPanel />
    </GameContext.Provider>,
  );
}

const slotLabels = () =>
  [1, 2, 3, 4].map(n => screen.getByTestId(`opponent-slot-${n}`).textContent);

beforeEach(() => localStorage.clear());

describe("opponent keyword slots", () => {
  it("shows numbered placeholders during the game, never the words", () => {
    const game = twoVersusTwo();
    renderAsAmber(game);

    expect(slotLabels()).toEqual(["Keyword 1", "Keyword 2", "Keyword 3", "Keyword 4"]);
    // The panel never receives them either -- redaction is what enforces
    // that, and this is the check that the UI isn't reaching around it.
    const sent = redactGameStateForTeam(game, "amber");
    expect(sent.teams.blue.keywords).toEqual([]);
  });

  it("still hides them at round results, with a round still to come", () => {
    let game = twoVersusTwo();
    game = submitClues(game, "amber", ["one", "two", "three"]);
    game = submitClues(game, "blue", ["four", "five", "six"]);
    game = submitOwnTeamGuess(game, "amber", [1, 2, 3]);
    game = submitOwnTeamGuess(game, "blue", [1, 2, 3]);
    game = submitInterception(game, "amber", [1, 2, 3]);
    game = submitInterception(game, "blue", [1, 2, 3]);
    game = evaluateRound(game);

    expect(game.phase).toBe("round_results");
    renderAsAmber(game);
    expect(slotLabels()).toEqual(["Keyword 1", "Keyword 2", "Keyword 3", "Keyword 4"]);
  });

  it("shows the opponent's actual words once the game is over", () => {
    const game = playedOut();
    expect(game.phase).toBe("game_over");
    renderAsAmber(game);

    const labels = slotLabels();
    game.teams.blue.keywords.forEach((keyword, i) => {
      expect(labels[i]).toBe(`${i + 1}. ${keyword}`);
    });
  });

  it("always shows the viewer's own keywords, at every phase", () => {
    for (const game of [twoVersusTwo(), playedOut()]) {
      const { unmount } = renderAsAmber(game);
      for (const keyword of game.teams.amber.keywords) {
        expect(screen.getByText(new RegExp(keyword, "i"))).toBeTruthy();
      }
      unmount();
    }
  });
});
