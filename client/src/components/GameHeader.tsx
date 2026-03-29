import { cn } from "@/lib/utils";
import { ThemeToggle } from "./ThemeToggle";
import { ScoreBoard } from "./ScoreBoard";
import { AIThinkingIndicator } from "./AIThinkingIndicator";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Share2 } from "lucide-react";
import { useGame } from "@/lib/gameContext";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

interface GameHeaderProps {
  gameId: string;
}

export function GameHeader({ gameId }: GameHeaderProps) {
  const { gameState, aiThinking } = useGame();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const handleShare = async () => {
    const url = `${window.location.origin}/game/${gameId}`;
    try {
      await navigator.clipboard.writeText(url);
      toast({
        title: "Link copied!",
        description: "Share this link with your friends to join the game.",
      });
    } catch {
      toast({
        title: "Share this link",
        description: url,
      });
    }
  };

  const handleBack = () => {
    setLocation("/");
  };

  const thinkingContext = gameState?.phase === "giving_clues" ? "clues" 
    : gameState?.phase === "own_team_guessing" ? "guess" 
    : gameState?.phase === "opponent_intercepting" ? "intercept" 
    : "generic";

  return (
    <header className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b">
      <div className="flex items-center justify-between p-2 gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={handleBack}
          data-testid="button-back"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>

        <div className="flex-1 flex items-center justify-center">
          {aiThinking && (
            <AIThinkingIndicator aiName={aiThinking} context={thinkingContext as any} size="sm" />
          )}
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleShare}
            data-testid="button-share"
          >
            <Share2 className="h-5 w-5" />
          </Button>
          <ThemeToggle />
        </div>
      </div>

      {gameState && gameState.phase !== "lobby" && gameState.phase !== "team_setup" && (
        <div className="px-2 pb-2">
          <ScoreBoard
            amberState={gameState.teams.amber}
            blueState={gameState.teams.blue}
            round={gameState.round}
          />
        </div>
      )}
    </header>
  );
}
