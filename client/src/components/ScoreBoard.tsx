import { cn } from "@/lib/utils";
import { Bot, Check, Radio } from "lucide-react";
import type { GameState, Player, RoundHistory } from "@shared/schema";
import { useRoundRevealState } from "@/lib/roundRevealContext";

interface ScoreBoardProps {
  gameState: GameState;
  playerId: string | null;
}

type Team = "amber" | "blue";

interface PlayerActivity {
  label: string;
  active: boolean;
  complete?: boolean;
}

// Tokens normally fill left-to-right (index 0 first). Pass reverseFill for
// a team whose tokens are right-aligned toward the center, so the bubble
// nearest the middle (the highest index, drawn last) lights up first.
export function Token({ type, count, reverseFill = false, testId }: { type: "white" | "black"; count: number; reverseFill?: boolean; testId?: string }) {
  return (
    <div className="flex items-center gap-1" data-testid={testId} data-count={count}>
      {Array.from({ length: 2 }).map((_, i) => {
        const filled = reverseFill ? i >= 2 - count : i < count;
        return (
          <div
            key={i}
            className={cn(
              "w-5 h-5 rounded-full border-2 transition-all",
              filled
                ? type === "white"
                  ? "bg-white border-white shadow-[0_0_6px_rgba(255,255,255,0.6)]"
                  : "bg-gray-950 border-gray-400 shadow-[0_0_6px_rgba(0,0,0,0.8)] dark:bg-black"
                : "bg-transparent border-dashed border-muted-foreground/40"
            )}
            data-testid={`token-${type}-${i}`}
          />
        );
      })}
    </div>
  );
}

// Only one teammate actually submits a team's guess each round; the others
// just advise by clicking numbers. Reporting the team's single submitted
// value against every player on the roster claimed all of them had
// submitted, which is wrong as soon as a team has more than two players.
function describeGuessActivity(
  gameState: GameState,
  player: Player,
  team: Team,
  submitted: boolean,
  isSubmitter: boolean,
  activeLabel: string,
  doneLabel: string,
): PlayerActivity | null {
  if (isSubmitter) {
    return submitted
      ? { label: doneLabel, active: false, complete: true }
      : { label: activeLabel, active: true };
  }
  // A non-submitting teammate's own live pick is visible for your own team.
  // The opponent's picks are withheld, so there the honest thing to show is
  // just that their turn is still running.
  if (gameState.currentSelections[team][player.id]) {
    return { label: "Suggested a pick", active: false, complete: true };
  }
  return submitted ? null : { label: activeLabel, active: true };
}

function getPlayerActivity(gameState: GameState, player: Player, team: Team): PlayerActivity | null {
  const isClueGiver = gameState.currentClueGiver[team] === player.id;

  switch (gameState.phase) {
    case "giving_clues":
      if (!isClueGiver) return null;
      return gameState.currentClues[team]
        ? { label: "Clues submitted", active: false, complete: true }
        : { label: "Creating clues", active: true };
    case "own_team_deliberation":
      return !isClueGiver ? { label: "Discussing clues", active: true } : null;
    case "own_team_guessing":
      // The clue-giver already knows the code and never decodes it.
      if (isClueGiver) return null;
      return describeGuessActivity(
        gameState,
        player,
        team,
        gameState.currentGuesses[team].ownTeam !== null,
        gameState.decodeSubmitter[team] === player.id,
        "Decoding clues",
        "Guess submitted",
      );
    case "opponent_deliberation":
      return { label: "Planning intercept", active: true };
    case "opponent_intercepting":
      // The clue-giver is included here -- they know as little about the
      // opponent's code as anyone else on the team.
      return describeGuessActivity(
        gameState,
        player,
        team,
        gameState.currentGuesses[team].opponent !== null,
        gameState.interceptSubmitter[team] === player.id,
        "Intercepting",
        "Intercept submitted",
      );
    default:
      return null;
  }
}

