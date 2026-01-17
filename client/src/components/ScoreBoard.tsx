import { cn } from "@/lib/utils";
import type { TeamState } from "@shared/schema";

interface ScoreBoardProps {
  amberState: TeamState;
  blueState: TeamState;
  round: number;
}

function Token({ type, count }: { type: "white" | "black"; count: number }) {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: 2 }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "w-5 h-5 rounded-full transition-all",
            type === "white" 
              ? "bg-white border-2 border-gray-300 dark:border-gray-500" 
              : "bg-gray-900 border-2 border-gray-700 dark:bg-gray-800",
            i < count ? "opacity-100 shadow-md" : "opacity-20"
          )}
          data-testid={`token-${type}-${i}`}
        />
      ))}
    </div>
  );
}

export function ScoreBoard({ amberState, blueState, round }: ScoreBoardProps) {
  return (
    <div className="flex flex-col gap-2 p-3 rounded-lg bg-card border">
      <div className="text-center text-sm text-muted-foreground font-medium">
        Round {round}
      </div>
      
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-amber-500" />
            <span className="text-sm font-semibold">Amber</span>
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground w-12">Correct:</span>
              <Token type="white" count={amberState.whiteTokens} />
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground w-12">Intercept:</span>
              <Token type="black" count={amberState.blackTokens} />
            </div>
          </div>
        </div>

        <div className="h-12 w-px bg-border" />

        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-blue-500" />
            <span className="text-sm font-semibold">Blue</span>
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground w-12">Correct:</span>
              <Token type="white" count={blueState.whiteTokens} />
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground w-12">Intercept:</span>
              <Token type="black" count={blueState.blackTokens} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
