import { useEffect } from "react";
import { useParams } from "wouter";
import { useGame } from "@/lib/gameContext";
import { GameShell } from "@/components/GameShell";
import { Loader2 } from "lucide-react";

// Owns the connection: joins the game over the WebSocket and waits for the
// first state to arrive. The screen itself is GameShell, which the
// /dev/preview sandbox renders too.
export default function Game() {
  const params = useParams<{ id: string }>();
  const gameId = params.id || "";
  const { gameState, isConnected, connect, disconnect } = useGame();

  useEffect(() => {
    const playerName = sessionStorage.getItem("playerName") || `Player${Math.random().toString(36).slice(2, 6)}`;
    if (gameId) {
      connect(gameId, playerName);
    }

    return () => {
      disconnect();
    };
  }, [gameId, connect, disconnect]);

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

  return <GameShell gameId={gameId} />;
}