function TeamRoster({ gameState, team, playerId }: { gameState: GameState; team: Team; playerId: string | null }) {
  const players = gameState.players.filter(player => player.team === team);
  const teamStyles = team === "amber"
    ? {
        active: "border-amber-500/60 bg-amber-500/10",
        status: "text-amber-700 dark:text-amber-300",
      }
    : {
        active: "border-blue-500/60 bg-blue-500/10",
        status: "text-blue-700 dark:text-blue-300",
      };

  return (
    <div className="w-full space-y-1.5" data-testid={`team-roster-${team}`}>
      {players.map(player => {
        const activity = getPlayerActivity(gameState, player, team);
        const isClueGiver = gameState.currentClueGiver[team] === player.id;

        return (
          <div
            key={player.id}
            className={cn(
              "min-w-0 rounded-md border px-2 py-1.5 text-left transition-colors",
              activity?.active ? teamStyles.active : "border-transparent bg-muted/40",
            )}
            data-testid={`team-player-${player.id}`}
          >
            <div className="flex min-w-0 items-center gap-1.5">
              {player.isAI && <Bot className="h-3 w-3 shrink-0 text-muted-foreground" />}
              <span className="min-w-0 flex-1 truncate text-xs font-medium" title={player.name}>
                {player.name}
              </span>
              {player.id === playerId && (
                <span className="shrink-0 text-[10px] font-medium text-primary">You</span>
              )}
              {isClueGiver && (
                <span className="shrink-0 text-[10px] text-muted-foreground">Clue giver</span>
              )}
            </div>

            {activity && (
              <div
                className={cn("mt-1 flex items-center gap-1 text-[10px] font-medium", teamStyles.status)}
                data-testid={`player-status-${player.id}`}
              >
                {activity.complete ? (
                  <Check className="h-3 w-3 shrink-0" />
                ) : (
                  <Radio className={cn("h-3 w-3 shrink-0", activity.active && "animate-pulse")} />
                )}
                <span className="truncate">{activity.label}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// The server adds a round's tokens the moment it scores the round, which
// is before anyone has watched the reveal. Read straight, the score at the
// top therefore announced the outcome over the top of the tiles. While the
// reveal is still running these subtract the round being revealed, so the
// board shows what it showed going in and catches up when the tiles land.
//
// Derived rather than remembered: the previous total is whatever the
// current one is minus what this round added, and evaluateRound adds one
// white for a failed decode and one black for being intercepted.
function tokensBeforeRound(
  team: GameState["teams"]["amber"],
  round: number,
  withhold: boolean,
): { white: number; black: number } {
  const latest: RoundHistory | undefined = team.history[team.history.length - 1];
  // Guard on the round number so a stale entry can never be subtracted --
  // history is only this round's once the round has actually been scored.
  if (!withhold || !latest || latest.round !== round) {
    return { white: team.whiteTokens, black: team.blackTokens };
  }
  return {
    white: team.whiteTokens - (latest.ownTeamCorrect ? 0 : 1),
    black: team.blackTokens - (latest.intercepted ? 1 : 0),
  };
}

export function ScoreBoard({ gameState, playerId }: ScoreBoardProps) {
  const { amber: amberState, blue: blueState } = gameState.teams;

  const reveal = useRoundRevealState();
  const withhold = !reveal.done && gameState.phase === "round_results";
  const amberTokens = tokensBeforeRound(amberState, gameState.round, withhold);
  const blueTokens = tokensBeforeRound(blueState, gameState.round, withhold);

  return (
    <div className="flex flex-col gap-2 p-3 rounded-lg bg-card border">
      {/* Same column template as the token rows below, so the team names,
          the round and the tokens all line up. Who is currently acting is
          left to the rosters, which say it per player. */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <div className="h-3 w-3 shrink-0 rounded-full bg-amber-500" />
          <span className="truncate text-sm font-semibold">Amber</span>
        </div>

        <span className="shrink-0 text-sm font-medium text-muted-foreground">
          Round {gameState.round}
        </span>

        <div className="flex min-w-0 items-center justify-end gap-1.5">
          <span className="truncate text-sm font-semibold">Blue</span>
          <div className="h-3 w-3 shrink-0 rounded-full bg-blue-500" />
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-2 gap-y-1">
        <div className="flex justify-end">
          <Token type="white" count={amberTokens.white} reverseFill testId="score-white-amber" />
        </div>
        <span className="text-xs sm:text-sm text-muted-foreground text-center leading-tight">
          Miscommunications
        </span>
        <div className="flex justify-start">
          <Token type="white" count={blueTokens.white} testId="score-white-blue" />
        </div>

        <div className="flex justify-end">
          <Token type="black" count={amberTokens.black} reverseFill testId="score-black-amber" />
        </div>
        <span className="text-xs sm:text-sm text-muted-foreground text-center leading-tight">
          Interceptions
        </span>
        <div className="flex justify-start">
          <Token type="black" count={blueTokens.black} testId="score-black-blue" />
        </div>
      </div>
    </div>
  );
}

// Kept out of ScoreBoard, and so out of the sticky header, because the
// rosters are the bulk of its height and the least useful thing to hold on
// screen the whole game. They render in the normal document flow instead
// and scroll away, leaving the round and token board pinned.
export function TeamRosters({ gameState, playerId }: ScoreBoardProps) {
  return (
    <div
      className="flex items-stretch justify-between gap-2 rounded-lg border bg-card p-3 sm:gap-4"
      data-testid="team-rosters"
    >
      <div className="flex min-w-0 flex-1 flex-col items-center gap-2">
        <TeamRoster gameState={gameState} team="amber" playerId={playerId} />
      </div>

      <div className="w-px bg-border" />

      <div className="flex min-w-0 flex-1 flex-col items-center gap-2">
        <TeamRoster gameState={gameState} team="blue" playerId={playerId} />
      </div>
    </div>
  );
}
