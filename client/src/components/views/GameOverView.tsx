import { useGame } from "@/lib/gameContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trophy, Home, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";

export function GameOverView() {
  const { gameState, myTeam, disconnect } = useGame();
  const [, setLocation] = useLocation();

  if (!gameState) return null;

  const winner = gameState.winner;
  const isWinner = winner === myTeam;

  const handlePlayAgain = () => {
    disconnect();
    setLocation("/");
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 gap-6">
      <div className={cn(
        "w-24 h-24 rounded-full flex items-center justify-center",
        winner === "amber" ? "bg-amber-500/20" : "bg-blue-500/20"
      )}>
        <Trophy className={cn(
          "h-12 w-12",
          winner === "amber" ? "text-amber-500" : "text-blue-500"
        )} />
      </div>

      <div className="text-center">
        <h1 className={cn(
          "text-3xl font-bold mb-2",
          winner === "amber" ? "text-amber-500" : "text-blue-500"
        )}>
          Team {winner === "amber" ? "Amber" : "Blue"} Wins!
        </h1>
        <p className="text-muted-foreground">
          {isWinner 
            ? "Congratulations! Your team successfully cracked the code!" 
            : "Better luck next time!"}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 w-full max-w-md">
        <Card className={cn(
          "border-2",
          winner === "amber" ? "border-amber-500" : "border-amber-500/30"
        )}>
          <CardHeader className="pb-2 team-amber">
            <CardTitle className="text-white text-sm text-center">Team Amber</CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">White Tokens</span>
              <div className="flex gap-1">
                {Array.from({ length: 2 }).map((_, i) => (
                  <div
                    key={i}
                    className={cn(
                      "w-4 h-4 rounded-full border-2",
                      i < gameState.teams.amber.whiteTokens 
                        ? "bg-white border-gray-300" 
                        : "border-gray-300/30"
                    )}
                  />
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Black Tokens</span>
              <div className="flex gap-1">
                {Array.from({ length: 2 }).map((_, i) => (
                  <div
                    key={i}
                    className={cn(
                      "w-4 h-4 rounded-full border-2",
                      i < gameState.teams.amber.blackTokens 
                        ? "bg-gray-900 border-gray-700" 
                        : "border-gray-700/30"
                    )}
                  />
                ))}
              </div>
            </div>
            <div className="text-center text-sm text-muted-foreground pt-2 border-t">
              {gameState.teams.amber.history.length} rounds played
            </div>
          </CardContent>
        </Card>

        <Card className={cn(
          "border-2",
          winner === "blue" ? "border-blue-500" : "border-blue-500/30"
        )}>
          <CardHeader className="pb-2 team-blue">
            <CardTitle className="text-white text-sm text-center">Team Blue</CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">White Tokens</span>
              <div className="flex gap-1">
                {Array.from({ length: 2 }).map((_, i) => (
                  <div
                    key={i}
                    className={cn(
                      "w-4 h-4 rounded-full border-2",
                      i < gameState.teams.blue.whiteTokens 
                        ? "bg-white border-gray-300" 
                        : "border-gray-300/30"
                    )}
                  />
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Black Tokens</span>
              <div className="flex gap-1">
                {Array.from({ length: 2 }).map((_, i) => (
                  <div
                    key={i}
                    className={cn(
                      "w-4 h-4 rounded-full border-2",
                      i < gameState.teams.blue.blackTokens 
                        ? "bg-gray-900 border-gray-700" 
                        : "border-gray-700/30"
                    )}
                  />
                ))}
              </div>
            </div>
            <div className="text-center text-sm text-muted-foreground pt-2 border-t">
              {gameState.teams.blue.history.length} rounds played
            </div>
          </CardContent>
        </Card>
      </div>

      <Button
        size="lg"
        onClick={handlePlayAgain}
        className="w-full max-w-md"
        data-testid="button-play-again"
      >
        <Home className="h-5 w-5 mr-2" />
        Back to Home
      </Button>
    </div>
  );
}
