import type { GameState, RoundHistory } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, X, Target, Trophy, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

// A quick, low-noise overview of an entire match: every round's clues,
// guesses, and interceptions, and how each one moved the score -- the
// gameplay itself, without the granular event/AI-call detail the
// step-through replay view surfaces. All of it comes from data the replay
// engine already reconstructs (teams[].history), so this just renders it.

interface MatchSummaryViewProps {
  gameState: GameState;
}

function CodeDots({ code, team }: { code: readonly [number, number, number]; team: "amber" | "blue" }) {
  return (
    <div className="flex items-center gap-1">
      {code.map((num, i) => (
        <span
          key={i}
          className={cn(
            "w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold",
            team === "amber" ? "bg-amber-500 text-amber-950" : "bg-blue-500 text-white"
          )}
        >
          {num}
        </span>
      ))}
    </div>
  );
}

function GuessDots({ guess }: { guess: readonly [number, number, number] | null }) {
  if (!guess) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <div className="flex items-center gap-1">
      {guess.map((num, i) => (
        <span key={i} className="w-5 h-5 rounded flex items-center justify-center text-[11px] font-bold bg-muted">
          {num}
        </span>
      ))}
    </div>
  );
}

function TeamRoundColumn({
  team,
  entry,
  clueGiverName,
  cumulative,
}: {
  team: "amber" | "blue";
  entry: RoundHistory;
  clueGiverName: string;
  cumulative: { white: number; black: number };
}) {
  const isGoodOutcome = entry.ownTeamCorrect && !entry.intercepted;
  const teamLabel = team === "amber" ? "Amber" : "Blue";
  const teamTextClass = team === "amber" ? "text-amber-600 dark:text-amber-400" : "text-blue-600 dark:text-blue-400";

  return (
    <div className="flex-1 min-w-0 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className={cn("text-xs font-semibold flex items-center gap-1", teamTextClass)}>
          <MessageSquare className="h-3 w-3" />
          {teamLabel} · {clueGiverName}
        </span>
        <CodeDots code={entry.targetCode} team={team} />
      </div>

      <div className="flex flex-wrap gap-1">
        {entry.clues.map((clue, i) => (
          <span key={i} className="text-[10px] font-mono uppercase bg-muted px-1.5 py-0.5 rounded">
            {clue}
          </span>
        ))}
      </div>

      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Decoded</span>
        <div className="flex items-center gap-1.5">
          <GuessDots guess={entry.ownTeamGuess} />
          {entry.ownTeamCorrect ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <X className="h-3.5 w-3.5 text-red-500" />}
        </div>
      </div>

      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Opponent intercept</span>
        <div className="flex items-center gap-1.5">
          <GuessDots guess={entry.opponentGuess} />
          {entry.intercepted ? <Target className="h-3.5 w-3.5 text-red-500" /> : <X className="h-3.5 w-3.5 text-muted-foreground" />}
        </div>
      </div>

      <div className="flex items-center justify-between pt-1 border-t text-xs">
        <span className={isGoodOutcome ? "text-emerald-500 font-medium" : "text-red-500 font-medium"}>
          {isGoodOutcome
            ? "Perfect round"
            : [!entry.ownTeamCorrect && "+1 White", entry.intercepted && "+1 Black"].filter(Boolean).join(", ")}
        </span>
        <span className="text-muted-foreground">
          {cumulative.white}W / {cumulative.black}B total
        </span>
      </div>
    </div>
  );
}

export function MatchSummaryView({ gameState }: MatchSummaryViewProps) {
  const amberHistory = gameState.teams.amber.history;
  const blueHistory = gameState.teams.blue.history;
  const totalRounds = Math.max(amberHistory.length, blueHistory.length);

  const findPlayerName = (id: string) => gameState.players.find(p => p.id === id)?.name ?? "Unknown";

  const rounds: Array<{
    round: number;
    amber?: RoundHistory;
    blue?: RoundHistory;
    cumulative: { amber: { white: number; black: number }; blue: { white: number; black: number } };
  }> = [];

  const running = { amber: { white: 0, black: 0 }, blue: { white: 0, black: 0 } };
  for (let i = 0; i < totalRounds; i++) {
    const amber = amberHistory[i];
    const blue = blueHistory[i];
    if (amber) {
      if (!amber.ownTeamCorrect) running.amber.white += 1;
      if (amber.intercepted) running.amber.black += 1;
    }
    if (blue) {
      if (!blue.ownTeamCorrect) running.blue.white += 1;
      if (blue.intercepted) running.blue.black += 1;
    }
    rounds.push({
      round: i + 1,
      amber,
      blue,
      cumulative: { amber: { ...running.amber }, blue: { ...running.blue } },
    });
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-3">
      {rounds.length === 0 && (
        <p className="text-center text-muted-foreground text-sm py-8">No rounds have completed yet.</p>
      )}

      {rounds.map(({ round, amber, blue, cumulative }) => (
        <Card key={round}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Round {round}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row gap-4">
            {amber && <TeamRoundColumn team="amber" entry={amber} clueGiverName={findPlayerName(amber.clueGiverId)} cumulative={cumulative.amber} />}
            {blue && <TeamRoundColumn team="blue" entry={blue} clueGiverName={findPlayerName(blue.clueGiverId)} cumulative={cumulative.blue} />}
          </CardContent>
        </Card>
      ))}

      {gameState.phase === "game_over" && (
        <Card className={gameState.winner === "amber" ? "border-amber-500" : gameState.winner === "blue" ? "border-blue-500" : ""}>
          <CardContent className="py-4 flex items-center justify-center gap-2 text-center">
            {gameState.winner ? (
              <>
                <Trophy className={cn("h-5 w-5", gameState.winner === "amber" ? "text-amber-500" : "text-blue-500")} />
                <span className="font-semibold">
                  Team {gameState.winner === "amber" ? "Amber" : "Blue"} wins — final score {gameState.teams.amber.whiteTokens}W/{gameState.teams.amber.blackTokens}B vs {gameState.teams.blue.whiteTokens}W/{gameState.teams.blue.blackTokens}B
                </span>
              </>
            ) : (
              <span className="font-semibold text-muted-foreground">Game ended in a tie</span>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
