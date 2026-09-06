import { useGame } from "@/lib/gameContext";
import { GameHeader } from "@/components/GameHeader";
import { TeamRosters } from "@/components/ScoreBoard";
import { ClueHistoryPanel } from "@/components/ClueHistoryPanel";
import { GameHistoryPanel } from "@/components/GameHistoryPanel";
import { PhaseAnnouncement } from "@/components/PhaseAnnouncement";
import { LobbyView } from "@/components/views/LobbyView";
import { TeamSetupView } from "@/components/views/TeamSetupView";
import { GivingCluesView } from "@/components/views/GivingCluesView";
import { GuessingView } from "@/components/views/GuessingView";
import { InterceptingView } from "@/components/views/InterceptingView";
import { RoundResultsView } from "@/components/views/RoundResultsView";
import { GameOverView } from "@/components/views/GameOverView";
import { AlertTriangle } from "lucide-react";
import type { GamePhase } from "@shared/schema";

// The arrangement of a game screen: which phase view is showing, and what
// sits around it.
//
// Shared by the live /game/:id route and the /dev/preview sandbox. Both
// supply a GameContext -- one from a WebSocket, one from a hand-built
// GameState -- and everything below reads from it, so neither page needs
// to know which it is. It exists because those two used to keep their own
// copies of this layout and the phase switch, and the sandbox drifted
// silently: it kept rendering the rosters inside the header after the real
// page moved them out, and never picked up the history panel at all.
// Nothing type-checks that two hand-maintained layouts agree.

function PhaseView({ phase }: { phase: GamePhase }) {
  switch (phase) {
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
}

export function GameShell({ gameId }: { gameId: string }) {
  const { gameState, playerId, myTeam, aiFallback, clueError, phaseAnnouncement } = useGame();

  if (!gameState) return null;

  // Before teams are settled there is no score to show and no roster worth
  // pinning, so the board and the history panels stay out of the way.
  const inPlay = gameState.phase !== "lobby" && gameState.phase !== "team_setup";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <GameHeader gameId={gameId} />

      {phaseAnnouncement && (
        <PhaseAnnouncement
          phase={phaseAnnouncement.phase}
          round={phaseAnnouncement.round}
          myTeam={myTeam}
        />
      )}

      {(aiFallback || clueError) && (
        <div className="px-4 pt-2" data-testid="notification-banner">
          {aiFallback && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-yellow-700 dark:text-yellow-400 text-sm" data-testid="text-ai-fallback">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {aiFallback}
            </div>
          )}
          {clueError && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-400 text-sm mt-2" data-testid="text-clue-error">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {clueError}
            </div>
          )}
        </div>
      )}

      {/* Below the sticky header rather than inside it, so the rosters
          scroll out of the way while the round and tokens stay pinned. */}
      {inPlay && (
        <div className="px-2 pt-2">
          <TeamRosters gameState={gameState} playerId={playerId} />
        </div>
      )}

      <main className="flex-1 flex flex-col overflow-hidden">
        <PhaseView phase={gameState.phase} />
      </main>

      {inPlay && (
        <>
          <ClueHistoryPanel />
          <GameHistoryPanel />
        </>
      )}
    </div>
  );
}
