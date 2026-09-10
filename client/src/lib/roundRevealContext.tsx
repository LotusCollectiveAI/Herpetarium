import { createContext, useContext, type ReactNode } from "react";
import { useGame } from "@/lib/gameContext";
import { DIGITS_PER_CODE, useRoundReveal, type RoundRevealState } from "@/lib/useRoundReveal";

// The reveal paces the scored-round screen, but the score at the top of the
// page is a sibling of that screen, not a child of it. It was reading the
// token counts straight off the state the server had just sent, so the
// tokens announced the outcome while the tiles below were still face down.
//
// Both need to be driven by one timeline rather than a copy each: two
// timers would drift, and the top would sometimes still beat the tiles.
// Hence the sequence lives above both of them here, rather than inside the
// results view where it started.

// Amber then blue, the same for every viewer -- see RoundResultsView for
// why this is not ordered by the viewer's own team.
export const REVEAL_ORDER = ["amber", "blue"] as const;

// What a consumer sees when no reveal is running: nothing withheld. This is
// also the value outside a provider, which is what replay and the component
// tests get, and is correct for both -- a recording is not being revealed.
const FINISHED: RoundRevealState = {
  teamIndex: null,
  revealed: DIGITS_PER_CODE,
  done: true,
  skip: () => {},
};

const RoundRevealContext = createContext<RoundRevealState>(FINISHED);

export function useRoundRevealState(): RoundRevealState {
  return useContext(RoundRevealContext);
}

function ActiveReveal({ children }: { children: ReactNode }) {
  const state = useRoundReveal(REVEAL_ORDER.length, true);
  return <RoundRevealContext.Provider value={state}>{children}</RoundRevealContext.Provider>;
}

export function RoundRevealProvider({ children }: { children: ReactNode }) {
  const { gameState, isReplay } = useGame();

  // Only the scored-round screen reveals anything, and replay hands the
  // pacing to the viewer's scrubber instead.
  const active = gameState?.phase === "round_results" && !isReplay;
  if (!active) {
    return <RoundRevealContext.Provider value={FINISHED}>{children}</RoundRevealContext.Provider>;
  }

  // Keyed by round so the sequence restarts from the top each round rather
  // than staying finished after the first one.
  return <ActiveReveal key={gameState.round}>{children}</ActiveReveal>;
}
