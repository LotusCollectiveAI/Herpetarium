import { useState } from "react";
import { useGame } from "@/lib/gameContext";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Token } from "@/components/ScoreBoard";
import { Trophy, Home, RotateCcw, Loader2, History } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";

export function GameOverView() {
  const { gameState, myTeam, isHost, sendMessage, disconnect } = useGame();
  const [, setLocation] = useLocation();
  const [isCreating, setIsCreating] = useState(false);

  if (!gameState) return null;

  const winner = gameState.winner;
  const isWinner = winner === myTeam;

  const handlePlayAgain = () => {
    setIsCreating(true);
    sendMessage({ type: "new_game_same_players" });
  };

  const handleBackToHome = () => {
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
        )} data-testid="text-winner">
          Team {winner === "amber" ? "Amber" : "Blue"} Wins!
        </h1>
        <p className="text-muted-foreground" data-testid="text-winner-message">
          {isWinner 
            ? "Congratulations! Your team successfully cracked the code!" 
            : "Better luck next time!"}
        </p>
      </div>

      <div className="w-full max-w-md flex flex-col gap-2 p-3 rounded-lg bg-card border">
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-2 gap-y-1">
          <div className="flex justify-end">
            <Token type="white" count={gameState.teams.amber.whiteTokens} reverseFill />
          </div>
          <span className="text-xs sm:text-sm text-muted-foreground text-center leading-tight">
            Miscommunications
          </span>
          <div className="flex justify-start">
            <Token type="white" count={gameState.teams.blue.whiteTokens} />
          </div>

          <div className="flex justify-end">
            <Token type="black" count={gameState.teams.amber.blackTokens} reverseFill />
          </div>
          <span className="text-xs sm:text-sm text-muted-foreground text-center leading-tight">
            Interceptions
          </span>
          <div className="flex justify-start">
            <Token type="black" count={gameState.teams.blue.blackTokens} />
          </div>
        </div>

        <div className="text-center text-xs text-muted-foreground pt-1 border-t">
          {gameState.teams.amber.history.length} rounds played
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 w-full max-w-md">
        <Card className={cn(
          "border-2",
          winner === "amber" ? "border-amber-500" : "border-amber-500/30"
        )}>
          <CardHeader className="pb-2 team-amber">
            <CardTitle className="text-white text-sm text-center">Team Amber</CardTitle>
          </CardHeader>
        </Card>

        <Card className={cn(
          "border-2",
          winner === "blue" ? "border-blue-500" : "border-blue-500/30"
        )}>
          <CardHeader className="pb-2 team-blue">
            <CardTitle className="text-white text-sm text-center">Team Blue</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="flex flex-col gap-3 w-full max-w-md">
        {isHost ? (
          <Button
            size="lg"
            onClick={handlePlayAgain}
            className="w-full"
            disabled={isCreating}
            data-testid="button-play-again"
          >
            {isCreating ? (
              <Loader2 className="h-5 w-5 mr-2 animate-spin" />
            ) : (
              <RotateCcw className="h-5 w-5 mr-2" />
            )}
            {isCreating ? "Creating new game..." : "Play Again (Same Players)"}
          </Button>
        ) : (
          <div className="text-center text-sm text-muted-foreground" data-testid="text-waiting-host">
            Waiting for host to start a new game...
          </div>
        )}
        <Button
          variant="outline"
          size="lg"
          onClick={() => setLocation(`/replay/${gameState.id}`)}
          className="w-full"
          data-testid="button-view-replay"
        >
          <History className="h-5 w-5 mr-2" />
          Watch Replay
        </Button>

        <Button
          variant="outline"
          size="lg"
          onClick={handleBackToHome}
          className="w-full"
          data-testid="button-back-home"
        >
          <Home className="h-5 w-5 mr-2" />
          Back to Home
        </Button>
      </div>
    </div>
  );
}
