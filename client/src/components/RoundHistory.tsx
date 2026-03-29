import { cn } from "@/lib/utils";
import { Check, X, Target } from "lucide-react";
import type { RoundHistory as RoundHistoryType } from "@shared/schema";

interface RoundHistoryProps {
  history: RoundHistoryType[];
  team: "amber" | "blue";
  columnar?: boolean;
}

function ColumnarView({ history, team }: { history: RoundHistoryType[]; team: "amber" | "blue" }) {
  const teamBorder = team === "amber" ? "border-amber-500/30" : "border-blue-500/30";
  const teamHeaderBg = team === "amber" ? "bg-amber-500/10 text-amber-700 dark:text-amber-400" : "bg-blue-500/10 text-blue-700 dark:text-blue-400";

  return (
    <div className="overflow-x-auto" data-testid="columnar-history">
      <table className={cn("w-full text-xs border-collapse border rounded", teamBorder)}>
        <thead>
          <tr>
            <th className={cn("px-2 py-1.5 text-left font-semibold border-b", teamBorder, teamHeaderBg)}>
              Round
            </th>
            {[1, 2, 3, 4].map(slot => (
              <th
                key={slot}
                className={cn("px-2 py-1.5 text-center font-semibold border-b border-l", teamBorder, teamHeaderBg)}
              >
                Slot {slot}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {history.map(round => {
            const cluesBySlot: (string | null)[] = [null, null, null, null];
            round.clues.forEach((clue, clueIndex) => {
              const slot = round.targetCode[clueIndex] - 1;
              cluesBySlot[slot] = clue;
            });

            return (
              <tr key={round.round} className="border-b last:border-b-0" data-testid={`history-row-${round.round}`}>
                <td className={cn("px-2 py-1.5 text-muted-foreground font-medium border-r", teamBorder)}>
                  R{round.round}
                </td>
                {cluesBySlot.map((clue, i) => (
                  <td
                    key={i}
                    className={cn(
                      "px-2 py-1.5 text-center border-l",
                      teamBorder,
                      clue ? "font-mono uppercase" : "text-muted-foreground"
                    )}
                    data-testid={`history-cell-r${round.round}-s${i + 1}`}
                  >
                    {clue || "—"}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function RoundHistory({ history, team, columnar = false }: RoundHistoryProps) {
  if (history.length === 0) {
    return (
      <div className="text-center text-sm text-muted-foreground py-4">
        No rounds played yet
      </div>
    );
  }

  if (columnar) {
    return <ColumnarView history={history} team={team} />;
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
