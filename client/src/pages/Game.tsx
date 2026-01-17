import { useEffect } from "react";
import { useParams } from "wouter";
import { useGame } from "@/lib/gameContext";
import { GameHeader } from "@/components/GameHeader";
import { LobbyView } from "@/components/views/LobbyView";
import { TeamSetupView } from "@/components/views/TeamSetupView";
import { GivingCluesView } from "@/components/views/GivingCluesView";
import { GuessingView } from "@/components/views/GuessingView";
import { InterceptingView } from "@/components/views/InterceptingView";
import { RoundResultsView } from "@/components/views/RoundResultsView";
import { GameOverView } from "@/components/views/GameOverView";
import { Loader2 } from "lucide-react";

export default function Game() {
  const params = useParams<{ id: string }>();
  const gameId = params.id || "";
  const { gameState, isConnected, connect } = useGame();

  useEffect(() => {
    const playerName = sessionStorage.getItem("playerName") || `Player${Math.random().toString(36).slice(2, 6)}`;
    if (gameId) {
      connect(gameId, playerName);
    }
  }, [gameId, connect]);

  if (!isConnected || !gameState) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Connecting to game...</p>
        </div>
      </div>
    );
  }

  const renderPhaseView = () => {
    switch (gameState.phase) {
      case "lobby":
        return <LobbyView />;
      case "team_setup":
        return <TeamSetupView />;
      case "giving_clues":
        return <GivingCluesView />;
      case "own_team_guessing":
        return <GuessingView />;
      case "opponent_intercepting":
        return <InterceptingView />;
      case "round_results":
        return <RoundResultsView />;
      case "game_over":
        return <GameOverView />;
      default:
        return <LobbyView />;
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <GameHeader gameId={gameId} />
      <main className="flex-1 flex flex-col overflow-hidden">
        {renderPhaseView()}
      </main>
    </div>
  );
}
