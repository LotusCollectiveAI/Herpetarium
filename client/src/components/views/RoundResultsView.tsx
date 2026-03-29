import { useEffect, useState } from "react";
import { useGame } from "@/lib/gameContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, X, Target, ArrowRight, Trophy, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export function RoundResultsView() {
  const { gameState, myTeam, isHost, sendMessage } = useGame();
  const [showTokens, setShowTokens] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShowTokens(true), 600);
    return () => clearTimeout(timer);
  }, []);

  if (!gameState || !myTeam) return null;

  const handleNextRound = () => {
    sendMessage({ type: "next_round" });
  };

  const amberHistory = gameState.teams.amber.history;
  const blueHistory = gameState.teams.blue.history;
  const latestAmber = amberHistory[amberHistory.length - 1];
  const latestBlue = blueHistory[blueHistory.length - 1];

  const getTeamSummary = (team: "amber" | "blue", latest: typeof latestAmber | undefined) => {
    if (!latest) return null;
    const teamName = team === "amber" ? "Amber" : "Blue";
    const parts: string[] = [];
    if (latest.ownTeamCorrect) {
      parts.push(`Team ${teamName} decoded correctly!`);
    } else {
      parts.push(`Team ${teamName} failed to decode!`);
    }
    if (latest.intercepted) {
      parts.push(`Their code was intercepted!`);
    }
    return parts.join(" ");
  };

  const renderTeamResult = (
    team: "amber" | "blue",
    latestRound: typeof latestAmber | undefined
  ) => {
    if (!latestRound) return null;

    const isGoodOutcome = latestRound.ownTeamCorrect && !latestRound.intercepted;

    return (
      <Card className={cn(
        "border-2 transition-all duration-500",
        team === "amber" ? "border-amber-500/30" : "border-blue-500/30"
      )}>
        <CardHeader className={cn(
          "pb-2",
          team === "amber" ? "team-amber" : "team-blue"
        )}>
          <CardTitle className="text-white text-sm flex items-center gap-2">
            {isGoodOutcome && <Trophy className="h-4 w-4" />}
            {!latestRound.ownTeamCorrect && <AlertTriangle className="h-4 w-4" />}
            Team {team === "amber" ? "Amber" : "Blue"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          <p className={cn(
            "text-sm font-medium text-center px-2 py-1.5 rounded",
            isGoodOutcome ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-red-500/10 text-red-600 dark:text-red-400"
          )} data-testid={`text-summary-${team}`}>
            {getTeamSummary(team, latestRound)}
          </p>

          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Code:</span>
            {latestRound.targetCode.map((num, i) => (
              <span
                key={i}
                className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold",
                  team === "amber" ? "bg-amber-500 text-amber-950" : "bg-blue-500 text-white"
                )}
              >
                {num}
              </span>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            {latestRound.clues.map((clue, i) => (
              <span
                key={i}
                className="text-xs font-mono uppercase bg-muted px-2 py-1 rounded"
              >
                {clue}
              </span>
            ))}
          </div>

          <div className="space-y-2">
            <div className={cn(
              "flex items-center justify-between p-2 rounded transition-all duration-300",
              latestRound.ownTeamCorrect ? "bg-emerald-500/10" : "bg-red-500/10"
            )}>
              <span className="text-sm">Own Team Guess</span>
              <div className="flex items-center gap-2">
                {latestRound.ownTeamGuess?.map((num, i) => (
                  <span
                    key={i}
                    className="w-5 h-5 rounded flex items-center justify-center text-xs font-bold bg-muted"
                  >
                    {num}
                  </span>
                ))}
                {latestRound.ownTeamCorrect ? (
                  <Check className="h-4 w-4 text-emerald-500" />
                ) : (
                  <X className="h-4 w-4 text-red-500" />
                )}
              </div>
            </div>

            <div className={cn(
              "flex items-center justify-between p-2 rounded transition-all duration-300",
              latestRound.intercepted ? "bg-red-500/10" : "bg-muted"
            )}>
              <span className="text-sm">Opponent Interception</span>
              <div className="flex items-center gap-2">
                {latestRound.opponentGuess?.map((num, i) => (
                  <span
                    key={i}
                    className="w-5 h-5 rounded flex items-center justify-center text-xs font-bold bg-muted"
                  >
                    {num}
                  </span>
                ))}
                {latestRound.intercepted ? (
                  <Target className="h-4 w-4 text-red-500" />
                ) : (
                  <X className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            </div>
          </div>

          <div className={cn(
            "flex items-center gap-4 pt-2 border-t transition-all duration-500",
            showTokens ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
          )}>
            {!latestRound.ownTeamCorrect && (
              <div className="flex items-center gap-1 text-xs" data-testid={`token-white-${team}`}>
                <div className={cn(
                  "w-5 h-5 rounded-full bg-white border-2 border-gray-300 transition-transform duration-500",
                  showTokens ? "scale-100" : "scale-0"
                )} />
                <span className="text-red-500 font-medium">+1 White Token</span>
              </div>
            )}
            {latestRound.intercepted && (
              <div className="flex items-center gap-1 text-xs" data-testid={`token-black-${team}`}>
                <div className={cn(
                  "w-5 h-5 rounded-full bg-gray-900 border-2 border-gray-700 transition-transform duration-500 delay-200",
                  showTokens ? "scale-100" : "scale-0"
                )} />
                <span className="text-red-500 font-medium">+1 Black Token</span>
              </div>
            )}
            {latestRound.ownTeamCorrect && !latestRound.intercepted && (
              <span className={cn(
                "text-sm text-emerald-500 font-medium transition-all duration-500",
                showTokens ? "opacity-100" : "opacity-0"
              )}>
                Perfect round!
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="flex-1 flex flex-col p-4 gap-4 overflow-auto">
      <div className="text-center">
        <h2 className="text-xl font-bold" data-testid="text-round-results-title">Round {gameState.round} Results</h2>
      </div>

      <div className="space-y-4">
        {renderTeamResult("amber", latestAmber)}
        {renderTeamResult("blue", latestBlue)}
      </div>

      {isHost && (
        <Button
          size="lg"
          onClick={handleNextRound}
          className="w-full"
          data-testid="button-next-round"
        >
          <ArrowRight className="h-5 w-5 mr-2" />
          Next Round
        </Button>
      )}

      {!isHost && (
        <div className="text-center text-sm text-muted-foreground">
          Waiting for host to start the next round...
        </div>
      )}
    </div>
  );
}
