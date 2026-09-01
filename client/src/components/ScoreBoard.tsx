import { cn } from "@/lib/utils";
import { Bot, Check, Radio } from "lucide-react";
import type { GameState, Player } from "@shared/schema";

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
function Token({ type, count, reverseFill = false }: { type: "white" | "black"; count: number; reverseFill?: boolean }) {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: 2 }).map((_, i) => {
        const filled = reverseFill ? i >= 2 - count : i < count;
        return (
          <div
            key={i}
            className={cn(
              "w-5 h-5 rounded-full transition-all",
              type === "white"
                ? "bg-white border-2 border-gray-300 dark:border-gray-500"
                : "bg-gray-900 border-2 border-gray-700 dark:bg-gray-800",
              filled ? "opacity-100 shadow-md" : "opacity-20"
            )}
            data-testid={`token-${type}-${i}`}
          />
        );
      })}
    </div>
  );
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
      if (isClueGiver) return null;
      return gameState.currentGuesses[team].ownTeam
        ? { label: "Guess submitted", active: false, complete: true }
        : { label: "Decoding clues", active: true };
    case "opponent_deliberation":
      return { label: "Planning intercept", active: true };
    case "opponent_intercepting":
      return gameState.currentGuesses[team].opponent
        ? { label: "Intercept submitted", active: false, complete: true }
        : { label: "Intercepting", active: true };
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

export function ScoreBoard({ gameState, playerId }: ScoreBoardProps) {
  const { amber: amberState, blue: blueState } = gameState.teams;

  return (
    <div className="flex flex-col gap-2 p-3 rounded-lg bg-card border">
      <div className="text-center text-sm text-muted-foreground font-medium">
        Round {gameState.round}
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-amber-500" />
          <span className="text-sm font-semibold">Amber</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">Blue</span>
          <div className="w-3 h-3 rounded-full bg-blue-500" />
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-2 gap-y-1">
        <div className="flex justify-end">
          <Token type="white" count={amberState.whiteTokens} reverseFill />
        </div>
        <span className="text-xs sm:text-sm text-muted-foreground text-center leading-tight">
          Miscommunications
        </span>
        <div className="flex justify-start">
          <Token type="white" count={blueState.whiteTokens} />
        </div>

        <div className="flex justify-end">
          <Token type="black" count={amberState.blackTokens} reverseFill />
        </div>
        <span className="text-xs sm:text-sm text-muted-foreground text-center leading-tight">
          Interceptions
        </span>
        <div className="flex justify-start">
          <Token type="black" count={blueState.blackTokens} />
        </div>
      </div>

      <div className="flex items-stretch justify-between gap-2 sm:gap-4">
        <div className="flex min-w-0 flex-1 flex-col items-center gap-2">
          <TeamRoster gameState={gameState} team="amber" playerId={playerId} />
        </div>

        <div className="w-px bg-border" />

        <div className="flex min-w-0 flex-1 flex-col items-center gap-2">
          <TeamRoster gameState={gameState} team="blue" playerId={playerId} />
        </div>
      </div>
    </div>
  );
}
