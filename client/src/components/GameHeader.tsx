import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "./ThemeToggle";
import { ScoreBoard } from "./ScoreBoard";
import { AIThinkingIndicator } from "./AIThinkingIndicator";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Share2 } from "lucide-react";
import { useGame } from "@/lib/gameContext";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import type { GameState } from "@shared/schema";

interface GameHeaderProps {
  gameId: string;
}

// Scrolled past this, the roster and full token board give way to a single
// summary row; back above the lower mark, they come back. The gap between
// the two is hysteresis -- with one shared threshold, the header would
// flip state on every pixel of scroll jitter.
const CONDENSE_AT = 96;
// Deliberately near zero rather than a mirror of CONDENSE_AT: collapsing
// shortens the page, and the browser then clamps scrollY down by an amount
// that isn't predictable in advance. Anything higher risks landing under
// the threshold as a result of the collapse itself, so the full board comes
// back only on a return to the top.
const EXPAND_BELOW = 4;
// Roughly what the header measures once collapsed: the control bar plus the
// summary row. Only used to predict whether collapsing would leave the page
// scrollable, so an approximation is fine.
const CONDENSED_HEADER_H = 88;
// Slightly longer than the collapse animation, below.
const SETTLE_MS = 260;

// Swaps the detailed board for a summary row once the page is scrolled.
//
// The subtlety is that the header scrolls with the document, so collapsing
// it removes its height from the page. On a short page that destroys the
// very scroll offset that triggered the collapse: the browser clamps
// scrollY back to 0, the header expands, the scroll range returns, and it
// oscillates. Two things are needed to keep it steady. The deciding
// measurement has to be independent of the header's current height --
// reading the live scroll range means the value shrinks as the header
// collapses, which is its own feedback loop -- so it measures the document
// minus the header, which holds still in either state. And state is frozen
// while the collapse animates, because the shrinking page clamps scrollY
// downwards on every frame of it; left unfrozen, that slide drags the
// offset back under the expand threshold and undoes the collapse.
function useCondensedOnScroll(headerRef: React.RefObject<HTMLElement>, enabled: boolean) {
  const [condensed, setCondensed] = useState(false);
  const settleUntil = useRef(0);

  useEffect(() => {
    if (!enabled) {
      setCondensed(false);
      return;
    }

    const update = () => {
      const header = headerRef.current;
      if (!header) return;
      if (performance.now() < settleUntil.current) return;

      const doc = document.documentElement;
      const contentHeight = doc.scrollHeight - header.offsetHeight;
      // Would the page still be scrolled past the trigger once collapsed?
      // If not, leave the full header alone -- on a page barely taller than
      // the viewport there was nothing to reclaim anyway.
      const staysScrollable =
        contentHeight + CONDENSED_HEADER_H - doc.clientHeight > CONDENSE_AT;
      const y = window.scrollY;

      setCondensed(prev => {
        const next = prev ? y >= EXPAND_BELOW : y > CONDENSE_AT && staysScrollable;
        if (next !== prev) settleUntil.current = performance.now() + SETTLE_MS;
        return next;
      });
    };

    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [headerRef, enabled]);

  return condensed;
}

function MiniTokens({ type, count }: { type: "white" | "black"; count: number }) {
  return (
    <span className="flex items-center gap-0.5">
      {Array.from({ length: 2 }).map((_, i) => (
        <span
          key={i}
          className={cn(
            "h-2.5 w-2.5 rounded-full border",
            i < count
              ? type === "white"
                ? "border-white bg-white"
                : "border-gray-400 bg-gray-950 dark:bg-black"
              : "border-dashed border-muted-foreground/40 bg-transparent",
          )}
        />
      ))}
    </span>
  );
}

function CondensedBoard({ gameState }: { gameState: GameState }) {
  const { amber, blue } = gameState.teams;

  return (
    <div
      className="flex items-center justify-between gap-2 px-3 py-1.5"
      data-testid="scoreboard-condensed"
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-amber-500" />
        <span className="truncate text-xs font-semibold">Amber</span>
        <MiniTokens type="white" count={amber.whiteTokens} />
        <MiniTokens type="black" count={amber.blackTokens} />
      </div>

      <span className="shrink-0 text-xs font-medium text-muted-foreground">
        Round {gameState.round}
      </span>

      <div className="flex min-w-0 items-center justify-end gap-1.5">
        <MiniTokens type="black" count={blue.blackTokens} />
        <MiniTokens type="white" count={blue.whiteTokens} />
        <span className="truncate text-xs font-semibold">Blue</span>
        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-blue-500" />
      </div>
    </div>
  );
}

export function GameHeader({ gameId }: GameHeaderProps) {
  const { gameState, playerId, aiThinking, aiThinkingStartTime } = useGame();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const headerRef = useRef<HTMLElement>(null);

  const showsBoard = !!gameState && gameState.phase !== "lobby" && gameState.phase !== "team_setup";
  const condensed = useCondensedOnScroll(headerRef, showsBoard);

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
    <header
      ref={headerRef}
      className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b"
      data-condensed={showsBoard ? condensed : undefined}
      data-testid="game-header"
    >
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
            <AIThinkingIndicator aiName={aiThinking} context={thinkingContext as any} size="sm" startTime={aiThinkingStartTime} />
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

      {showsBoard && gameState && (
        <>
          <div
            className={cn(
              "overflow-hidden transition-[max-height,opacity] duration-200 ease-out",
              condensed ? "max-h-0 opacity-0" : "max-h-[32rem] opacity-100",
            )}
          >
            <div className="px-2 pb-2" data-testid="scoreboard-full">
              <ScoreBoard gameState={gameState} playerId={playerId} />
            </div>
          </div>

          {/* Opaque, unlike the header's translucent backdrop: this bar is
              thin enough that content sliding underneath would otherwise
              ghost through the remaining 5%. */}
          <div
            className={cn(
              "overflow-hidden bg-background transition-[max-height,opacity] duration-200 ease-out",
              condensed ? "max-h-12 opacity-100" : "max-h-0 opacity-0",
            )}
          >
            <CondensedBoard gameState={gameState} />
          </div>
        </>
      )}
    </header>
  );
}
