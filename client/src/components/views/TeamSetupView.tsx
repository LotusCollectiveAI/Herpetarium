import { useGame } from "@/lib/gameContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { cn } from "@/lib/utils";

export function TeamSetupView() {
  const { gameState, playerId, myTeam, sendMessage } = useGame();

  if (!gameState) return null;

  const amberPlayers = gameState.players.filter(p => p.team === "amber");
  const bluePlayers = gameState.players.filter(p => p.team === "blue");
  const unassigned = gameState.players.filter(p => p.team === null);

  const handleJoinTeam = (team: "amber" | "blue") => {
    sendMessage({ type: "join_team", team });
  };

  const currentPlayer = gameState.players.find(p => p.id === playerId);
  const isHuman = currentPlayer && !currentPlayer.isAI;

  return (
    <div className="flex-1 flex flex-col p-4 gap-4 overflow-auto">
      <div className="text-center">
        <h2 className="text-xl font-bold">Choose Your Team</h2>
        <p className="text-muted-foreground text-sm">
          Each team needs at least 1 player to start
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card className={cn("border-2", myTeam === "amber" && "border-amber-500")}>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-amber-500" />
              <CardTitle className="text-lg">Team Amber</CardTitle>
            </div>
            <CardDescription>
              {amberPlayers.length} player{amberPlayers.length !== 1 && "s"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2 min-h-24">
              {amberPlayers.map((player) => (
                <PlayerAvatar 
                  key={player.id} 
                  player={player} 
                  size="sm"
                  isCurrentPlayer={player.id === playerId}
                />
              ))}
              {amberPlayers.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No players yet
                </p>
              )}
            </div>
            {isHuman && myTeam !== "amber" && (
              <Button
                variant="outline"
                className="w-full border-amber-500/50 hover:bg-amber-500/10"
                onClick={() => handleJoinTeam("amber")}
                data-testid="button-join-amber"
              >
                Join Amber
              </Button>
            )}
          </CardContent>
        </Card>

        <Card className={cn("border-2", myTeam === "blue" && "border-blue-500")}>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-blue-500" />
              <CardTitle className="text-lg">Team Blue</CardTitle>
            </div>
            <CardDescription>
              {bluePlayers.length} player{bluePlayers.length !== 1 && "s"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2 min-h-24">
              {bluePlayers.map((player) => (
                <PlayerAvatar 
                  key={player.id} 
                  player={player} 
                  size="sm"
                  isCurrentPlayer={player.id === playerId}
                />
              ))}
              {bluePlayers.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No players yet
                </p>
              )}
            </div>
            {isHuman && myTeam !== "blue" && (
              <Button
                variant="outline"
                className="w-full border-blue-500/50 hover:bg-blue-500/10"
                onClick={() => handleJoinTeam("blue")}
                data-testid="button-join-blue"
              >
                Join Blue
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      {unassigned.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Unassigned Players</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {unassigned.map((player) => (
                <PlayerAvatar 
                  key={player.id} 
                  player={player} 
                  size="sm"
                  isCurrentPlayer={player.id === playerId}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="text-center text-sm text-muted-foreground">
        {amberPlayers.length === 0 || bluePlayers.length === 0 ? (
          <p>Both teams need at least 1 player to start</p>
        ) : (
          <p>Game will start automatically when teams are ready...</p>
        )}
      </div>
    </div>
  );
}
