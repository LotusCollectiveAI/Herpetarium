import { useGame } from "@/lib/gameContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { cn } from "@/lib/utils";
import { ArrowLeftRight, Play, X } from "lucide-react";
import { MIN_GAME_PLAYERS, MIN_TEAM_PLAYERS, MAX_TEAM_PLAYERS } from "@shared/schema";
import type { Player } from "@shared/schema";

type Team = "amber" | "blue";

export function TeamSetupView() {
  const { gameState, playerId, myTeam, isHost, sendMessage } = useGame();

  if (!gameState) return null;

  const amberPlayers = gameState.players.filter(p => p.team === "amber");
  const bluePlayers = gameState.players.filter(p => p.team === "blue");
  const unassigned = gameState.players.filter(p => p.team === null);

  const handleJoinTeam = (team: Team) => {
    sendMessage({ type: "join_team", team });
  };

  const assignAi = (aiPlayerId: string, team: Team | null) => {
    sendMessage({ type: "assign_ai_team", playerId: aiPlayerId, team });
  };

  const teamFull = { amber: amberPlayers.length >= MAX_TEAM_PLAYERS, blue: bluePlayers.length >= MAX_TEAM_PLAYERS };

  // Bots are the only players the host places: humans pick for themselves,
  // so their rows stay untouched.
  const renderTeamMember = (player: Player, team: Team) => {
    const other: Team = team === "amber" ? "blue" : "amber";
    return (
      <div key={player.id} className="flex items-center gap-1">
        <div className="min-w-0 flex-1">
          <PlayerAvatar player={player} size="sm" isCurrentPlayer={player.id === playerId} />
        </div>
        {isHost && player.isAI && (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              disabled={teamFull[other]}
              title={teamFull[other] ? `Team ${other === "amber" ? "Amber" : "Blue"} is full` : `Move to ${other === "amber" ? "Amber" : "Blue"}`}
              onClick={() => assignAi(player.id, other)}
              data-testid={`button-move-${player.id}`}
            >
              <ArrowLeftRight className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              title="Unassign (let the teams balance automatically)"
              onClick={() => assignAi(player.id, null)}
              data-testid={`button-unassign-${player.id}`}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
      </div>
    );
  };

  const currentPlayer = gameState.players.find(p => p.id === playerId);
  const isHuman = currentPlayer && !currentPlayer.isAI;

  return (
    <div className="flex-1 flex flex-col p-4 gap-4 overflow-auto">
      <div className="text-center">
        <h2 className="text-xl font-bold">Choose Your Team</h2>
        <p className="text-muted-foreground text-sm">
          Each team needs {MIN_TEAM_PLAYERS}-{MAX_TEAM_PLAYERS} players to start
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
              {amberPlayers.length >= MAX_TEAM_PLAYERS && " (Full)"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2 min-h-24">
              {amberPlayers.map((player) => renderTeamMember(player, "amber"))}
              {amberPlayers.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No players yet
                </p>
              )}
            </div>
            {isHuman && myTeam !== "amber" && amberPlayers.length < MAX_TEAM_PLAYERS && (
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
              {bluePlayers.length >= MAX_TEAM_PLAYERS && " (Full)"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2 min-h-24">
              {bluePlayers.map((player) => renderTeamMember(player, "blue"))}
              {bluePlayers.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No players yet
                </p>
              )}
            </div>
            {isHuman && myTeam !== "blue" && bluePlayers.length < MAX_TEAM_PLAYERS && (
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
            {isHost && unassigned.some(p => p.isAI) && (
              <CardDescription>
                Place AI players yourself, or leave them for the teams to balance automatically.
              </CardDescription>
            )}
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {unassigned.map((player) => (
                <div key={player.id} className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <PlayerAvatar player={player} size="sm" isCurrentPlayer={player.id === playerId} />
                  </div>
                  {isHost && player.isAI && (
                    <div className="flex shrink-0 gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 border-amber-500/50 px-2 text-xs hover:bg-amber-500/10"
                        disabled={teamFull.amber}
                        title={teamFull.amber ? "Team Amber is full" : "Assign to Amber"}
                        onClick={() => assignAi(player.id, "amber")}
                        data-testid={`button-assign-amber-${player.id}`}
                      >
                        Amber
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 border-blue-500/50 px-2 text-xs hover:bg-blue-500/10"
                        disabled={teamFull.blue}
                        title={teamFull.blue ? "Team Blue is full" : "Assign to Blue"}
                        onClick={() => assignAi(player.id, "blue")}
                        data-testid={`button-assign-blue-${player.id}`}
                      >
                        Blue
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {isHost && (
        <div className="mt-4">
          {(() => {
            const totalPlayers = gameState.players.length;
            const assignedPlayers = amberPlayers.length + bluePlayers.length;
            let projectedAmberCount = amberPlayers.length;
            let projectedBlueCount = bluePlayers.length;

            // Match the server's automatic balancing so the button only enables
            // when the resulting teams will both have enough players.
            for (const _player of unassigned) {
              if (projectedBlueCount < projectedAmberCount) {
                projectedBlueCount++;
              } else if (projectedAmberCount < projectedBlueCount) {
                projectedAmberCount++;
              } else {
                projectedBlueCount++;
              }
            }

            const needsTeamChoice = assignedPlayers === 0;
            const needsMorePlayers = totalPlayers < MIN_GAME_PLAYERS;
            const teamsHaveEnoughPlayers =
              projectedAmberCount >= MIN_TEAM_PLAYERS &&
              projectedBlueCount >= MIN_TEAM_PLAYERS;
            const canStart = !needsMorePlayers && !needsTeamChoice && teamsHaveEnoughPlayers;
            
            return (
              <>
                <Button
                  className="w-full"
                  size="lg"
                  disabled={!canStart}
                  onClick={() => sendMessage({ type: "confirm_teams" })}
                  data-testid="button-start-round"
                >
                  <Play className="w-4 h-4 mr-2" />
                  Start Round 1
                </Button>
                {!canStart && (
                  <p className="text-center text-sm text-muted-foreground mt-2">
                    {needsMorePlayers
                      ? `Need at least ${MIN_GAME_PLAYERS} players`
                      : needsTeamChoice
                      ? "Pick a team to continue"
                      : `Each team needs at least ${MIN_TEAM_PLAYERS} players`}
                  </p>
                )}
                {canStart && unassigned.length > 0 && (
                  <p className="text-center text-sm text-muted-foreground mt-2">
                    Unassigned players will be assigned automatically to balance the teams
                  </p>
                )}
              </>
            );
          })()}
        </div>
      )}

      {!isHost && (
        <div className="text-center text-sm text-muted-foreground">
          <p>Waiting for host to start the round...</p>
        </div>
      )}
    </div>
  );
}
