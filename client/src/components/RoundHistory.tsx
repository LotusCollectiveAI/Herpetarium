import { cn } from "@/lib/utils";
import { Check, X, Target } from "lucide-react";
import type { RoundHistory as RoundHistoryType } from "@shared/schema";

interface RoundHistoryProps {
  history: RoundHistoryType[];
  team: "amber" | "blue";
}

export function RoundHistory({ history, team }: RoundHistoryProps) {
  if (history.length === 0) {
    return (
      <div className="text-center text-sm text-muted-foreground py-4">
        No rounds played yet
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {history.map((round) => (
        <div
          key={round.round}
          className={cn(
            "p-3 rounded-lg border",
            team === "amber" ? "border-amber-500/20" : "border-blue-500/20"
          )}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground">
              Round {round.round}
            </span>
            <div className="flex items-center gap-2">
              {round.ownTeamCorrect && (
                <div className="flex items-center gap-1 text-xs text-emerald-500">
                  <Check className="h-3 w-3" />
                  <span>Correct</span>
                </div>
              )}
              {round.intercepted && (
                <div className="flex items-center gap-1 text-xs text-red-500">
                  <Target className="h-3 w-3" />
                  <span>Intercepted</span>
                </div>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs text-muted-foreground">Code:</span>
            {round.targetCode.map((num, i) => (
              <span
                key={i}
                className={cn(
                  "w-5 h-5 rounded flex items-center justify-center text-xs font-bold",
                  team === "amber" ? "bg-amber-500/20 text-amber-600" : "bg-blue-500/20 text-blue-600"
                )}
              >
                {num}
              </span>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            {round.clues.map((clue, i) => (
              <span
                key={i}
                className="text-xs font-mono uppercase bg-muted px-2 py-1 rounded"
              >
                {clue}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
