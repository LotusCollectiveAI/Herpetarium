// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { GameContext } from "@/lib/gameContext";
import { RoundResultsView } from "./RoundResultsView";
import { CLASSIC_GAME_RULES } from "@shared/schema";
import { REVEAL_TIMINGS, TILE_SETTLE_MS } from "@/lib/useRoundReveal";
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

function contextFor(gameState: GameState, isReplay = false) {
  return {
    gameState,
    isReplay,
    playerId: "p1",
    playerName: "Amber One",
    myTeam: "amber" as "amber" | "blue",
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
}

function renderOutcome(ownTeamCorrect: boolean, intercepted: boolean, isReplay = false) {
  // Blue is given a perfect round throughout, so anything asserted about
  // amber's card can't accidentally be matching blue's.
  const gameState = stateWith(roundHistory(ownTeamCorrect, intercepted), roundHistory(true, false));
  return render(
    <GameContext.Provider value={contextFor(gameState, isReplay)}>
      <RoundResultsView />
    </GameContext.Provider>,
  );
}

const amberSummary = () => screen.getByTestId("text-summary-amber").textContent;

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

// Each step of the reveal schedules the next one from an effect, so a timer
// only exists once React has re-rendered from the previous step. Running
// them one act at a time is what lets that chain advance; a single
// runAllTimers only ever gets through the first step.
function tick() {
  act(() => { vi.runOnlyPendingTimers(); });
}

// The scored round now sits behind the per-team code reveal, so these tests
// play that out first rather than disabling it -- what a live player sees
// after the animation finishes is the thing being asserted.
function playRevealToEnd() {
  for (let i = 0; i < 20; i++) {
    if (screen.queryByTestId("text-round-results-title")) {
      tick(); // the token animation, which unblocks one step later
      return;
    }
    tick();
  }
  throw new Error("reveal never reached the results screen");
}

function results(ownTeamCorrect: boolean, intercepted: boolean) {
  const rendered = renderOutcome(ownTeamCorrect, intercepted);
  playRevealToEnd();
  return rendered;
}

const tilesFaceUp = () => screen.queryAllByTestId("reveal-tile-up").length;
const tilesFaceDown = () => screen.queryAllByTestId("reveal-tile-down").length;
const revealTitle = () => screen.queryByTestId("text-reveal-title")?.textContent ?? null;
const advance = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

describe("code reveal sequence", () => {
  it("holds every digit face down before the first flip", () => {
    renderOutcome(true, false);
    expect(tilesFaceDown()).toBe(3);
    expect(tilesFaceUp()).toBe(0);
    expect(screen.queryByTestId("text-round-results-title")).toBeNull();
  });

  it("turns the digits over one at a time", () => {
    renderOutcome(true, false);
    for (const expected of [1, 2, 3]) {
      tick();
      expect(tilesFaceUp()).toBe(expected);
      expect(tilesFaceDown()).toBe(3 - expected);
    }
  });

  it("waits before the first digit and between each one", () => {
    renderOutcome(true, false);

    advance(REVEAL_TIMINGS.beforeFirstDigit - 1);
    expect(tilesFaceUp(), "before the opening pause elapsed").toBe(0);
    advance(1);
    expect(tilesFaceUp()).toBe(1);

    advance(REVEAL_TIMINGS.betweenDigits - 1);
    expect(tilesFaceUp(), "before the gap between digits elapsed").toBe(1);
    advance(1);
    expect(tilesFaceUp()).toBe(2);
  });

  it("starts with the viewer's own team, then moves to the opponent", () => {
    renderOutcome(true, false);
    expect(revealTitle()).toBe("Round 1 — Team Amber's code");

    // Amber's three digits, then the hold before the other team.
    for (let i = 0; i < 3; i++) tick();
    expect(revealTitle()).toBe("Round 1 — Team Amber's code");

    tick();
    expect(revealTitle()).toBe("Round 1 — Team Blue's code");
    expect(tilesFaceUp()).toBe(0);
  });

  it("reveals the viewer's own team first when they are on blue", () => {
    const gameState = stateWith(roundHistory(true, false), roundHistory(true, false));
    render(
      <GameContext.Provider value={{ ...contextFor(gameState), myTeam: "blue" as const }}>
        <RoundResultsView />
      </GameContext.Provider>,
    );
    expect(revealTitle()).toBe("Round 1 — Team Blue's code");
  });

  it("marks the guesses only after the tile has finished turning", () => {
    // The tiles are the reveal and the guess rows are the reaction to it.
    // Marking a guess the instant a flip starts announced the answer while
    // the tile was still mid-turn, which gave it away early.
    renderOutcome(true, false);
    for (let i = 0; i < 3; i++) tick();
    expect(tilesFaceUp(), "all three tiles turning").toBe(3);
    expect(screen.queryByTestId("reveal-verdict-amber"), "verdict before the last tile lands").toBeNull();

    advance(TILE_SETTLE_MS);
    expect(screen.getByTestId("reveal-verdict-amber")).toBeTruthy();
  });

  it("shows the scored round only once both teams have been revealed", () => {
    renderOutcome(true, false);
    expect(screen.queryByTestId("text-round-results-title")).toBeNull();
    playRevealToEnd();
    expect(screen.getByTestId("text-round-results-title")).toHaveTextContent("Round 1 Results");
    expect(screen.queryByTestId("text-reveal-title")).toBeNull();
  });

  it("jumps straight to the results when skipped", () => {
    renderOutcome(true, false);
    act(() => { screen.getByTestId("button-skip-reveal").click(); });
    expect(screen.getByTestId("text-round-results-title")).toBeTruthy();
  });

  it("is not played in a replay, where the viewer sets the pace", () => {
    renderOutcome(true, false, true);
    expect(screen.getByTestId("text-round-results-title")).toBeTruthy();
    expect(screen.queryByTestId("text-reveal-title")).toBeNull();
  });
});

describe("round summary sentence", () => {
  it("reports a clean round on its own", () => {
    results(true, false);
    expect(amberSummary()).toBe("Team Amber decoded correctly!");
  });

  it("joins a successful decode to an interception with 'but'", () => {
    results(true, true);
    expect(amberSummary()).toBe("Team Amber decoded correctly, but their code was intercepted!");
  });

  it("reports a failed decode on its own", () => {
    results(false, false);
    expect(amberSummary()).toBe("Team Amber failed to decode!");
  });

  it("joins a failed decode to an interception with 'and'", () => {
    results(false, true);
    expect(amberSummary()).toBe("Team Amber failed to decode, and their code was intercepted!");
  });

  it("names the team the card belongs to", () => {
    results(false, true);
    expect(screen.getByTestId("text-summary-blue").textContent).toBe("Team Blue decoded correctly!");
  });
});

describe("round outcome tokens", () => {
  it("awards a white token only for a failed decode", () => {
    results(false, false);
    expect(screen.getByTestId("token-white-amber")).toHaveTextContent("+1 White Token");
    expect(screen.queryByTestId("token-black-amber")).toBeNull();
  });

  it("awards a black token only for being intercepted", () => {
    results(true, true);
    expect(screen.getByTestId("token-black-amber")).toHaveTextContent("+1 Black Token");
    expect(screen.queryByTestId("token-white-amber")).toBeNull();
  });

  it("awards both when a team fails on both counts", () => {
    results(false, true);
    expect(screen.getByTestId("token-white-amber")).toBeTruthy();
    expect(screen.getByTestId("token-black-amber")).toBeTruthy();
  });

  it("awards neither for a perfect round", () => {
    results(true, false);
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
    results(true, false);
    expect(amberIcon()).toBe("trophy");
  });

  it("shows the alert for every outcome that costs a token", () => {
    for (const [correct, intercepted] of [[true, true], [false, false], [false, true]] as const) {
      const { unmount } = renderOutcome(correct, intercepted);
      playRevealToEnd();
      expect(amberIcon(), `decoded=${correct} intercepted=${intercepted}`).toBe("alert");
      unmount();
    }
  });
});
