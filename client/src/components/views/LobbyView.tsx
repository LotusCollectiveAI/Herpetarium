import { useGame } from "@/lib/gameContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { AIPlayerButton } from "@/components/AIPlayerButton";
import { Users, Play, X, Copy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { AIPlayerConfig } from "@shared/schema";

export function LobbyView() {
  const { gameState, isHost, sendMessage, playerId } = useGame();
  const { toast } = useToast();

  if (!gameState) return null;

  const handleAddAI = (config: AIPlayerConfig) => {
    sendMessage({ type: "add_ai", provider: config.provider, config });
  };

  const handleRemovePlayer = (id: string) => {
    sendMessage({ type: "remove_player", playerId: id });
  };

  const handleStartGame = () => {
    sendMessage({ type: "start_game" });
  };

  const copyGameCode = async () => {
    try {
      await navigator.clipboard.writeText(gameState.id);
      toast({
        title: "Game code copied!",
        description: "Share this code with your friends.",
      });
    } catch {
      toast({
        title: "Game Code",
        description: gameState.id,
      });
    }
  };

  const canStart = gameState.players.length >= 2;

  return (
    <div className="flex-1 flex flex-col p-4 gap-4 overflow-auto">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Game Lobby
          </CardTitle>
          <CardDescription>
            Waiting for players to join...
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-3 bg-muted rounded-lg mb-4">
            <div>
              <p className="text-sm text-muted-foreground">Game Code</p>
              <p className="font-mono text-2xl font-bold tracking-widest">{gameState.id}</p>
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={copyGameCode}
              data-testid="button-copy-code"
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">
              Players ({gameState.players.length}/4)
            </p>
            <div className="space-y-2">
              {gameState.players.map((player) => (
                <div
                  key={player.id}
                  className={cn(
                    "flex items-center justify-between p-3 rounded-lg border",
                    player.id === gameState.hostId && "bg-primary/5 border-primary/30"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <PlayerAvatar player={player} isCurrentPlayer={player.id === playerId} />
                    <div className="flex items-center gap-2">
                      {player.id === gameState.hostId && (
                        <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded">
                          Host
                        </span>
                      )}
                      {player.isAI && player.aiConfig && (
                        <span className="text-xs text-muted-foreground">
                          {player.aiConfig.promptStrategy !== "default" ? `${player.aiConfig.promptStrategy}` : ""}
                        </span>
                      )}
                    </div>
                  </div>
                  {isHost && player.id !== playerId && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemovePlayer(player.id)}
                      data-testid={`button-remove-${player.id}`}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {isHost && gameState.players.length < 4 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Add AI Players</CardTitle>
            <CardDescription>
              Play with AI opponents — choose model, strategy, and timeout
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <AIPlayerButton provider="chatgpt" onAdd={handleAddAI} />
              <AIPlayerButton provider="claude" onAdd={handleAddAI} />
              <AIPlayerButton provider="gemini" onAdd={handleAddAI} />
            </div>
          </CardContent>
        </Card>
      )}

      {isHost && (
        <Button
          size="lg"
          onClick={handleStartGame}
          disabled={!canStart}
          className="w-full"
          data-testid="button-start-game"
        >
          <Play className="h-5 w-5 mr-2" />
          {canStart ? "Start Game" : `Need ${2 - gameState.players.length} more players`}
        </Button>
      )}

      {!isHost && (
        <div className="text-center text-muted-foreground text-sm">
          Waiting for host to start the game...
        </div>
      )}
    </div>
  );
}
