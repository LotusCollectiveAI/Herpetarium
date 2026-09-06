// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { GameContext } from "@/lib/gameContext";
import { RoundResultsView } from "./RoundResultsView";
import { CLASSIC_GAME_RULES } from "@shared/schema";
import type { GameState, RoundHistory, WSMessage } from "@shared/schema";

// Decoding and being intercepted are scored independently, so each team has
// four possible round outcomes. Playing a real game can't be made to produce
// a chosen one of them, so the history rows are written directly -- that is
// the only input the view reads.
function roundHistory(ownTeamCorrect: boolean, intercepted: boolean): RoundHistory {
  return {
    round: 1,
    clueGiverId: "p1",
    clues: ["one", "two", "three"],
    targetCode: [1, 2, 3],
    ownTeamGuess: ownTeamCorrect ? [1, 2, 3] : [4, 4, 4],
    opponentGuess: intercepted ? [1, 2, 3] : [4, 4, 4],
    ownTeamCorrect,
    intercepted,
  };
}

function stateWith(amber: RoundHistory, blue: RoundHistory): GameState {
  return {
    id: "GAME01",
    phase: "round_results",
    round: 1,
    rules: CLASSIC_GAME_RULES,
    players: [
      { id: "p1", name: "Amber One", isAI: false, team: "amber", isReady: true },
      { id: "p2", name: "Blue One", isAI: false, team: "blue", isReady: true },
    ],
    hostId: "p1",
    currentClueGiver: { amber: "p1", blue: "p2" },
    currentCode: { amber: null, blue: null },
    currentClues: { amber: null, blue: null },
    currentGuesses: {
      amber: { ownTeam: null, opponent: null },
      blue: { ownTeam: null, opponent: null },
    },
    decodeSubmitter: { amber: "p1", blue: "p2" },
    interceptSubmitter: { amber: "p1", blue: "p2" },
    currentSelections: { amber: {}, blue: {} },
    teams: {
      amber: { keywords: ["a", "b", "c", "d"], whiteTokens: 0, blackTokens: 0, history: [amber] },
      blue: { keywords: ["e", "f", "g", "h"], whiteTokens: 0, blackTokens: 0, history: [blue] },
    },
    winner: null,
  };
}

function renderOutcome(ownTeamCorrect: boolean, intercepted: boolean) {
  // Blue is given a perfect round throughout, so anything asserted about
  // amber's card can't accidentally be matching blue's.
  const gameState = stateWith(roundHistory(ownTeamCorrect, intercepted), roundHistory(true, false));
  const value = {
    gameState,
    isReplay: false,
    playerId: "p1",
    playerName: "Amber One",
    myTeam: "amber" as const,
    isHost: true,
    isConnected: true,
    aiThinking: null,
    aiThinkingStartTime: null,
    aiFallback: null,
    clueError: null,
    myKeywords: gameState.teams.amber.keywords,
    myCode: null,
    phaseAnnouncement: null,
    sendMessage: (_m: WSMessage) => {},
    connect: () => {},
    disconnect: () => {},
  };
  return render(
    <GameContext.Provider value={value}>
      <RoundResultsView />
    </GameContext.Provider>,
  );
}

const amberSummary = () => screen.getByTestId("text-summary-amber").textContent;

describe("round summary sentence", () => {
  it("reports a clean round on its own", () => {
    renderOutcome(true, false);
    expect(amberSummary()).toBe("Team Amber decoded correctly!");
  });

  it("joins a successful decode to an interception with 'but'", () => {
    renderOutcome(true, true);
    expect(amberSummary()).toBe("Team Amber decoded correctly, but their code was intercepted!");
  });

  it("reports a failed decode on its own", () => {
    renderOutcome(false, false);
    expect(amberSummary()).toBe("Team Amber failed to decode!");
  });

  it("joins a failed decode to an interception with 'and'", () => {
    renderOutcome(false, true);
    expect(amberSummary()).toBe("Team Amber failed to decode, and their code was intercepted!");
  });

  it("names the team the card belongs to", () => {
    renderOutcome(false, true);
    expect(screen.getByTestId("text-summary-blue").textContent).toBe("Team Blue decoded correctly!");
  });
});

describe("round outcome tokens", () => {
  it("awards a white token only for a failed decode", () => {
    renderOutcome(false, false);
    expect(screen.getByTestId("token-white-amber")).toHaveTextContent("+1 White Token");
    expect(screen.queryByTestId("token-black-amber")).toBeNull();
  });

  it("awards a black token only for being intercepted", () => {
    renderOutcome(true, true);
    expect(screen.getByTestId("token-black-amber")).toHaveTextContent("+1 Black Token");
    expect(screen.queryByTestId("token-white-amber")).toBeNull();
  });

  it("awards both when a team fails on both counts", () => {
    renderOutcome(false, true);
    expect(screen.getByTestId("token-white-amber")).toBeTruthy();
    expect(screen.getByTestId("token-black-amber")).toBeTruthy();
  });

  it("awards neither for a perfect round", () => {
    renderOutcome(true, false);
    expect(screen.queryByTestId("token-white-amber")).toBeNull();
    expect(screen.queryByTestId("token-black-amber")).toBeNull();
  });
});

describe("round outcome header icon", () => {
  // The icons carry the verdict at a glance, so a decoded-but-intercepted
  // round showing the celebratory one -- or none at all, as it used to --
  // reads as the opposite of what happened.
  const amberIcon = () => {
    const card = screen.getByTestId("text-summary-amber").closest(".border-2")!;
    const title = card.querySelector("[class*='text-white']")!;
    const svg = title.querySelector("svg");
    return svg?.getAttribute("class")?.includes("lucide-trophy") ? "trophy"
      : svg?.getAttribute("class")?.includes("lucide-triangle-alert") ? "alert"
      : svg ? svg.getAttribute("class") : "none";
  };

  it("shows the trophy only for a perfect round", () => {
    renderOutcome(true, false);
    expect(amberIcon()).toBe("trophy");
  });

  it("shows the alert for every outcome that costs a token", () => {
    for (const [correct, intercepted] of [[true, true], [false, false], [false, true]] as const) {
      const { unmount } = renderOutcome(correct, intercepted);
      expect(amberIcon(), `decoded=${correct} intercepted=${intercepted}`).toBe("alert");
      unmount();
    }
  });
});
