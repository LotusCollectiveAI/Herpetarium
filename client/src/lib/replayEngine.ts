import type { GameState, MatchEvent, MatchEventPayload } from "@shared/schema";
import { DEFAULT_GAME_RULES } from "@shared/schema";

// The spectator viewpoint replay renders through. Never matches a real
// player id, so the reused phase-view components always fall into their
// read-only "waiting" / "submitted" branches instead of offering an
// interactive input meant for an active participant.
export const REPLAY_SPECTATOR_ID = "__replay_spectator__";

type Team = "amber" | "blue";

interface RoundSubmitters {
  decode: string | null;
  intercept: string | null;
}

export type SubmitterMap = Record<number, Record<Team, RoundSubmitters>>;

// Designated submitters aren't recorded on the round_started event itself,
// but every guess_submitted / interception_submitted event carries the id
// of whoever actually submitted. Scanning the full event list up front lets
// each round_started step immediately show the correct submitter name,
// instead of only learning it once that round's guess has already landed.
export function buildSubmitterMap(events: MatchEvent[]): SubmitterMap {
  const map: SubmitterMap = {};
  const ensure = (round: number) => {
    if (!map[round]) {
      map[round] = {
        amber: { decode: null, intercept: null },
        blue: { decode: null, intercept: null },
      };
    }
    return map[round];
  };

  for (const event of events) {
    if (event.round == null) continue;
    const payload = event.payload as MatchEventPayload;
    if (payload.eventType === "guess_submitted") {
      ensure(event.round)[payload.team].decode = payload.playerId;
    } else if (payload.eventType === "interception_submitted") {
      ensure(event.round)[payload.team].intercept = payload.playerId;
    }
  }

  return map;
}

function emptyGameState(gameId: string): GameState {
  return {
    id: gameId,
    phase: "team_setup",
    round: 0,
    rules: DEFAULT_GAME_RULES,
    players: [],
    hostId: "",
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

function applyEvent(state: GameState, payload: MatchEventPayload, submitters: SubmitterMap): GameState {
  switch (payload.eventType) {
    case "game_created":
      return {
        ...state,
        phase: "team_setup",
        rules: payload.rules,
        players: payload.players,
        hostId: payload.players[0]?.id ?? "",
      };

    case "round_started": {
      const roundSubmitters = submitters[payload.round] ?? {
        amber: { decode: null, intercept: null },
        blue: { decode: null, intercept: null },
      };
      return {
        ...state,
        phase: "giving_clues",
        round: payload.round,
        currentClueGiver: payload.clueGiver,
        currentCode: payload.code,
        currentClues: { amber: null, blue: null },
        currentGuesses: {
          amber: { ownTeam: null, opponent: null },
          blue: { ownTeam: null, opponent: null },
        },
        decodeSubmitter: { amber: roundSubmitters.amber.decode, blue: roundSubmitters.blue.decode },
        interceptSubmitter: { amber: roundSubmitters.amber.intercept, blue: roundSubmitters.blue.intercept },
        currentSelections: { amber: {}, blue: {} },
        teams: {
          amber: { ...state.teams.amber, keywords: payload.keywords.amber },
          blue: { ...state.teams.blue, keywords: payload.keywords.blue },
        },
      };
    }

    case "clue_submitted": {
      const currentClues = { ...state.currentClues, [payload.team]: payload.clues };
      const bothSubmitted = currentClues.amber !== null && currentClues.blue !== null;
      return {
        ...state,
        currentClues,
        phase: bothSubmitted ? "own_team_guessing" : state.phase,
      };
    }

    case "selection_updated":
      return {
        ...state,
        currentSelections: {
          ...state.currentSelections,
          [payload.team]: {
            ...state.currentSelections[payload.team],
            [payload.playerId]: payload.selection,
          },
        },
      };

    case "guess_submitted": {
      const currentGuesses = {
        ...state.currentGuesses,
        [payload.team]: { ...state.currentGuesses[payload.team], ownTeam: payload.guess },
      };
      const bothGuessed = currentGuesses.amber.ownTeam !== null && currentGuesses.blue.ownTeam !== null;
      return {
        ...state,
        currentGuesses,
        phase: bothGuessed ? "opponent_intercepting" : state.phase,
        currentSelections: bothGuessed ? { amber: {}, blue: {} } : state.currentSelections,
      };
    }

    case "interception_submitted":
      return {
        ...state,
        currentGuesses: {
          ...state.currentGuesses,
          [payload.team]: { ...state.currentGuesses[payload.team], opponent: payload.guess },
        },
      };

    case "round_completed": {
      const buildHistory = (team: Team) => {
        const opponent: Team = team === "amber" ? "blue" : "amber";
        return {
          round: payload.round,
          clueGiverId: state.currentClueGiver[team]!,
          clues: state.currentClues[team]!,
          targetCode: state.currentCode[team]!,
          ownTeamGuess: state.currentGuesses[team].ownTeam,
          opponentGuess: state.currentGuesses[opponent].opponent,
          ownTeamCorrect: payload.teams[team].ownTeamCorrect,
          intercepted: payload.teams[team].intercepted,
        };
      };
      return {
        ...state,
        phase: "round_results",
        teams: {
          amber: {
            ...state.teams.amber,
            whiteTokens: state.teams.amber.whiteTokens + payload.teams.amber.whiteTokensAwarded,
            blackTokens: state.teams.amber.blackTokens + payload.teams.amber.blackTokensAwarded,
            history: [...state.teams.amber.history, buildHistory("amber")],
          },
          blue: {
            ...state.teams.blue,
            whiteTokens: state.teams.blue.whiteTokens + payload.teams.blue.whiteTokensAwarded,
            blackTokens: state.teams.blue.blackTokens + payload.teams.blue.blackTokensAwarded,
            history: [...state.teams.blue.history, buildHistory("blue")],
          },
        },
      };
    }

    case "game_completed":
      return { ...state, phase: "game_over", winner: payload.winner };

    case "ai_call":
      return state;

    default:
      return state;
  }
}

// Rebuilds the GameState as of a given step by folding every event up to and
// including it, from scratch. Simpler and less error-prone than maintaining
// incremental state across scrubbing back and forth, and cheap enough at
// the event volumes a single match produces.
export function buildGameStateAtStep(
  gameId: string,
  events: MatchEvent[],
  stepIndex: number,
  submitters: SubmitterMap,
): GameState {
  let state = emptyGameState(gameId);
  const end = Math.min(stepIndex, events.length - 1);
  for (let i = 0; i <= end; i++) {
    state = applyEvent(state, events[i].payload as MatchEventPayload, submitters);
  }
  return state;
}
