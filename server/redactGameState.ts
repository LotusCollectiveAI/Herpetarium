import type { GameState } from "@shared/schema";

// Pulled out of websocket.ts so it can be exercised on its own: that module
// reaches storage and the express logger, so importing it opens a database
// pool and runs server bootstrap. None of which this needs -- it is a pure
// function of a GameState and who is looking at it.

// ScoreBoard shows both teams' rosters to every player, including a
// submitted/not-submitted indicator driven purely by whether currentGuesses
// is null -- it never reads the actual digits. So a hidden guess still has
// to read as non-null once submitted, or that always-visible progress
// indicator gets permanently stuck on "in progress" for the other team.
// [0, 0, 0] is never a real code/guess (those only ever use digits 1-4), so
// it can't be mistaken for one by anything that did read the value.
export const HIDDEN_GUESS: [number, number, number] = [0, 0, 0];

function maskGuess(value: [number, number, number] | null): [number, number, number] | null {
  return value === null ? null : HIDDEN_GUESS;
}

// The wire format for GameState carries both teams' secrets (the in-progress
// code, the opposing team's keywords, each team's own decode/interception
// guesses and live picks) because the reducer needs all of it in one shared
// object. None of that may reach a socket outside the team it belongs to --
// e.g. a team's decode guess must stay hidden from the opponent, or the
// opponent could just read it off the wire during interception instead of
// working it out from clues. Round history is exempt: past rounds are
// intentionally revealed to both teams once scored (that's how clue
// deduction across rounds works), so only the *current* round's secrets are
// redacted here.
export function redactGameStateForTeam(game: GameState, viewerTeam: "amber" | "blue" | null): GameState {
  // Once the game is over there is no remaining round for the opponent's
  // keywords to give anything away in, and not showing them means players
  // finish a game never learning what they had been guessing at all round.
  // game_over is terminal -- nothing transitions back out of it -- so this
  // cannot re-open mid-game. Note it deliberately does not cover
  // round_results, where the next round is still to come.
  const revealKeywords = game.phase === "game_over";

  return {
    ...game,
    currentCode: { amber: null, blue: null },
    teams: {
      amber: viewerTeam === "amber" || revealKeywords ? game.teams.amber : { ...game.teams.amber, keywords: [] },
      blue: viewerTeam === "blue" || revealKeywords ? game.teams.blue : { ...game.teams.blue, keywords: [] },
    },
    currentGuesses: {
      amber: viewerTeam === "amber" ? game.currentGuesses.amber : {
        ownTeam: maskGuess(game.currentGuesses.amber.ownTeam),
        opponent: maskGuess(game.currentGuesses.amber.opponent),
      },
      blue: viewerTeam === "blue" ? game.currentGuesses.blue : {
        ownTeam: maskGuess(game.currentGuesses.blue.ownTeam),
        opponent: maskGuess(game.currentGuesses.blue.opponent),
      },
    },
    currentSelections: {
      amber: viewerTeam === "amber" ? game.currentSelections.amber : {},
      blue: viewerTeam === "blue" ? game.currentSelections.blue : {},
    },
  };
}
